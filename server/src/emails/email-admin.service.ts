import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as crypto from "crypto";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { QUEUE_JOB_STATE } from "../constants/domain-statuses";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { INBOX_MODES } from "../constants/query-limits";
import {
  DAYS,
  HOURS,
  HOURS_PER_DAY,
  SECONDS,
} from "../constants/time-constants";
import { ContactsService } from "../contacts/contacts.service";
import { EmailThread } from "../database/entities/email-thread.entity";
import { decryptContextValue } from "../encryption/encryption.helper";
import { getJobPriority } from "../queue/job-priorities";
import {
  BossDb,
  EMAIL_CONTROLLER_DEFAULTS,
  getBossDb,
} from "./email-controller.helpers";
import { EmailsService } from "./emails.service";
import { EmailRecipient } from "./interfaces/email-provider.interface";

type ValidMode =
  | typeof INBOX_MODES.TRIAGE
  | typeof INBOX_MODES.ACTION
  | typeof INBOX_MODES.FOLLOW_UP;
const VALID_MODES: readonly ValidMode[] = [
  INBOX_MODES.TRIAGE,
  INBOX_MODES.ACTION,
  INBOX_MODES.FOLLOW_UP,
];

@Injectable()
export class EmailAdminService {
  private readonly logger = new Logger(EmailAdminService.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly emailsService: EmailsService,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    private readonly blockedSendersService: BlockedSendersService,
    private readonly contactsService: ContactsService,
  ) {}

  async getEmailStats(userId: string, since: Date) {
    // JOIN user_contexts for category display name (fixes #1293 — no denorm column).
    const emailsPerDay = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .innerJoin("thread.emails", "email")
      .leftJoin("user_contexts", "uc", 'uc."contextId" = thread."categoryId"')
      .select("DATE(email.receivedAt)", "date")
      .addSelect("COUNT(DISTINCT email.id)", "count")
      .addSelect('uc."contextValue"', "category")
      .addSelect('thread."categoryId"', "categoryId")
      .where("thread.userId = :userId", { userId })
      .andWhere("email.receivedAt >= :since", { since })
      .groupBy("DATE(email.receivedAt)")
      .addGroupBy('thread."categoryId"')
      .addGroupBy('uc."contextValue"')
      .orderBy("DATE(email.receivedAt)", "ASC")
      .getRawMany();

    const replyTimesByCategory = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .innerJoin("thread.emails", "email")
      .leftJoin("user_contexts", "uc", 'uc."contextId" = thread."categoryId"')
      .select('uc."contextValue"', "category")
      .addSelect('thread."categoryId"', "categoryId")
      .addSelect("AVG(email.timeToReply)", "avgReplyTimeMinutes")
      .addSelect("MIN(email.timeToReply)", "minReplyTimeMinutes")
      .addSelect("MAX(email.timeToReply)", "maxReplyTimeMinutes")
      .addSelect("COUNT(email.id)", "repliedCount")
      .where("thread.userId = :userId", { userId })
      .andWhere("email.timeToReply IS NOT NULL")
      .andWhere("email.timeToReply > 0")
      .andWhere("email.receivedAt >= :since", { since })
      .groupBy('thread."categoryId"')
      .addGroupBy('uc."contextValue"')
      .getRawMany();

    const totalByCategory = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .innerJoin("thread.emails", "email")
      .leftJoin("user_contexts", "uc", 'uc."contextId" = thread."categoryId"')
      .select('uc."contextValue"', "category")
      .addSelect('thread."categoryId"', "categoryId")
      .addSelect("COUNT(DISTINCT email.id)", "total")
      .where("thread.userId = :userId", { userId })
      .andWhere("email.receivedAt >= :since", { since })
      .groupBy('thread."categoryId"')
      .addGroupBy('uc."contextValue"')
      .getRawMany();

    // Decrypt the encrypted contextValue — raw queries bypass TypeORM transformers.
    const decryptedEmailsPerDay = emailsPerDay.map((row) => ({
      ...row,
      category: decryptContextValue(row.category),
    }));
    const decryptedReplyTimesByCategory = replyTimesByCategory.map((row) => ({
      ...row,
      category: decryptContextValue(row.category),
    }));
    const decryptedTotalByCategory = totalByCategory.map((row) => ({
      ...row,
      category: decryptContextValue(row.category),
    }));

    return {
      emailsPerDay: decryptedEmailsPerDay,
      replyTimesByCategory: decryptedReplyTimesByCategory,
      totalByCategory: decryptedTotalByCategory,
    };
  }

