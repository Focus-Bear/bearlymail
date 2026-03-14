import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource, In, IsNull, Not } from "typeorm";

import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { isError } from "../types/common";
import { EmailProviderManager } from "./email-provider-manager.service";
import { GmailProvider } from "./providers/gmail.provider";

const SYNC_HISTORY_DEFAULT_LIMIT: number = QUERY_LIMITS.MAX_RESULTS_DEFAULT;
// Fallback duration when syncStatusUpdatedAt is null (we don't know when it was last updated)
const UNKNOWN_DURATION_MINUTES = 999;
import PgBoss from "pg-boss";

import { getJobPriority } from "../queue/job-priorities";
import {
  type CategoryDebugData,
  EmailDebugCategoryService,
} from "./email-debug-category.service";
import { SyncHistoryEntry, SyncHistoryService } from "./sync-history.service";

export interface ThreadLookupResult {
  found: boolean;
  threadId: string;
  thread: {
    id: string;
    threadId: string;
    starCount: number;
    isArchived: boolean;
    priorityScore: number | null;
    updatedAt: Date;
  } | null;
  emails: Array<{
    id: string;
    subject: string;
    from: string;
    receivedAt: Date;
    isSnoozed: boolean;
    snoozeUntil: Date | null;
    isBatched: boolean;
    batchReleaseAt: Date | null;
  }>;
  visibility: {
    wouldShowInTriage: boolean;
    wouldShowInAction: boolean;
    wouldShowInFollowUp: boolean;
  };
  reasons: string[];
}

@Injectable()
export class EmailDebugService {
  private readonly logger = new Logger(EmailDebugService.name);

  constructor(
    private dataSource: DataSource,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    @Inject(forwardRef(() => GmailProvider))
    private gmailProvider: GmailProvider,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private blockedSendersService: BlockedSendersService,
    private syncHistoryService: SyncHistoryService,
    private emailDebugCategoryService: EmailDebugCategoryService,
  ) {}

  private get emailRepository() {
    return this.dataSource.getRepository(Email);
  }

  private get emailThreadRepository() {
    return this.dataSource.getRepository(EmailThread);
  }

  private async buildConditionReasons(
    thread: EmailThread,
    emails: Email[],
    userId: string,
    latestEmail: Email | undefined,
  ): Promise<{ reasons: string[]; isBlocked: boolean }> {
    const reasons: string[] = [];

    if (emails.length === 0) {
      reasons.push(
        "Thread exists but has no emails linked to it (orphan thread)",
      );
    }

    // Check sync status first - if unsynced, Gmail state is not yet reflected
    if (thread.syncStatus === "unsynced") {
      const minutesSinceUpdate = thread.syncStatusUpdatedAt
        ? Math.floor(
            (Date.now() - new Date(thread.syncStatusUpdatedAt).getTime()) /
              MILLISECONDS.MINUTE,
          )
        : UNKNOWN_DURATION_MINUTES;
      reasons.push(
        `Thread has UNSYNCED changes (${minutesSinceUpdate} min ago) - local state may differ from Gmail`,
      );
    }

    if (thread.starCount === 0) {
      reasons.push(
        "Thread starCount is 0 in BearlyMail - will appear in Triage, not Action tab",
      );
    }

    if (thread.isArchived) {
      reasons.push(
        "Thread is ARCHIVED - archived threads don't show in any inbox view",
      );
    }

    let isBlocked = false;
    if (latestEmail) {
      isBlocked = await this.blockedSendersService.isSenderBlocked(
        userId,
        latestEmail.from || "",
      );
      if (isBlocked) {
        reasons.push(`Sender "${latestEmail.from}" is BLOCKED`);
      }

      if (
        latestEmail.isSnoozed &&
        latestEmail.snoozeUntil &&
        new Date(latestEmail.snoozeUntil) > new Date()
      ) {
        reasons.push(
          `Email is SNOOZED until ${new Date(latestEmail.snoozeUntil).toISOString()}`,
        );
      }
    }

    if (
      thread.isBatched &&
      thread.batchReleaseAt &&
      new Date(thread.batchReleaseAt) > new Date()
    ) {
      reasons.push(
        `Thread is BATCHED and will be released at ${new Date(thread.batchReleaseAt).toISOString()}`,
      );
    }

    return { reasons, isBlocked };
  }

