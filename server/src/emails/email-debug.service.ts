import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { DataSource, IsNull, Not } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "./email-provider-manager.service";
import { GmailProvider } from "./providers/gmail.provider";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { QUERY_LIMITS } from "../constants/query-limits";
import { isError } from "../types/common";
import { MILLISECONDS } from "../constants/time-constants";

const SYNC_HISTORY_DEFAULT_LIMIT: number = QUERY_LIMITS.MAX_RESULTS_DEFAULT;
import PgBoss from "pg-boss";
import { getJobPriority } from "../queue/job-priorities";
import { SyncHistoryService, SyncHistoryEntry } from "./sync-history.service";
import {
  EmailDebugCategoryService,
  type CategoryDebugData,
} from "./email-debug-category.service";

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

  private async analyzeStarredThread(
    thread: EmailThread,
    threadEmails: Email[],
    gmailStarredThreadIds: string[],
    gmailError: string | undefined,
    actionTabEmails: Email[],
  ): Promise<{
    threadId: string;
    starCount: number;
    isArchived: boolean;
    isSnoozed: boolean;
    emailCount: number;
    latestSubject: string;
    latestFrom: string;
    issues: string[];
    inGmail: boolean;
  }> {
    const latestEmail = [...threadEmails].sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )[0];

    const issues: string[] = [];
    const inGmail = gmailStarredThreadIds.includes(thread.threadId);

    if (thread.isArchived) {
      issues.push("Thread is ARCHIVED");
    }

    if (!inGmail && !gmailError) {
      issues.push("NOT STARRED IN GMAIL (or not in inbox)");
    }

    const allSnoozed = threadEmails.every(
      (e) =>
        e.isSnoozed && e.snoozeUntil && new Date(e.snoozeUntil) > new Date(),
    );
    if (allSnoozed && threadEmails.length > 0) {
      issues.push("All emails in thread are SNOOZED");
    }

    const inActionTab = actionTabEmails.some(
      (e) => e.threadId === thread.threadId,
    );
    if (!inActionTab && issues.length === 0) {
      issues.push("NOT IN ACTION TAB (unknown reason)");
    }

    return {
      threadId: `${thread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...`,
      starCount: thread.starCount,
      isArchived: thread.isArchived,
      isSnoozed: allSnoozed,
      emailCount: threadEmails.length,
      latestSubject:
        latestEmail?.subject?.substring(
          0,
          QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH,
        ) || "N/A",
      latestFrom: latestEmail?.fromName || latestEmail?.from || "N/A",
      issues,
      inGmail,
    };
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
   * Debug endpoint to find missing starred threads
   * Compares Gmail starred emails with what's in our DB
   */
  async debugStarredThreads(
    userId: string,
    getInbox: (
      userId: string,
      includeBatched: boolean,
      mode: "triage" | "action" | "follow-up",
    ) => Promise<{ emails: Email[]; total: number; hasMore: boolean }>,
  ): Promise<{
    gmail: {
      starredThreadCount: number;
      starredThreadIds: string[];
      error?: string;
    };
    database: {
      starredThreadCount: number;
      starredEmailCount: number;
    };
    actionTabResults: number;
    comparison: {
      inGmailNotInDb: string[];
      inDbNotInGmail: string[];
      inDbButArchived: string[];
    };
    starredThreads: Array<{
      threadId: string;
      starCount: number;
      isArchived: boolean;
      isSnoozed: boolean;
      emailCount: number;
      latestSubject: string;
      latestFrom: string;
      issues: string[];
      inGmail: boolean;
    }>;
    missingFromProcessTab: Array<{
      threadId: string;
      reason: string;
      details: Record<string, unknown>;
    }>;
  }> {
    // 1. Search Gmail for starred emails in inbox
    let gmailStarredThreadIds: string[] = [];
    let gmailError: string | undefined;

    try {
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider) {
        // Search for starred emails in inbox
        const starredEmails = await provider.searchEmails(
          userId,
          "is:starred is:inbox",
          100,
        );
        // Get unique thread IDs
        gmailStarredThreadIds = [
          ...new Set(starredEmails.map((e) => e.threadId)),
        ];
        this.logger.debug(
          `Gmail search found ${starredEmails.length} starred emails in ${gmailStarredThreadIds.length} threads`,
        );
      } else {
        gmailError = "No email provider connected";
      }
    } catch (error: unknown) {
      gmailError = isError(error) ? error.message : "Failed to search Gmail";
      this.logger.error("Error searching Gmail for starred emails:", error);
    }

    // 2. Get all starred threads from email_threads table
    const allStarredThreads = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select(["thread.threadId", "thread.starCount", "thread.isArchived"])
      .where("thread.userId = :userId", { userId })
      .andWhere("thread.starCount > 0")
      .getMany();

    // dbStarredThreadIds used for comparison below via dbThreadIds

    // 3. Get emails in starred threads
    const starredThreadIds = allStarredThreads.map((t) => t.id);
    const emailsInStarredThreads: Email[] =
      starredThreadIds.length > 0
        ? await this.emailRepository
            .createQueryBuilder("email")
            .where("email.userId = :userId", { userId })
            .andWhere('email."emailThreadId" IN (:...threadIds)', {
              threadIds: starredThreadIds,
            })
            .getMany()
        : [];

    // 4. Run the actual getInbox query for action mode to see what's returned
    const actionTabResult = await getInbox(userId, false, "action");
    const actionTabEmails: Email[] = actionTabResult.emails;

    // 6. Compare Gmail vs DB
    const dbThreadIds = allStarredThreads.map((t) => t.threadId);
    const inGmailNotInDb = gmailStarredThreadIds.filter(
      (id) => !dbThreadIds.includes(id),
    );
    const inDbNotInGmail = dbThreadIds.filter(
      (id) => !gmailStarredThreadIds.includes(id),
    );
    const inDbButArchived = allStarredThreads
      .filter((t) => t.isArchived)
      .map((t) => t.threadId);

    // 7. Identify issues for each starred thread
    const threadDetails = await Promise.all(
      allStarredThreads.map((thread) => {
        const threadEmails = emailsInStarredThreads.filter(
          (e) => e.emailThreadId === thread.id,
        );
        return this.analyzeStarredThread(
          thread,
          threadEmails,
          gmailStarredThreadIds,
          gmailError,
          actionTabEmails,
        );
      }),
    );

    // 8. Identify threads missing from process tab
    const missingFromProcessTab = threadDetails
      .filter((t) => t.issues.length > 0)
      .map((t) => ({
        threadId: t.threadId,
        reason: t.issues.join(", "),
        details: {
          starCount: t.starCount,
          isArchived: t.isArchived,
          isSnoozed: t.isSnoozed,
          emailCount: t.emailCount,
          subject: t.latestSubject,
          from: t.latestFrom,
          inGmail: t.inGmail,
        },
      }));

    return {
      gmail: {
        starredThreadCount: gmailStarredThreadIds.length,
        starredThreadIds: gmailStarredThreadIds.map(
          (id) => `${id.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...`,
        ),
        error: gmailError,
      },
      database: {
        starredThreadCount: allStarredThreads.length,
        starredEmailCount: emailsInStarredThreads.length,
      },
      actionTabResults: actionTabEmails.length,
      comparison: {
        inGmailNotInDb: inGmailNotInDb.map(
          (id) => `${id.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...`,
        ),
        inDbNotInGmail: inDbNotInGmail.map(
          (id) => `${id.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...`,
        ),
        inDbButArchived: inDbButArchived.map(
          (id) => `${id.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...`,
        ),
      },
      starredThreads: threadDetails,
      missingFromProcessTab,
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
      threadIdsWithEmails.map((r) => r.emailThreadId),
    );

    const threadsWithoutEmails = allThreads
      .filter((t) => !threadIdsWithEmailsSet.has(t.id))
      .map((t) => ({
        id: `${t.id.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...`,
        threadId: `${t.threadId.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...`,
        starCount: t.starCount,
        isArchived: t.isArchived,
      }));

    return {
      totalEmailsInDb,
      emailsWithThreadId,
      orphanEmails: totalEmailsInDb - emailsWithThreadId,
      orphanEmailDetails: orphanEmailsList.map((e) => ({
        id: e.id,
        threadId: e.threadId || "",
        emailThreadId: e.emailThreadId,
        subject: e.subject || "",
        from: e.from || "",
        receivedAt: e.receivedAt,
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
      emails: emails.map((e) => ({
        id: e.id,
        subject: e.subject || "",
        from: e.from || "",
        receivedAt: e.receivedAt,
        isSnoozed: e.isSnoozed,
        snoozeUntil: e.snoozeUntil,
        isBatched: e.isBatched,
        batchReleaseAt: e.batchReleaseAt,
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
}