  async getEmailThreadById(
    userId: string,
    threadId: string,
  ): Promise<EmailThread | null> {
    return this.emailThreadRepository.findOne({
      where: { id: threadId, userId },
    });
  }

  async blockEmailSender(
    userId: string,
    senderEmail: string,
    senderName: string | undefined,
    reason: string | undefined,
    blockDomain: boolean | undefined,
  ): Promise<void> {
    await this.blockedSendersService.blockSender(
      userId,
      senderEmail,
      senderName,
      reason,
      blockDomain,
    );
  }

  async trackEmailRecipients(
    userId: string,
    recipients: EmailRecipient[],
  ): Promise<void> {
    for (const recipient of recipients) {
      await this.contactsService.incrementContactFrequency(
        userId,
        recipient.email,
      );
    }
  }

  buildJobStatsDateFilter(range: string): string {
    if (range === "all") return "";
    const hoursMap: Record<string, number> = {
      "24h": HOURS_PER_DAY,
      "7d": HOURS.WEEK,
      "30d": DAYS.MONTH * HOURS_PER_DAY,
    };
    const hours = hoursMap[range] || HOURS_PER_DAY;
    return `AND createdon >= NOW() - INTERVAL '${hours} hours'`;
  }

  mergeQueueStatsRow(
    row: { jobType: string; state: string; count: string },
    statsByJobType: Record<
      string,
      {
        queued: number;
        active: number;
        retry: number;
        failed: number;
        completed: number;
        avgCompletionTimeMs: number | null;
      }
    >,
  ): void {
    const { jobType, state } = row;
    const count = parseInt(row.count, 10);
    if (!statsByJobType[jobType]) {
      statsByJobType[jobType] = {
        queued: 0,
        active: 0,
        retry: 0,
        failed: 0,
        completed: 0,
        avgCompletionTimeMs: null,
      };
    }
    if (state === QUEUE_JOB_STATE.CREATED)
      statsByJobType[jobType].queued = count;
    else if (state === QUEUE_JOB_STATE.ACTIVE)
      statsByJobType[jobType].active = count;
    else if (state === QUEUE_JOB_STATE.RETRY)
      statsByJobType[jobType].retry = count;
    else if (state === QUEUE_JOB_STATE.FAILED)
      statsByJobType[jobType].failed = count;
    else if (state === QUEUE_JOB_STATE.COMPLETED)
      statsByJobType[jobType].completed = count;
  }

  mergeArchiveStatsRow(
    row: {
      jobType: string;
      completedCount: string;
      avgCompletionTimeMs: string | null;
    },
    statsByJobType: Record<
      string,
      {
        queued: number;
        active: number;
        retry: number;
        failed: number;
        completed: number;
        avgCompletionTimeMs: number | null;
      }
    >,
  ): void {
    const { jobType } = row;
    if (!statsByJobType[jobType]) {
      statsByJobType[jobType] = {
        queued: 0,
        active: 0,
        retry: 0,
        failed: 0,
        completed: 0,
        avgCompletionTimeMs: null,
      };
    }
    statsByJobType[jobType].completed += parseInt(row.completedCount, 10);
    statsByJobType[jobType].avgCompletionTimeMs = row.avgCompletionTimeMs
      ? Math.round(parseFloat(row.avgCompletionTimeMs))
      : null;
  }