  private buildThreadVisibility(
    thread: EmailThread,
    latestEmail: Email | undefined,
    isBlocked: boolean,
  ): {
    wouldShowInTriage: boolean;
    wouldShowInAction: boolean;
    wouldShowInFollowUp: boolean;
    baseConditionsMet: boolean;
  } {
    const isNotArchived = !thread.isArchived;
    const hasNoBlockedSender = !isBlocked;
    const isNotSnoozed =
      !latestEmail ||
      !latestEmail.isSnoozed ||
      !latestEmail.snoozeUntil ||
      new Date(latestEmail.snoozeUntil) <= new Date();
    const isNotBatched =
      !thread.isBatched ||
      !thread.batchReleaseAt ||
      new Date(thread.batchReleaseAt) <= new Date();

    const baseConditionsMet =
      isNotArchived && hasNoBlockedSender && isNotSnoozed && isNotBatched;

    return {
      wouldShowInTriage: baseConditionsMet && thread.starCount === 0,
      wouldShowInAction: baseConditionsMet && thread.starCount > 0,
      wouldShowInFollowUp: baseConditionsMet && thread.starCount > 0,
      baseConditionsMet,
    };
  }

  /**
   * Build a human-readable reason code explaining why a Gmail-starred thread is absent
   * from the Action / Follow-Up inbox.
   *
   * Reason codes (prefix before ":"): OK | NOT_STARRED_IN_DB | ARCHIVED | SNOOZED |
   * BATCHED | BLOCKED_SENDER | UNSYNCED | UNKNOWN
   */
  private buildStarredThreadReason(
    thread: EmailThread,
    latestEmail: Email | undefined,
    isBlocked: boolean,
    visibility: ReturnType<typeof this.buildThreadVisibility>,
  ): string {
    if (visibility.wouldShowInAction) {
      return "OK: thread is starred and should appear in Action tab";
    }
    if (thread.starCount === 0) {
      return (
        "NOT_STARRED_IN_DB: thread exists in BearlyMail but starCount is 0 — " +
        "Gmail and BearlyMail stars are out of sync. Trigger a manual sync to re-star."
      );
    }
    if (thread.isArchived) {
      return "ARCHIVED: thread is archived in BearlyMail and won't appear in any inbox view";
    }
    if (
      latestEmail?.isSnoozed &&
      latestEmail.snoozeUntil &&
      new Date(latestEmail.snoozeUntil) > new Date()
    ) {
      return `SNOOZED: thread is snoozed until ${new Date(latestEmail.snoozeUntil).toISOString()}`;
    }
    if (
      thread.isBatched &&
      thread.batchReleaseAt &&
      new Date(thread.batchReleaseAt) > new Date()
    ) {
      return `BATCHED: thread will be released from batch at ${new Date(thread.batchReleaseAt).toISOString()}`;
    }
    if (isBlocked) {
      return `BLOCKED_SENDER: sender "${latestEmail?.from ?? "unknown"}" is blocked`;
    }
    if (thread.syncStatus === "unsynced") {
      const minutesSinceUpdate = thread.syncStatusUpdatedAt
        ? Math.floor(
            (Date.now() - new Date(thread.syncStatusUpdatedAt).getTime()) /
              MILLISECONDS.MINUTE,
          )
        : UNKNOWN_DURATION_MINUTES;
      return (
        `UNSYNCED: thread has pending Gmail changes that haven't been applied yet ` +
        `(${minutesSinceUpdate} min ago) — the local BearlyMail state may differ from Gmail`
      );
    }
    return "UNKNOWN: thread does not meet Action tab conditions for an unidentified reason";
  }

