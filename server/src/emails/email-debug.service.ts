import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { DataSource, In, IsNull, Not } from "typeorm";

import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS, SECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { isError } from "../types/common";
import type {
  GmailApiResolveResult,
  ThreadLookupResult,
} from "./email-debug.types";
import {
  analyzeStarredThread,
  buildConditionReasons,
  buildGmailUrlNotFoundReasons,
  buildThreadVisibility,
  computeStarredSummary,
  detectGmailUrlFormat,
  extractGmailUrlAccountIndex,
  extractGmailUrlId,
  StarredThreadEntry,
} from "./email-debug-thread.helpers";
import { EmailProviderManager } from "./email-provider-manager.service";
import { GmailProvider } from "./providers/gmail.provider";

const SYNC_HISTORY_DEFAULT_LIMIT: number = QUERY_LIMITS.MAX_RESULTS_DEFAULT;
import type { PgBoss } from "pg-boss";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { getJobPriority } from "../queue/job-priorities";
import {
  type CategoryDebugData,
  EmailDebugCategoryService,
} from "./email-debug-category.service";
import { SyncHistoryEntry, SyncHistoryService } from "./sync-history.service";

@Injectable()
export class EmailDebugService {
  private readonly logger = new Logger(EmailDebugService.name);

  constructor(
    private dataSource: DataSource,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    @Inject(forwardRef(() => GmailProvider))
    private gmailProvider: GmailProvider,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
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

  /**
   * Debug starred threads — answers "why isn't this Gmail-starred email showing in
   * Action / Follow-Up?" for every starred thread.
   *
   * Returns a flat `threads` list (one entry per Gmail starred thread) with an
   * actionable `reason` field, plus aggregate `summary` counts.
   */
  /**
   * Fetch and reconcile starred thread data for debug display.
   * Returns all the maps/arrays needed by debugStarredThreads().
   */
  private async fetchStarredThreadData(userId: string): Promise<{
    gmailStarredThreadIds: string[];
    gmailInboxSet: Set<string>;
    gmailError: string | undefined;
    dbThreadMap: Map<string, EmailThread>;
    latestEmailsByThread: Map<string, Email>;
  }> {
    let gmailStarredThreadIds: string[] = [];
    let gmailInboxSet = new Set<string>();
    let gmailError: string | undefined;

    try {
      const [starredIds, inboxIds] = await Promise.all([
        this.gmailProvider.getStarredInboxThreadIds(userId),
        this.gmailProvider
          .getInboxThreadIds(userId)
          .catch(() => [] as string[]),
      ]);
      gmailStarredThreadIds = starredIds;
      gmailInboxSet = new Set(inboxIds);
      if (gmailStarredThreadIds.length === 0) {
        const provider =
          await this.emailProviderManager.getPrimaryProvider(userId);
        if (!provider) gmailError = ERROR_MESSAGES.NO_EMAIL_PROVIDER;
      }
      this.logger.debug(
        `Gmail threads.list found ${gmailStarredThreadIds.length} starred inbox threads, ${gmailInboxSet.size} inbox threads`,
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

    const dbThreads =
      gmailStarredThreadIds.length > 0
        ? await this.emailThreadRepository.find({
            where: { userId, threadId: In(gmailStarredThreadIds) },
            select: {
              id: true,
              threadId: true,
              starCount: true,
              isArchived: true,
              categoryId: true,
              syncStatus: true,
              syncStatusUpdatedAt: true,
              isBatched: true,
              batchReleaseAt: true,
            },
          })
        : [];

    const dbThreadMap = new Map(
      dbThreads.map((thread) => [thread.threadId, thread]),
    );
    const dbThreadInternalIds = dbThreads.map((thread) => thread.id);

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

      for (const email of emails) {
        if (
          email.emailThreadId &&
          !latestEmailsByThread.has(email.emailThreadId)
        ) {
          latestEmailsByThread.set(email.emailThreadId, email);
        }
      }
    }

    return {
      gmailStarredThreadIds,
      gmailInboxSet,
      gmailError,
      dbThreadMap,
      latestEmailsByThread,
    };
  }

  /**
   * Fetch stale unsynced threads (syncStatus='unsynced' for >5 min).
   * Extracted from debugStarredThreads to reduce its line count.
   */
  private async fetchStaleUnsyncedThreads(userId: string): Promise<
    Array<{
      threadId: string;
      syncStatusUpdatedAt: string | null;
      minutesUnsynced: number;
      isArchived: boolean;
      starCount: number;
    }>
  > {
    const fiveMinutesAgo = new Date(Date.now() - 5 * MILLISECONDS.MINUTE);
    const entities = await this.emailThreadRepository.find({
      where: { userId, syncStatus: "unsynced" },
      select: {
        threadId: true,
        syncStatusUpdatedAt: true,
        isArchived: true,
        starCount: true,
      },
    });
    return entities
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
  }

  async debugStarredThreads(userId: string): Promise<{
    gmailError?: string;
    summary: {
      gmailStarredCount: number;
      foundInDb: number;
      notInDb: number;
      inActionOrFollowUp: number;
      starredInDbButHidden: number;
      notStarredInDb: number;
      archivedInBearlyMail: number;
      archiveConflicts: number;
    };
    threads: Array<{
      threadId: string;
      subject: string | null;
      inDb: boolean;
      isStarredInDb: boolean;
      category: string | null;
      appearsInActionOrFollowUp: boolean;
      reason: string;
      isArchivedInDb: boolean;
      isInGmailInbox: boolean;
      syncStatus: "synced" | "unsynced";
      hasUnsyncedChanges: boolean;
      archiveStatusConflict: boolean;
    }>;
    staleUnsyncedThreads: Array<{
      threadId: string;
      syncStatusUpdatedAt: string | null;
      minutesUnsynced: number;
      isArchived: boolean;
      starCount: number;
    }>;
  }> {
    // Steps 1-3: fetch starred thread IDs + DB thread data + latest emails
    const {
      gmailStarredThreadIds,
      gmailInboxSet,
      gmailError,
      dbThreadMap,
      latestEmailsByThread,
    } = await this.fetchStarredThreadData(userId);

    // Step 4: Build per-thread result rows
    const threads: StarredThreadEntry[] = await Promise.all(
      gmailStarredThreadIds.map((gmailThreadId) =>
        analyzeStarredThread({
          gmailThreadId,
          dbThreadMap,
          latestEmailsByThread,
          gmailInboxSet,
          isSenderBlocked: (uid, senderEmail) =>
            this.blockedSendersService.isSenderBlocked(uid, senderEmail),
          userId,
        }),
      ),
    );

    // Step 5: Compute summary
    const summary = computeStarredSummary(
      threads,
      gmailStarredThreadIds.length,
    );

    // Step 6: stale unsynced threads
    const staleUnsyncedThreads = await this.fetchStaleUnsyncedThreads(userId);

    return {
      ...(gmailError ? { gmailError } : {}),
      summary,
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
      select: {
        id: true,
        threadId: true,
        emailThreadId: true,
        subject: true,
        from: true,
        receivedAt: true,
      },
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
      select: {
        id: true,
        threadId: true,
        updatedAt: true,
        priorityExplanation: true,
      },
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
          select: {
            id: true,
          },
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
          JOB_NAMES.REFINE_PRIORITY,
          { userId, emailId: email.id },
          {
            priority: getJobPriority(
              JOB_NAMES.REFINE_PRIORITY_BACKGROUND,
              false,
            ),
            singletonKey: `refine-priority-thread-${thread.id}`,
            singletonSeconds: SECONDS.MINUTE,
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
    const { reasons, isBlocked } = await buildConditionReasons(
      thread,
      emails,
      userId,
      latestEmail,
      (uid, senderEmail) =>
        this.blockedSendersService.isSenderBlocked(uid, senderEmail),
    );

    // 4. Determine visibility in each mode
    const {
      wouldShowInTriage,
      wouldShowInAction,
      wouldShowInFollowUp,
      baseConditionsMet,
    } = buildThreadVisibility(thread, latestEmail, isBlocked);

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
        batchDecisionReason: thread.batchDecisionReason,
        wasDeliveredEarly: thread.wasDeliveredEarly,
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
      select: {
        id: true,
        threadId: true,
        emailThreadId: true,
      },
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
  ): Promise<GmailApiResolveResult> {
    try {
      const { hit, diagnostics } = await this.gmailProvider.lookupByGmailUrlId(
        userId,
        urlId,
      );
      if (!hit) {
        return {
          foundInGmailApi: false,
          apiMessageId: null,
          apiThreadId: null,
          subject: null,
          from: null,
          receivedAt: null,
          connectedEmail: diagnostics.connectedEmail,
          idsTried: diagnostics.idsTried,
          attempts: diagnostics.attempts,
        };
      }
      return {
        foundInGmailApi: true,
        apiMessageId: hit.messageId,
        apiThreadId: hit.threadId,
        subject: hit.subject,
        from: hit.from,
        receivedAt: hit.receivedAt?.toISOString() ?? null,
        connectedEmail: diagnostics.connectedEmail,
        idsTried: diagnostics.idsTried,
        attempts: diagnostics.attempts,
      };
    } catch (error) {
      const errorMessage = isError(error) ? error.message : "unknown error";
      this.logger.warn(
        `Gmail API lookup failed for URL ID "${urlId}" (user ${userId}): ${errorMessage}. ` +
          `Check Gmail auth scope for the debug context and verify the ID is a valid legacy message ID.`,
      );
      return {
        foundInGmailApi: false,
        apiMessageId: null,
        apiThreadId: null,
        subject: null,
        from: null,
        receivedAt: null,
        connectedEmail: null,
        idsTried: [],
        attempts: [],
        error:
          `Could not resolve legacy message ID "${urlId}" via Gmail API — ${errorMessage}. ` +
          `Check Gmail auth scope for admin debug.`,
      };
    }
  }

  async lookupByGmailUrl(
    userId: string,
    gmailUrl: string,
  ): Promise<
    ThreadLookupResult & {
      gmailApiResult?: GmailApiResolveResult;
    }
  > {
    const detectedFormat = detectGmailUrlFormat(gmailUrl);
    const urlId = extractGmailUrlId(gmailUrl);
    this.logger.log(
      `Looking up Gmail URL for user ${userId}, format: ${detectedFormat}, extracted URL ID: ${urlId}`,
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
      reasons: buildGmailUrlNotFoundReasons({
        urlId,
        detectedFormat,
        gmailApiResult,
        accountIndex: extractGmailUrlAccountIndex(gmailUrl),
      }),
      gmailApiResult,
    };
  }

  async getCategoryDebugData(
    userId: string,
    emailId: string,
    options?: { deep?: boolean },
  ): Promise<CategoryDebugData> {
    return this.emailDebugCategoryService.getCategoryDebugData(
      userId,
      emailId,
      options,
    );
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
      select: {
        id: true,
        threadId: true,
        syncStatusUpdatedAt: true,
        isArchived: true,
      },
    });

    const actuallyStale = staleThreads.filter(
      (thread) =>
        thread.syncStatusUpdatedAt &&
        thread.syncStatusUpdatedAt < fiveMinutesAgo,
    );

    this.logger.log(
      `Found ${actuallyStale.length} stale unsynced threads for user ${userId}`,
    );

    if (actuallyStale.length > 0) {
      // Reconcile with Gmail before marking synced — avoids blindly resetting
      // syncStatus on threads whose provider sync failed (e.g. rate limit).
      let gmailFetchSucceeded = false;
      let gmailInboxSet = new Set<string>();
      try {
        const inboxIds = await this.gmailProvider.getInboxThreadIds(userId);
        gmailInboxSet = new Set(inboxIds);
        gmailFetchSucceeded = true;
        this.logger.log(
          `Fetched ${gmailInboxSet.size} Gmail inbox thread IDs for reconciliation`,
        );
      } catch (error: unknown) {
        this.logger.error(
          "Failed to fetch Gmail inbox IDs for stale thread reconciliation — will mark synced without archive fix:",
          error,
        );
      }

      const now = new Date();

      // Batch updates: separate threads into two groups to avoid N+1 DB writes.
      // When Gmail fetch succeeded, derive archive status from inbox presence;
      // otherwise fall back to the existing isArchived value for each thread.
      const toMarkUnarchived = actuallyStale.filter((thread) =>
        gmailFetchSucceeded
          ? gmailInboxSet.has(thread.threadId)
          : !thread.isArchived,
      );
      const toMarkArchived = actuallyStale.filter((thread) =>
        gmailFetchSucceeded
          ? !gmailInboxSet.has(thread.threadId)
          : thread.isArchived,
      );

      if (toMarkUnarchived.length > 0) {
        await this.emailThreadRepository.update(
          { id: In(toMarkUnarchived.map((thread) => thread.id)) },
          { isArchived: false, syncStatus: "synced", syncStatusUpdatedAt: now },
        );
      }
      if (toMarkArchived.length > 0) {
        await this.emailThreadRepository.update(
          { id: In(toMarkArchived.map((thread) => thread.id)) },
          { isArchived: true, syncStatus: "synced", syncStatusUpdatedAt: now },
        );
      }
    }

    return {
      fixed: actuallyStale.length,
      threadIds: actuallyStale.map((thread) =>
        thread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW),
      ),
    };
  }
}