  async getJobStats(range: "24h" | "7d" | "30d" | "all" = "all"): Promise<{
    stats: Array<{
      jobType: string;
      queued: number;
      active: number;
      retry: number;
      failed: number;
      completed: number;
      avgCompletionTimeMs: number | null;
    }>;
    timestamp: string;
  }> {
    const db = getBossDb(this.boss);
    const dateFilter = this.buildJobStatsDateFilter(range);

    const [queueStats, archiveStats] = await Promise.all([
      db.executeSql(`
        SELECT name as "jobType", state, COUNT(*) as count
        FROM pgboss.job
        WHERE state IN ('created', 'retry', 'active', 'failed', 'completed')
          ${dateFilter}
        GROUP BY name, state ORDER BY name, state
      `),
      db.executeSql(`
        SELECT name as "jobType", COUNT(*) as "completedCount",
          AVG(EXTRACT(EPOCH FROM (completedon - createdon))) * 1000 as "avgCompletionTimeMs"
        FROM pgboss.archive
        WHERE completedon IS NOT NULL AND createdon IS NOT NULL AND completedon > createdon
          ${dateFilter}
        GROUP BY name ORDER BY name
      `),
    ]);

    const statsByJobType: Record<
      string,
      {
        queued: number;
        active: number;
        retry: number;
        failed: number;
        completed: number;
        avgCompletionTimeMs: number | null;
      }
    > = {};

    if (queueStats?.rows) {
      (
        queueStats.rows as Array<{
          jobType: string;
          state: string;
          count: string;
        }>
      ).forEach((row) => this.mergeQueueStatsRow(row, statsByJobType));
    }
    if (archiveStats?.rows) {
      (
        archiveStats.rows as Array<{
          jobType: string;
          completedCount: string;
          avgCompletionTimeMs: string | null;
        }>
      ).forEach((row) => this.mergeArchiveStatsRow(row, statsByJobType));
    }

    const statsArray = Object.entries(statsByJobType)
      .map(([jobType, stats]) => ({ jobType, ...stats }))
      .sort((itemA, itemB) => itemA.jobType.localeCompare(itemB.jobType));

    return { stats: statsArray, timestamp: new Date().toISOString() };
  }

  parseModes(modesParam?: string): ValidMode[] {
    if (!modesParam) return [...VALID_MODES];

    const requested = modesParam.split(",").map((match) => match.trim());
    const filtered = requested.filter((match): match is ValidMode =>
      VALID_MODES.includes(match as ValidMode),
    );

    return filtered.length > 0 ? filtered : [...VALID_MODES];
  }

  async queueBulkRecategorization(
    userId: string,
    modesParam?: string,
  ): Promise<{ message: string; queued: number; batchId: string | null }> {
    const modes = this.parseModes(modesParam);
    const allEmails = [];
    const seenIds = new Set<string>();

    for (const mode of modes) {
      const result = await this.emailsService.getInbox(userId, false, mode);
      for (const email of result.emails) {
        if (!seenIds.has(email.id)) {
          seenIds.add(email.id);
          allEmails.push(email);
        }
      }
    }

    if (allEmails.length === 0) {
      return {
        message: `No emails to recategorize in ${modes.join(" or ")}`,
        queued: 0,
        batchId: null,
      };
    }

    const batchId = crypto.randomUUID();
    let queued = 0;
    for (const email of allEmails) {
      const jobId = await this.boss.send(
        JOB_NAMES.REFINE_PRIORITY,
        {
          userId,
          emailId: email.id,
          forceRecalculate: true,
          recategorizeBatchId: batchId,
        },
        {
          priority: getJobPriority(JOB_NAMES.REFINE_PRIORITY, true),
          singletonKey: `recategorize-${email.id}`,
          singletonSeconds: SECONDS.MINUTE,
        },
      );
      if (jobId != null) queued++;
    }

    this.logger.log(
      `[Recategorize] Queued ${queued} recategorization jobs for userId: ${userId}, batchId: ${batchId}`,
    );

    return {
      message: `Queued ${queued} emails for recategorization`,
      queued,
      batchId,
    };
  }