  /**
   * Debug starred threads — answers "why isn't this Gmail-starred email showing in
   * Action / Follow-Up?" for every starred thread.
   *
   * Returns a flat `threads` list (one entry per Gmail starred thread) with an
   * actionable `reason` field, plus aggregate `summary` counts.
   */
  async debugStarredThreads(userId: string): Promise<{
    gmailError?: string;
    summary: {
      gmailStarredCount: number;
      foundInDb: number;
      notInDb: number;
      inActionOrFollowUp: number;
      starredInDbButHidden: number;
      notStarredInDb: number;
    };
    threads: Array<{
      threadId: string;
      subject: string | null;
      inDb: boolean;
      isStarredInDb: boolean;
      category: string | null;
      appearsInActionOrFollowUp: boolean;
      reason: string;
    }>;
    staleUnsyncedThreads: Array<{
      threadId: string;
      syncStatusUpdatedAt: string | null;
      minutesUnsynced: number;
      isArchived: boolean;
      starCount: number;
    }>;
  }> {
    // ── Step 1: Fetch starred inbox thread IDs from Gmail (lightweight threads.list) ──
    let gmailStarredThreadIds: string[] = [];
    let gmailError: string | undefined;

    try {
      gmailStarredThreadIds =
        await this.gmailProvider.getStarredInboxThreadIds(userId);
      if (gmailStarredThreadIds.length === 0) {
        const provider =
          await this.emailProviderManager.getPrimaryProvider(userId);
        if (!provider) gmailError = "No email provider connected";
      }
      this.logger.debug(
        `Gmail threads.list found ${gmailStarredThreadIds.length} starred inbox threads`,
      );
    } catch (error: unknown) {
      gmailError = isError(error)
        ? error.message
        : "Failed to fetch starred thread IDs from Gmail";
      this.logger.error(
        "Error fetching starred inbox thread IDs from Gmail:",
        error,
      );
    }

    // ── Step 2: Bulk-fetch all matching EmailThread rows from DB ──
    // We query ALL threads whose Gmail threadId appears in the starred list so we can
    // distinguish "starred in Gmail, not in DB" from "in DB with starCount=0".
    const dbThreads =
      gmailStarredThreadIds.length > 0
        ? await this.emailThreadRepository.find({
            where: { userId, threadId: In(gmailStarredThreadIds) },
            select: [
              "id",
              "threadId",
              "starCount",
              "isArchived",
              "category",
              "syncStatus",
              "syncStatusUpdatedAt",
              "isBatched",
              "batchReleaseAt",
            ],
          })
        : [];

    const dbThreadMap = new Map(
      dbThreads.map((thread) => [thread.threadId, thread]),
    );
    const dbThreadInternalIds = dbThreads.map((thread) => thread.id);

    // ── Step 3: Fetch the latest email per thread (for subject) ──
    // We need one email per thread — we use a subquery to get the most recent one.
    const latestEmailsByThread = new Map<string, Email>();
    if (dbThreadInternalIds.length > 0) {
      const emails = await this.emailRepository
        .createQueryBuilder("email")
        .select([
          "email.id",
          "email.emailThreadId",
          "email.subject",
          "email.from",
          "email.fromName",
          "email.receivedAt",
          "email.isSnoozed",
          "email.snoozeUntil",
          "email.isBatched",
          "email.batchReleaseAt",
        ])
        .where("email.userId = :userId", { userId })
        .andWhere('email."emailThreadId" IN (:...threadIds)', {
          threadIds: dbThreadInternalIds,
        })
        .orderBy("email.receivedAt", "DESC")
        .getMany();

      // Keep only the first (most-recent) email per thread
      for (const email of emails) {
        if (
          email.emailThreadId &&
          !latestEmailsByThread.has(email.emailThreadId)
        ) {
          latestEmailsByThread.set(email.emailThreadId, email);
        }
      }
    }

    // ── Step 4: Build per-thread result rows ──
    const threads = await Promise.all(
      gmailStarredThreadIds.map(async (gmailThreadId) => {
        const thread = dbThreadMap.get(gmailThreadId);

        if (!thread) {
          return {
            threadId: gmailThreadId,
            subject: null,
            inDb: false,
            isStarredInDb: false,
            category: null,
            appearsInActionOrFollowUp: false,
            reason:
              "NOT_IN_DB: thread exists in Gmail but has never been synced to BearlyMail " +
              "(likely older than the sync window — try triggering a manual sync)",
          };
        }

        const latestEmail = latestEmailsByThread.get(thread.id);
        const isBlocked = latestEmail
          ? await this.blockedSendersService.isSenderBlocked(
              userId,
              latestEmail.from ?? "",
            )
          : false;

        const visibility = this.buildThreadVisibility(
          thread,
          latestEmail,
          isBlocked,
        );

        const reason = this.buildStarredThreadReason(
          thread,
          latestEmail,
          isBlocked,
          visibility,
        );

        return {
          threadId: gmailThreadId,
          subject:
            latestEmail?.subject?.substring(
              0,
              QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH,
            ) ?? null,
          inDb: true,
          isStarredInDb: thread.starCount > 0,
          category: thread.category ?? null,
          appearsInActionOrFollowUp: visibility.wouldShowInAction,
          reason,
        };
      }),
    );

    // ── Step 5: Compute summary ──
    const foundInDb = threads.filter((thread) => thread.inDb).length;
    const notInDb = threads.filter((thread) => !thread.inDb).length;
    const inActionOrFollowUp = threads.filter(
      (thread) => thread.appearsInActionOrFollowUp,
    ).length;
    const notStarredInDb = threads.filter(
      (thread) => thread.inDb && !thread.isStarredInDb,
    ).length;
    // "Starred in DB but hidden" = in DB, starCount > 0, still not in Action.
    const starredInDbButHidden = threads.filter(
      (thread) =>
        thread.inDb &&
        thread.isStarredInDb &&
        !thread.appearsInActionOrFollowUp,
    ).length;

    // ── Step 6: stale unsynced threads (syncStatus='unsynced' for >5 min) ──
    // Re-added to support the "Fix Stale Unsynced Threads" button in the debug popup.
    const fiveMinutesAgo = new Date(Date.now() - 5 * MILLISECONDS.MINUTE);
    const staleUnsyncedEntities = await this.emailThreadRepository.find({
      where: { userId, syncStatus: "unsynced" },
      select: ["threadId", "syncStatusUpdatedAt", "isArchived", "starCount"],
    });
    const staleUnsyncedThreads = staleUnsyncedEntities
      .filter(
        (thread) =>
          thread.syncStatusUpdatedAt &&
          thread.syncStatusUpdatedAt < fiveMinutesAgo,
      )
      .map((thread) => ({
        threadId: `${thread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...`,
        syncStatusUpdatedAt: thread.syncStatusUpdatedAt?.toISOString() ?? null,
        minutesUnsynced: Math.floor(
          (Date.now() - new Date(thread.syncStatusUpdatedAt ?? 0).getTime()) /
            MILLISECONDS.MINUTE,
        ),
        isArchived: thread.isArchived,
        starCount: thread.starCount,
      }));

    return {
      ...(gmailError ? { gmailError } : {}),
      summary: {
        gmailStarredCount: gmailStarredThreadIds.length,
        foundInDb,
        notInDb,
        inActionOrFollowUp,
        starredInDbButHidden,
        notStarredInDb,
      },
      threads,
      staleUnsyncedThreads,
    };
  }

