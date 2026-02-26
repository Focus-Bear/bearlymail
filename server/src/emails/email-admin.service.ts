import { Injectable, Inject, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import PgBoss from "pg-boss";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EmailsService } from "./emails.service";
import { PgBossWithInternals } from "./email-controller.helpers";
import { getJobPriority } from "../queue/job-priorities";
import { EmailThread } from "../database/entities/email-thread.entity";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { ContactsService } from "../contacts/contacts.service";
import { EmailRecipient } from "./interfaces/email-provider.interface";

type ValidMode = "triage" | "action";

@Injectable()
export class EmailAdminService {
  private readonly logger = new Logger(EmailAdminService.name);

  constructor(
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private readonly emailsService: EmailsService,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    private readonly blockedSendersService: BlockedSendersService,
    private readonly contactsService: ContactsService,
  ) {}

  async getEmailStats(userId: string, since: Date) {
    const emailsPerDay = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .innerJoin("thread.emails", "email")
      .select("DATE(email.receivedAt)", "date")
      .addSelect("COUNT(DISTINCT email.id)", "count")
      .addSelect("thread.category", "category")
      .where("thread.userId = :userId", { userId })
      .andWhere("email.receivedAt >= :since", { since })
      .groupBy("DATE(email.receivedAt)")
      .addGroupBy("thread.category")
      .orderBy("DATE(email.receivedAt)", "ASC")
      .getRawMany();

    const replyTimesByCategory = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .innerJoin("thread.emails", "email")
      .select("thread.category", "category")
      .addSelect("AVG(email.timeToReply)", "avgReplyTimeMinutes")
      .addSelect("MIN(email.timeToReply)", "minReplyTimeMinutes")
      .addSelect("MAX(email.timeToReply)", "maxReplyTimeMinutes")
      .addSelect("COUNT(email.id)", "repliedCount")
      .where("thread.userId = :userId", { userId })
      .andWhere("email.timeToReply IS NOT NULL")
      .andWhere("email.timeToReply > 0")
      .andWhere("email.receivedAt >= :since", { since })
      .groupBy("thread.category")
      .getRawMany();

    const totalByCategory = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .innerJoin("thread.emails", "email")
      .select("thread.category", "category")
      .addSelect("COUNT(DISTINCT email.id)", "total")
      .where("thread.userId = :userId", { userId })
      .andWhere("email.receivedAt >= :since", { since })
      .groupBy("thread.category")
      .getRawMany();

    return { emailsPerDay, replyTimesByCategory, totalByCategory };
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
      "24h": 24,
      "7d": 168,
      "30d": 720,
    };
    const hours = hoursMap[range] || 24;
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
    if (state === "created") statsByJobType[jobType].queued = count;
    else if (state === "active") statsByJobType[jobType].active = count;
    else if (state === "retry") statsByJobType[jobType].retry = count;
    else if (state === "failed") statsByJobType[jobType].failed = count;
    else if (state === "completed") statsByJobType[jobType].completed = count;
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
    const { db } = this.boss as unknown as PgBossWithInternals;
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
      queueStats.rows.forEach(
        (row: { jobType: string; state: string; count: string }) =>
          this.mergeQueueStatsRow(row, statsByJobType),
      );
    }
    if (archiveStats?.rows) {
      archiveStats.rows.forEach(
        (row: {
          jobType: string;
          completedCount: string;
          avgCompletionTimeMs: string | null;
        }) => this.mergeArchiveStatsRow(row, statsByJobType),
      );
    }

    const statsArray = Object.entries(statsByJobType)
      .map(([jobType, stats]) => ({ jobType, ...stats }))
      .sort((a, b) => a.jobType.localeCompare(b.jobType));

    return { stats: statsArray, timestamp: new Date().toISOString() };
  }

  parseModes(modesParam?: string): ValidMode[] {
    const validModes: ValidMode[] = ["triage", "action"];
    if (!modesParam) return validModes;
    const requested = modesParam.split(",").map((m) => m.trim());
    const filtered = requested.filter((m): m is ValidMode =>
      validModes.includes(m as ValidMode),
    );
    return filtered.length > 0 ? filtered : validModes;
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
      await this.boss.send(
        "refine-priority",
        {
          userId,
          emailId: email.id,
          forceRecalculate: true,
          recategorizeBatchId: batchId,
        },
        {
          priority: getJobPriority("refine-priority", true),
          singletonKey: `recategorize-${email.id}`,
          singletonMinutes: 1,
        },
      );
      queued++;
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

    const { db } = this.boss as unknown as PgBossWithInternals;

    const result = await db.executeSql(
      `
      WITH all_jobs AS (
        SELECT state::text, data->>'userId' as "userId"
        FROM pgboss.job
        WHERE data->>'recategorizeBatchId' = $1
        UNION ALL
        SELECT state::text, data->>'userId' as "userId"
        FROM pgboss.archive
        WHERE data->>'recategorizeBatchId' = $1
      )
      SELECT state, COUNT(*) as count
      FROM all_jobs
      WHERE "userId" = $2
      GROUP BY state
      `,
      [batchId, userId],
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
}