  async getRecategorizationProgress(
    userId: string,
    batchId: string,
  ): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
  }> {
    if (!batchId) {
      return { total: 0, completed: 0, failed: 0, pending: 0 };
    }
    return this.queryRecategorizationProgress(userId, batchId);
  }

  /** True when the legacy `pgboss.archive` table still exists (pre-v11 pg-boss). */
  private async pgbossArchiveExists(db: BossDb): Promise<boolean> {
    try {
      const res = await db.executeSql(
        `SELECT to_regclass('pgboss.archive') AS t`,
      );
      const row = res?.rows?.[0] as { t?: unknown } | undefined;
      return !!row?.t;
    } catch {
      return false;
    }
  }

  private async queryRecategorizationProgress(
    userId: string,
    batchId: string,
  ): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
  }> {
    const db = getBossDb(this.boss);

    // pg-boss v11 (#2418) removed the `pgboss.archive` table, so the old query
    // that UNION-ed it threw — leaving the recategorisation progress UI stuck at
    // "0 of N" even though jobs were completing. Completed jobs stay in
    // `pgboss.job` (state='completed') for the life of the run, so query that;
    // include the archive only when it still exists (older pg-boss).
    const archiveExists = await this.pgbossArchiveExists(db);
    const archiveUnion = archiveExists
      ? `UNION ALL
        SELECT state::text, data->>'userId' as "userId"
        FROM pgboss.archive
        WHERE data->>'recategorizeBatchId' = $1 AND name = $3`
      : "";

    const result = await db.executeSql(
      `
      WITH all_jobs AS (
        SELECT state::text, data->>'userId' as "userId"
        FROM pgboss.job
        WHERE data->>'recategorizeBatchId' = $1 AND name = $3
        ${archiveUnion}
      )
      SELECT state, COUNT(*) as count
      FROM all_jobs
      WHERE "userId" = $2
      GROUP BY state
      `,
      [batchId, userId, JOB_NAMES.REFINE_PRIORITY],
    );

    const counts: Record<string, number> = {};
    if (result?.rows) {
      (result.rows as { state: string; count: string }[]).forEach((row) => {
        counts[row.state] = parseInt(row.count, 10);
      });
    }

    const completed = counts["completed"] ?? 0;
    const failed =
      (counts["failed"] ?? 0) +
      (counts["expired"] ?? 0) +
      (counts["cancelled"] ?? 0);
    const pending =
      (counts["created"] ?? 0) +
      (counts["retry"] ?? 0) +
      (counts["active"] ?? 0);
    const total = completed + failed + pending;

    this.logger.log(
      `[Recategorize] Progress for batchId: ${batchId}, userId: ${userId} - total: ${total}, completed: ${completed}, failed: ${failed}, pending: ${pending}`,
    );

    return { total, completed, failed, pending };
  }

  /**
   * Accelerate processing for a specific email.
   * Cancels pending jobs for the email and requeues them with highest priority.
   * Called by EmailsController when a user opens an email that is still processing.
   */
  async accelerateEmailProcessing(
    userId: string,
    emailId: string,
  ): Promise<{ message: string; queued: string[]; cancelled?: string[] }> {
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      return { message: "Email not found", queued: [] };
    }

    const queued: string[] = [];
    const cancelled: string[] = [];
    const db = getBossDb(this.boss);

    const priorityCancelResult = await db.executeSql(
      `UPDATE pgboss.job
       SET state = 'cancelled'
       WHERE name = 'refine-priority'
       AND state IN ('created', 'retry')
       AND data->>'emailId' = $1
       AND data->>'userId' = $2`,
      [emailId, userId],
    );
    if (priorityCancelResult?.rowCount > 0) {
      cancelled.push(`refine-priority (${priorityCancelResult.rowCount})`);
    }

    const summaryCancelResult = await db.executeSql(
      `UPDATE pgboss.job
       SET state = 'cancelled'
       WHERE name = 'generate-summary'
       AND state IN ('created', 'retry')
       AND data->>'emailId' = $1
       AND data->>'userId' = $2`,
      [emailId, userId],
    );
    if (summaryCancelResult?.rowCount > 0) {
      cancelled.push(`generate-summary (${summaryCancelResult.rowCount})`);
    }

    if (email.isProcessingSummary || !email.summary) {
      await this.boss.send(
        JOB_NAMES.GENERATE_SUMMARY,
        { userId, emailId },
        {
          priority: getJobPriority(JOB_NAMES.GENERATE_SUMMARY, true),
          singletonKey: `summary-${emailId}`,
        },
      );
      queued.push(JOB_NAMES.GENERATE_SUMMARY);
    }

    const priorityScore = email.getPriorityScore();

    let thread = null;
    if (email.emailThreadId) {
      thread = await this.getEmailThreadById(userId, email.emailThreadId);
    }

    const hasNoBreakdown =
      !thread?.priorityExplanation?.breakdown ||
      thread.priorityExplanation.breakdown.length === 0;

    if (
      priorityScore === EMAIL_CONTROLLER_DEFAULTS.PRIORITY_SCORE ||
      thread?.isProcessingPriority ||
      (priorityScore === 0 && hasNoBreakdown)
    ) {
      await this.boss.send(
        JOB_NAMES.REFINE_PRIORITY,
        { userId, emailId },
        {
          priority: getJobPriority(JOB_NAMES.REFINE_PRIORITY, true),
          singletonKey: `priority-${emailId}`,
        },
      );
      queued.push(JOB_NAMES.REFINE_PRIORITY);
    }

    return {
      message: "Accelerated processing",
      queued,
      cancelled: cancelled.length > 0 ? cancelled : undefined,
    };
  }
}