  /**
   * Debug endpoint to find emails without emailThreadId (orphan emails)
   */
  async debugOrphanEmails(userId: string): Promise<{
    totalEmailsInDb: number;
    emailsWithThreadId: number;
    orphanEmails: number;
    orphanEmailDetails: Array<{
      id: string;
      threadId: string;
      emailThreadId: string | null;
      subject: string;
      from: string;
      receivedAt: Date;
    }>;
    threadsInDb: number;
    threadsWithoutEmails: Array<{
      id: string;
      threadId: string;
      starCount: number;
      isArchived: boolean;
    }>;
  }> {
    // Count total emails
    const totalEmailsInDb = await this.emailRepository.count({
      where: { userId },
    });

    // Count emails with emailThreadId set
    const emailsWithThreadId = await this.emailRepository.count({
      where: { userId, emailThreadId: Not(IsNull()) },
    });

    // Get orphan emails (no emailThreadId)
    const orphanEmailsList = await this.emailRepository.find({
      where: { userId, emailThreadId: IsNull() },
      select: [
        "id",
        "threadId",
        "emailThreadId",
        "subject",
        "from",
        "receivedAt",
      ],
      // Limit to 50 for performance
      take: QUERY_LIMITS.MAX_RESULTS_DEFAULT,
    });

    // Get all threads
    const allThreads = await this.emailThreadRepository.find({
      where: { userId },
    });

    // Find threads that have no emails pointing to them
    const threadIdsWithEmails = await this.emailRepository
      .createQueryBuilder("email")
      .select('DISTINCT email."emailThreadId"', "emailThreadId")
      .where("email.userId = :userId", { userId })
      .andWhere('email."emailThreadId" IS NOT NULL')
      .getRawMany();

    const threadIdsWithEmailsSet = new Set(
      threadIdsWithEmails.map((rawRow) => rawRow.emailThreadId),
    );

    const threadsWithoutEmails = allThreads
      .filter((thread) => !threadIdsWithEmailsSet.has(thread.id))
      .map((thread) => ({
        id: `${thread.id.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...`,
        threadId: `${thread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...`,
        starCount: thread.starCount,
        isArchived: thread.isArchived,
      }));

    return {
      totalEmailsInDb,
      emailsWithThreadId,
      orphanEmails: totalEmailsInDb - emailsWithThreadId,
      orphanEmailDetails: orphanEmailsList.map((emailEntry) => ({
        id: emailEntry.id,
        threadId: emailEntry.threadId || "",
        emailThreadId: emailEntry.emailThreadId,
        subject: emailEntry.subject || "",
        from: emailEntry.from || "",
        receivedAt: emailEntry.receivedAt,
      })),
      threadsInDb: allThreads.length,
      threadsWithoutEmails,
    };
  }

