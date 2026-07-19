import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";

import { EMAIL_MODES } from "../constants/domain-types";
import { JOB_NAMES } from "../constants/job-names";
import { PRIORITY_SCORES } from "../constants/priority-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { UsersService } from "../users/users.service";
import { parseCategoryName } from "../utils/category-name.util";

@Injectable()
export class EmailStatusService {
  private readonly logger = new Logger(EmailStatusService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    private usersService: UsersService,
  ) {}

  /**
   * Get sync status for a user
   */
  async getSyncStatus(userId: string): Promise<{
    lastSyncAt: Date | null;
    isSyncing: boolean;
  }> {
    const user = await this.usersService.findOneLightweight(userId);
    return {
      lastSyncAt: user?.lastEmailSyncAt ?? null,
      isSyncing: await this.hasPendingEmailFetch(userId),
    };
  }

  /**
   * True while a fetch-user-emails job for this user is queued or running.
   * Read straight from PgBoss so it works across the web/worker split and
   * survives a page refresh. Best-effort — never let a status poll error out.
   */
  private async hasPendingEmailFetch(userId: string): Promise<boolean> {
    try {
      const rows = await this.emailRepository.query(
        `SELECT 1 FROM pgboss.job
         WHERE name = $1 AND state IN ('created', 'active', 'retry')
           AND data->>'userId' = $2
         LIMIT 1`,
        [JOB_NAMES.FETCH_USER_EMAILS, userId],
      );
      return rows.length > 0;
    } catch (error) {
      this.logger.warn(
        `sync-status: pgboss lookup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * Force check for new emails by releasing all pending batched threads
   */
  async forceCheckNewEmails(
    userId: string,
    getInbox: (
      userId: string,
      includeBatched: boolean,
      mode: "triage" | "action" | "follow-up",
    ) => Promise<{ emails: Email[]; total: number; hasMore: boolean }>,
  ): Promise<Email[]> {
    await this.emailThreadRepository.update(
      {
        userId,
        isBatched: true,
      },
      { isBatched: false, batchDecisionReason: "Force-checked by user" },
    );

    // Return Triage inbox by default after force check
    const result = await getInbox(userId, true, "triage");
    return result.emails;
  }

  /**
   * Get the next batch release time for a user.
   * Only returns FUTURE dates — past-due batched threads are effectively already visible.
   */
  async getNextBatchReleaseTime(userId: string): Promise<Date | null> {
    const now = new Date();
    const nextBatch = await this.emailThreadRepository.findOne({
      where: { userId, isBatched: true, batchReleaseAt: MoreThan(now) },
      order: { batchReleaseAt: "ASC" },
      select: {
        batchReleaseAt: true,
      },
    });
    return nextBatch?.batchReleaseAt || null;
  }

  /**
   * Check for urgent emails that are currently batched
   */
  async checkForUrgentEmails(userId: string): Promise<{
    hasUrgent: boolean;
    urgentCount: number;
    urgentEmails: Array<{
      subject: string;
      from: string;
      priorityScore: number;
    }>;
  }> {
    // Get all batched threads that are marked as urgent AND have very high priority score.
    // Batch state is now thread-level (thread.isBatched). Query threads directly,
    // then fetch the latest email subject/from for display.
    const urgentBatchedThreads = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .where("thread.userId = :userId", { userId })
      .andWhere("thread.isBatched = true")
      .andWhere("thread.isArchived = false")
      // Must have high urgency score (90+)
      .andWhere("thread.urgencyScore >= 90")
      // AND must have very high priority (95+)
      .andWhere("COALESCE(thread.priorityScore, 0) >= :veryHighPriority", {
        veryHighPriority: PRIORITY_SCORES.VERY_HIGH,
      })
      .select(["thread.id", "thread.urgencyScore", "thread.priorityScore"])
      .limit(QUERY_LIMITS.MAX_RESULTS_DEFAULT)
      .getMany();

    // Fetch latest email for subject/from display
    const urgentEmails = await Promise.all(
      urgentBatchedThreads.map(async (thread) => {
        const latestEmail = await this.emailRepository.findOne({
          where: { emailThreadId: thread.id, userId },
          order: { receivedAt: "DESC" },
          select: {
            subject: true,
            from: true,
            fromName: true,
          },
        });
        return {
          subject: latestEmail?.subject || "No subject",
          from: latestEmail?.fromName || latestEmail?.from || "Unknown",
          priorityScore: thread.priorityScore ?? 0,
        };
      }),
    );

    return {
      hasUrgent: urgentEmails.length > 0,
      urgentCount: urgentEmails.length,
      urgentEmails,
    };
  }

  // ── Categories & accounts ─────────────────────────────────────────────────

  async getCategories(userId: string): Promise<string[]> {
    // Query user_contexts directly — source of truth for category names (fixes #1293).
    const ctxs = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: {
        contextValue: true,
      },
    });
    for (const ctx of ctxs) {
      decryptUserContextEntityForApi(ctx);
    }
    const names = ctxs
      .map((ctx) => parseCategoryName(ctx.contextValue))
      .filter((name) => name !== "");
    return Array.from(new Set<string>(names)).sort();
  }

  /**
   * Returns priority tier counts for the given inbox mode.
   *
   * Fix #1452 bug 3: previously this query had no mode filter, counting ALL non-archived
   * threads regardless of starCount. Triage mode threads have starCount = 0; action/follow-up
   * have starCount > 0. Without this filter, the sum of bucket counts (VL+L+M+H+VH) did not
   * match the triage tab total — e.g. bucket counts summed to 45 while the tab showed 142
   * because the tab uses getInboxSummary("triage") which applies starCount = 0 filtering.
   *
   * Fix #1742: previously used strict `isBatched = false AND isSnoozed = false` conditions,
   * which excluded threads whose batch/snooze time had already passed (e.g. isBatched=true
   * with batchReleaseAt in the past). The inbox summary query counts those threads as visible,
   * so the priority counts were far lower than the tab total (e.g. 1 vs 229 in triage).
   * Now uses the same OR-based conditions as querySummaryRows in email-inbox.service.ts.
   *
   * @param mode Inbox mode — applies the same starCount filter as getInboxSummary.
   *             Defaults to "triage" to preserve backwards compatibility.
   */
  async getPriorityCounts(
    userId: string,
    mode: "triage" | "action" | "follow-up" = "triage",
  ): Promise<{
    veryHigh: number;
    high: number;
    medium: number;
    low: number;
    veryLow: number;
    unprioritised: number;
  }> {
    // Apply the same mode-based starCount filter as buildThreadFilter in email-inbox.types.ts.
    // This ensures bucket counts match the thread count shown on the inbox tab for that mode.
    let modeFilter: string;
    if (mode === EMAIL_MODES.ACTION || mode === EMAIL_MODES.FOLLOW_UP) {
      modeFilter = 'AND "starCount" > 0';
    } else {
      // triage (default): only threads not yet actioned
      modeFilter = 'AND "starCount" = 0';
    }

    const rows = await this.emailThreadRepository.query(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) >= 50) AS "veryHigh",
         COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) >= 30 AND COALESCE("priorityScore", 0) < 50) AS high,
         COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) >= 15 AND COALESCE("priorityScore", 0) < 30) AS medium,
         COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) >= 0 AND COALESCE("priorityScore", 0) < 15) AS low,
         COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) < 0) AS "veryLow",
         COUNT(*) FILTER (WHERE "priorityScore" IS NULL) AS unprioritised
       FROM email_threads
       WHERE "userId" = $1
         AND "isArchived" = false
         AND ("isBatched" = false OR "batchReleaseAt" IS NULL OR "batchReleaseAt" <= NOW())
         AND ("isSnoozed" = false OR "snoozeUntil" IS NULL OR "snoozeUntil" <= NOW())
         ${modeFilter}`,
      [userId],
    );
    const row = rows[0] ?? {
      veryHigh: 0,
      high: 0,
      medium: 0,
      low: 0,
      veryLow: 0,
      unprioritised: 0,
    };
    return {
      veryHigh: parseInt(row.veryHigh, 10) || 0,
      high: parseInt(row.high, 10) || 0,
      medium: parseInt(row.medium, 10) || 0,
      low: parseInt(row.low, 10) || 0,
      veryLow: parseInt(row.veryLow, 10) || 0,
      unprioritised: parseInt(row.unprioritised, 10) || 0,
    };
  }

  /**
   * Returns priority debug info for the debug panel (#1571 Item 3).
   * Provides per-mode bucket counts, a 10-point histogram of priority scores,
   * count of threads with NULL priority, and a fetch timestamp.
   *
   * NOTE: This method is intentionally uncached — it fires 5 DB queries (3× getPriorityCounts
   * + histogram + nullCount) on every call. It is debug-only and not on any hot path,
   * so the overhead is acceptable. Do NOT add caching without consulting the debug panel UX.
   */
  async getPriorityDebugInfo(userId: string): Promise<{
    bucketsByMode: {
      triage: {
        veryHigh: number;
        high: number;
        medium: number;
        low: number;
        veryLow: number;
        unprioritised: number;
      };
      action: {
        veryHigh: number;
        high: number;
        medium: number;
        low: number;
        veryLow: number;
        unprioritised: number;
      };
      followUp: {
        veryHigh: number;
        high: number;
        medium: number;
        low: number;
        veryLow: number;
        unprioritised: number;
      };
    };
    histogram: Array<{ band: string; count: number }>;
    nullPriorityCount: number;
    fetchedAt: string;
  }> {
    const [triage, action, followUp] = await Promise.all([
      this.getPriorityCounts(userId, "triage"),
      this.getPriorityCounts(userId, "action"),
      this.getPriorityCounts(userId, "follow-up"),
    ]);

    // Build a 10-point histogram for threads with priorityScore 0–100
    const HISTOGRAM_BUCKET_SIZE = 10;
    const histogramRows = await this.emailThreadRepository.query(
      `SELECT
         CONCAT(
           (FLOOR("priorityScore" / ${HISTOGRAM_BUCKET_SIZE}) * ${HISTOGRAM_BUCKET_SIZE})::int, '-',
           (FLOOR("priorityScore" / ${HISTOGRAM_BUCKET_SIZE}) * ${HISTOGRAM_BUCKET_SIZE} + ${HISTOGRAM_BUCKET_SIZE})::int
         ) AS band,
         COUNT(*)::int AS count
       FROM email_threads
       WHERE "userId" = $1
         AND "isArchived" = false
         AND ("isBatched" = false OR "batchReleaseAt" IS NULL OR "batchReleaseAt" <= NOW())
         AND ("isSnoozed" = false OR "snoozeUntil" IS NULL OR "snoozeUntil" <= NOW())
         AND "priorityScore" IS NOT NULL
         AND "priorityScore" >= 0
       GROUP BY FLOOR("priorityScore" / ${HISTOGRAM_BUCKET_SIZE})
       ORDER BY FLOOR("priorityScore" / ${HISTOGRAM_BUCKET_SIZE})`,
      [userId],
    );

    const nullRows = await this.emailThreadRepository.query(
      `SELECT COUNT(*)::int AS count
       FROM email_threads
       WHERE "userId" = $1
         AND "isArchived" = false
         AND ("isBatched" = false OR "batchReleaseAt" IS NULL OR "batchReleaseAt" <= NOW())
         AND ("isSnoozed" = false OR "snoozeUntil" IS NULL OR "snoozeUntil" <= NOW())
         AND "priorityScore" IS NULL`,
      [userId],
    );

    return {
      bucketsByMode: {
        triage,
        action,
        followUp,
      },
      histogram: histogramRows.map((row: { band: string; count: number }) => ({
        band: row.band,
        count: parseInt(String(row.count), 10) || 0,
      })),
      nullPriorityCount: parseInt(String(nullRows[0]?.count ?? 0), 10) || 0,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Returns the prioritisation status for the inbox gate:
   * how many threads are prioritised vs total, and whether analysis is active.
   * "Prioritised" means priorityScore IS NOT NULL.
   */
  async getPrioritisationStatus(userId: string): Promise<{
    totalThreads: number;
    prioritisedCount: number;
    unprioritisedCount: number;
    isAnalysisRunning: boolean;
  }> {
    const rows = await this.emailThreadRepository.query(
      `SELECT
         COUNT(*) AS "totalThreads",
         COUNT(*) FILTER (WHERE "priorityScore" IS NOT NULL) AS "prioritisedCount",
         COUNT(*) FILTER (WHERE "priorityScore" IS NULL) AS "unprioritisedCount"
       FROM email_threads
       WHERE "userId" = $1 AND "isArchived" = false
         AND ("isBatched" = false OR "batchReleaseAt" IS NULL OR "batchReleaseAt" <= NOW())
         AND ("isSnoozed" = false OR "snoozeUntil" IS NULL OR "snoozeUntil" <= NOW())`,
      [userId],
    );
    const row = rows[0] ?? {
      totalThreads: 0,
      prioritisedCount: 0,
      unprioritisedCount: 0,
    };
    const totalThreads = parseInt(row.totalThreads, 10) || 0;
    const prioritisedCount = parseInt(row.prioritisedCount, 10) || 0;
    const unprioritisedCount = parseInt(row.unprioritisedCount, 10) || 0;

    // Analysis is considered "running" when there are still unprioritised threads
    // and some have already been prioritised (analysis in progress), OR when
    // there are unprioritised threads and none are prioritised yet (just started).
    const isAnalysisRunning = unprioritisedCount > 0;

    return {
      totalThreads,
      prioritisedCount,
      unprioritisedCount,
      isAnalysisRunning,
    };
  }

  async getConnectedAccounts(userId: string): Promise<
    Array<{
      id: string;
      email: string;
      provider: "gmail" | "office365" | "zoho";
      isPrimary: boolean;
      isActive: boolean;
    }>
  > {
    const accounts: Array<{
      id: string;
      email: string;
      provider: "gmail" | "office365" | "zoho";
      isPrimary: boolean;
      isActive: boolean;
    }> = [];
    const decrypt = (enc: string) => EncryptionHelper.tryDecrypt(enc);

    const googleAccounts = await this.emailRepository.query(
      `SELECT id, email, "isPrimary", "isActive" FROM google_accounts WHERE "userId" = $1`,
      [userId],
    );
    for (const acc of googleAccounts) {
      accounts.push({
        id: acc.id,
        email: decrypt(acc.email),
        provider: "gmail",
        isPrimary: acc.isPrimary,
        isActive: acc.isActive,
      });
    }

    const office365Accounts = await this.emailRepository.query(
      `SELECT id, email, "isPrimary", "isActive" FROM office365_accounts WHERE "userId" = $1`,
      [userId],
    );
    for (const acc of office365Accounts) {
      accounts.push({
        id: acc.id,
        email: decrypt(acc.email),
        provider: "office365",
        isPrimary: acc.isPrimary,
        isActive: acc.isActive,
      });
    }

    const zohoAccounts = await this.emailRepository.query(
      `SELECT id, email, "isPrimary", "isActive" FROM zoho_accounts WHERE "userId" = $1`,
      [userId],
    );
    for (const acc of zohoAccounts) {
      accounts.push({
        id: acc.id,
        email: decrypt(acc.email),
        provider: "zoho",
        isPrimary: acc.isPrimary,
        isActive: acc.isActive,
      });
    }

    return accounts.sort((accA, accB) => {
      if (accA.isPrimary !== accB.isPrimary) return accA.isPrimary ? -1 : 1;
      return accA.provider.localeCompare(accB.provider);
    });
  }
}