  /**
   * Fix orphan emails by linking them to their threads
   */
  async fixOrphanEmails(userId: string): Promise<{
    fixed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let fixed = 0;

    // Get all orphan emails
    const orphanEmails = await this.emailRepository.find({
      where: { userId, emailThreadId: IsNull() },
    });

    this.logger.log(`Found ${orphanEmails.length} orphan emails to fix`);

    for (const email of orphanEmails) {
      try {
        // Check if a thread already exists for this Gmail threadId
        let thread = await this.emailThreadRepository.findOne({
          where: { userId, threadId: email.threadId },
        });

        if (!thread) {
          // Create a new thread
          thread = this.emailThreadRepository.create({
            userId,
            threadId: email.threadId,
            starCount: 0,
            isArchived: false,
          });
          thread = await this.emailThreadRepository.save(thread);
          this.logger.log(
            `Created new thread ${thread.id} for Gmail thread ${email.threadId}`,
          );
        }

        // Link email to thread
        await this.emailRepository.update(email.id, {
          emailThreadId: thread.id,
        });
        fixed++;
      } catch (err) {
        const errorMsg = `Failed to fix email ${email.id}: ${isError(err) ? err.message : "Unknown error"}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    this.logger.log(`Fixed ${fixed} orphan emails, ${errors.length} errors`);

    return { fixed, errors };
  }

  /**
   * Fix stuck calculating threads by resetting the flag and re-queuing jobs
   */
  async fixStuckCalculatingThreads(userId: string): Promise<{
    fixed: number;
    requeued: number;
    errors: string[];
  }> {
    this.logger.log(
      `Checking for stuck calculating threads for user ${userId}`,
    );

    // Find threads that have been in "calculating" state for more than 10 minutes
    // Priority is now thread-level, so check threads instead of emails
    const stuckThreads = await this.emailThreadRepository.find({
      where: {
        userId,
        isProcessingPriority: true,
      },
      select: ["id", "threadId", "updatedAt", "priorityExplanation"],
    });

    // Filter to only those that are actually stuck (older than 10 minutes or no breakdown)
    const actuallyStuck = stuckThreads.filter((thread) => {
      const threadAge = Date.now() - new Date(thread.updatedAt).getTime();
      const hasBreakdown =
        thread.priorityExplanation?.breakdown &&
        thread.priorityExplanation.breakdown.length > 0;
      return threadAge > 10 * MILLISECONDS.MINUTE || !hasBreakdown;
    });

    this.logger.log(
      `Found ${actuallyStuck.length} stuck calculating threads (out of ${stuckThreads.length} total)`,
    );

    let fixed = 0;
    let requeued = 0;
    const errors: string[] = [];

    for (const thread of actuallyStuck) {
      try {
        // Get an email from this thread to use for the job
        const email = await this.emailRepository.findOne({
          where: { emailThreadId: thread.id, userId },
          select: ["id"],
        });

        if (!email) {
          // No email found for this thread, just reset the flag
          await this.emailThreadRepository.update(
            { id: thread.id },
            { isProcessingPriority: false },
          );
          fixed++;
          continue;
        }

        // Reset the flag first
        await this.emailThreadRepository.update(
          { id: thread.id },
          { isProcessingPriority: false },
        );

        // Re-queue priority calculation job
        await this.boss.send(
          "refine-priority",
          { userId, emailId: email.id },
          {
            priority: getJobPriority("refine-priority-background", false),
            singletonKey: `refine-priority-thread-${thread.id}`,
            singletonMinutes: 1,
          },
        );

        fixed++;
        requeued++;
      } catch (error) {
        const errorMsg = `Failed to fix thread ${thread.threadId}: ${isError(error) ? error.message : "Unknown error"}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    this.logger.log(
      `Fixed ${fixed} stuck threads, re-queued ${requeued} jobs, ${errors.length} errors`,
    );

    return { fixed, requeued, errors };
  }

  /**
   * Look up a thread by its Gmail threadId and explain why it may not be showing
   * in the current inbox view
   */
  async lookupThread(
    userId: string,
    threadId: string,
  ): Promise<ThreadLookupResult> {
    this.logger.log(`Looking up thread ${threadId} for user ${userId}`);

    // 1. Find the thread in the database
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    if (!thread) {
      return {
        found: false,
        threadId,
        thread: null,
        emails: [],
        visibility: {
          wouldShowInTriage: false,
          wouldShowInAction: false,
          wouldShowInFollowUp: false,
        },
        reasons: [
          "Thread not found in database - it may not have been synced yet",
        ],
      };
    }

    // 2. Get all emails in this thread
    const emails = await this.emailRepository.find({
      where: { userId, emailThreadId: thread.id },
      order: { receivedAt: "DESC" },
    });

    const latestEmail = emails[0];

    // 3. Check conditions and build reasons
    const { reasons, isBlocked } = await this.buildConditionReasons(
      thread,
      emails,
      userId,
      latestEmail,
    );

    // 4. Determine visibility in each mode
    const {
      wouldShowInTriage,
      wouldShowInAction,
      wouldShowInFollowUp,
      baseConditionsMet,
    } = this.buildThreadVisibility(thread, latestEmail, isBlocked);

    // 5. Add mode-specific reasons
    if (baseConditionsMet) {
      if (thread.starCount === 0) {
        reasons.push(
          "Thread has starCount=0, so it would appear in TRIAGE mode (not Action/Follow-up)",
        );
      } else {
        reasons.push(
          `Thread has starCount=${thread.starCount}, so it would appear in ACTION/FOLLOW-UP mode (not Triage)`,
        );
      }
    }

    if (reasons.length === 0) {
      reasons.push("Thread should be visible - no issues detected");
    }

    return {
      found: true,
      threadId,
      thread: {
        id: thread.id,
        threadId: thread.threadId,
        starCount: thread.starCount,
        isArchived: thread.isArchived,
        priorityScore: thread.priorityScore,
        updatedAt: thread.updatedAt,
      },
      emails: emails.map((emailEntry) => ({
        id: emailEntry.id,
        subject: emailEntry.subject || "",
        from: emailEntry.from || "",
        receivedAt: emailEntry.receivedAt,
        isSnoozed: emailEntry.isSnoozed,
        snoozeUntil: emailEntry.snoozeUntil,
        isBatched: emailEntry.isBatched,
        batchReleaseAt: emailEntry.batchReleaseAt,
      })),
      visibility: {
        wouldShowInTriage,
        wouldShowInAction,
        wouldShowInFollowUp,
      },
      reasons,
    };
  }

  /**
   * Get sync history for a user – the last N sync attempts with queries used.
   */
  async getSyncHistory(
    userId: string,
    limit = SYNC_HISTORY_DEFAULT_LIMIT,
  ): Promise<SyncHistoryEntry[]> {
    return this.syncHistoryService.getSyncHistory(userId, limit);
  }

  /**
   * Look up a thread by Gmail message ID (from Gmail URL)
   * This extracts the thread ID from the email with the given message ID
   */
  async lookupByMessageId(
    userId: string,
    messageId: string,
  ): Promise<ThreadLookupResult> {
    this.logger.log(`Looking up message ${messageId} for user ${userId}`);

    // Find the email with this message ID
    const email = await this.emailRepository.findOne({
      where: { userId, messageId },
      select: ["id", "threadId", "emailThreadId"],
    });

    if (!email) {
      return {
        found: false,
        threadId: messageId,
        thread: null,
        emails: [],
        visibility: {
          wouldShowInTriage: false,
          wouldShowInAction: false,
          wouldShowInFollowUp: false,
        },
        reasons: [
          "Message ID not found in database - the email may not have been synced yet",
        ],
      };
    }

    // Now look up the thread using the threadId from the email
    return this.lookupThread(userId, email.threadId);
  }

  /**
   * Look up a thread using a Gmail web UI URL.
   *
   * Gmail web URLs encode thread/message IDs differently from the Gmail REST API:
   *   - URL format: base64url-encoded (e.g. "FMfcgzQfBsphbPMHvCJWcFscclwTDqzk")
   *   - API format: hexadecimal (e.g. "18a12345678abcde")
   *
   * This method:
   *   1. Extracts the URL ID from the Gmail URL
   *   2. Tries a direct DB lookup (in case it's already an API-format ID)
   *   3. If not found in DB, calls the Gmail API to resolve the URL ID to an API thread/message ID
   *   4. Looks up the resolved thread ID in our DB
   *   5. Returns a result with Gmail API metadata even if the thread is not yet in our DB
   */
  private async resolveGmailUrlViaApi(
    userId: string,
    urlId: string,
  ): Promise<{
    foundInGmailApi: boolean;
    apiMessageId: string | null;
    apiThreadId: string | null;
    subject: string | null;
    from: string | null;
    receivedAt: string | null;
  }> {
    try {
      const gmailLookup = await this.gmailProvider.lookupByGmailUrlId(
        userId,
        urlId,
      );
      if (!gmailLookup) {
        return {
          foundInGmailApi: false,
          apiMessageId: null,
          apiThreadId: null,
          subject: null,
          from: null,
          receivedAt: null,
        };
      }
      return {
        foundInGmailApi: true,
        apiMessageId: gmailLookup.messageId,
        apiThreadId: gmailLookup.threadId,
        subject: gmailLookup.subject,
        from: gmailLookup.from,
        receivedAt: gmailLookup.receivedAt?.toISOString() ?? null,
      };
    } catch (error) {
      this.logger.warn(
        `Gmail API lookup failed for URL ID ${urlId}: ${isError(error) ? error.message : "unknown error"}`,
      );
      return {
        foundInGmailApi: false,
        apiMessageId: null,
        apiThreadId: null,
        subject: null,
        from: null,
        receivedAt: null,
      };
    }
  }

  async lookupByGmailUrl(
    userId: string,
    gmailUrl: string,
  ): Promise<
    ThreadLookupResult & {
      gmailApiResult?: {
        foundInGmailApi: boolean;
        apiMessageId: string | null;
        apiThreadId: string | null;
        subject: string | null;
        from: string | null;
        receivedAt: string | null;
      };
    }
  > {
    const urlParts = gmailUrl.split(/[/#]/);
    const urlId = urlParts[urlParts.length - 1];
    this.logger.log(
      `Looking up Gmail URL for user ${userId}, extracted URL ID: ${urlId}`,
    );

    const byMessageId = await this.lookupByMessageId(userId, urlId);
    if (byMessageId.found) return byMessageId;

    const byThreadId = await this.lookupThread(userId, urlId);
    if (byThreadId.found) return byThreadId;

    this.logger.log(
      `URL ID ${urlId} not found in DB, calling Gmail API to resolve...`,
    );
    const gmailApiResult = await this.resolveGmailUrlViaApi(userId, urlId);

    if (gmailApiResult.foundInGmailApi && gmailApiResult.apiThreadId) {
      const { apiThreadId, apiMessageId } = gmailApiResult;
      this.logger.log(
        `Gmail API resolved URL ID ${urlId} → threadId: ${apiThreadId}, messageId: ${apiMessageId}`,
      );
      const byResolvedThread = await this.lookupThread(userId, apiThreadId);
      if (byResolvedThread.found)
        return { ...byResolvedThread, gmailApiResult };

      const byResolvedMessage = await this.lookupByMessageId(
        userId,
        apiMessageId ?? urlId,
      );
      if (byResolvedMessage.found)
        return { ...byResolvedMessage, gmailApiResult };

      return {
        found: false,
        threadId: apiThreadId,
        thread: null,
        emails: [],
        visibility: {
          wouldShowInTriage: false,
          wouldShowInAction: false,
          wouldShowInFollowUp: false,
        },
        reasons: [
          `Thread found in Gmail (threadId: ${apiThreadId}) but NOT synced to BearlyMail yet. Subject: "${gmailApiResult.subject || "unknown"}" from "${gmailApiResult.from || "unknown"}". Try triggering a manual sync.`,
        ],
        gmailApiResult,
      };
    }

    return {
      found: false,
      threadId: urlId,
      thread: null,
      emails: [],
      visibility: {
        wouldShowInTriage: false,
        wouldShowInAction: false,
        wouldShowInFollowUp: false,
      },
      reasons: [
        `URL ID "${urlId}" not found in BearlyMail database or Gmail API. The Gmail URL may be invalid or the email may have been deleted.`,
      ],
      gmailApiResult,
    };
  }

  async getCategoryDebugData(
    userId: string,
    emailId: string,
  ): Promise<CategoryDebugData> {
    return this.emailDebugCategoryService.getCategoryDebugData(userId, emailId);
  }

  /**
   * Fix stale unsynced threads by marking them as synced
   * This is useful when threads get stuck in unsynced state for more than 5 minutes
   */
  async fixStaleUnsyncedThreads(userId: string): Promise<{
    fixed: number;
    threadIds: string[];
  }> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * MILLISECONDS.MINUTE);

    // Find all threads stuck in unsynced state for more than 5 minutes
    const staleThreads = await this.emailThreadRepository.find({
      where: {
        userId,
        syncStatus: "unsynced",
      },
      select: ["id", "threadId", "syncStatusUpdatedAt"],
    });

    const actuallyStale = staleThreads.filter(
      (thread) =>
        thread.syncStatusUpdatedAt &&
        thread.syncStatusUpdatedAt < fiveMinutesAgo,
    );

    this.logger.log(
      `Found ${actuallyStale.length} stale unsynced threads for user ${userId}`,
    );

    // Mark them as synced
    if (actuallyStale.length > 0) {
      await this.emailThreadRepository.update(
        {
          userId,
          id: In(actuallyStale.map((thread) => thread.id)),
        },
        {
          syncStatus: "synced",
          syncStatusUpdatedAt: new Date(),
        },
      );
    }

    return {
      fixed: actuallyStale.length,
      threadIds: actuallyStale.map((thread) =>
        thread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW),
      ),
    };
  }
}
