import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, Not } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "./email-provider-manager.service";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { QUERY_LIMITS } from "../constants/query-limits";
import { isError } from "../types/common";
import PgBoss = require("pg-boss");
import { getJobPriority } from "../queue/job-priorities";

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
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private blockedSendersService: BlockedSendersService,
  ) {}

  /**
   * Debug endpoint to find missing starred threads
   * Compares Gmail starred emails with what's in our DB
   */
  // eslint-disable-next-line max-lines-per-function
  async debugStarredThreads(
    userId: string,
    getInbox: (
      userId: string,
      includeBatched: boolean,
      mode: "triage" | "action" | "follow-up",
    ) => Promise<Email[]>,
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
    const actionTabEmails: Email[] = await getInbox(userId, false, "action");

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
      allStarredThreads.map(async (thread) => {
        const threadEmails = emailsInStarredThreads.filter(
          (e) => e.emailThreadId === thread.id,
        );
        const latestEmail = threadEmails.sort(
          (a, b) =>
            new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
        )[0];

        const issues: string[] = [];
        const inGmail = gmailStarredThreadIds.includes(thread.threadId);

        // Check if archived
        if (thread.isArchived) {
          issues.push("Thread is ARCHIVED");
        }

        // Check if in Gmail
        if (!inGmail && !gmailError) {
          issues.push("NOT STARRED IN GMAIL (or not in inbox)");
        }

        // Check if all emails are snoozed
        const allSnoozed = threadEmails.every(
          (e) =>
            e.isSnoozed &&
            e.snoozeUntil &&
            new Date(e.snoozeUntil) > new Date(),
        );
        if (allSnoozed && threadEmails.length > 0) {
          issues.push("All emails in thread are SNOOZED");
        }

        // Check if thread appears in action tab results
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
      return threadAge > 10 * 60 * 1000 || !hasBreakdown;
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

    const reasons: string[] = [];

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

    if (emails.length === 0) {
      reasons.push(
        "Thread exists but has no emails linked to it (orphan thread)",
      );
    }

    // 3. Check thread-level conditions
    if (thread.isArchived) {
      reasons.push(
        "Thread is ARCHIVED - archived threads don't show in any inbox view",
      );
    }

    // 4. Check email-level conditions for the latest email
    const latestEmail = emails[0];
    if (latestEmail) {
      // Check if sender is blocked
      const isBlocked = await this.blockedSendersService.isSenderBlocked(
        userId,
        latestEmail.from || "",
      );
      if (isBlocked) {
        reasons.push(`Sender "${latestEmail.from}" is BLOCKED`);
      }

      // Check if snoozed
      if (
        latestEmail.isSnoozed &&
        latestEmail.snoozeUntil &&
        new Date(latestEmail.snoozeUntil) > new Date()
      ) {
        reasons.push(
          `Email is SNOOZED until ${new Date(latestEmail.snoozeUntil).toISOString()}`,
        );
      }

      // Check if batched
      if (
        latestEmail.isBatched &&
        latestEmail.batchReleaseAt &&
        new Date(latestEmail.batchReleaseAt) > new Date()
      ) {
        reasons.push(
          `Email is BATCHED and will be released at ${new Date(latestEmail.batchReleaseAt).toISOString()}`,
        );
      }
    }

    // 5. Determine visibility in each mode
    const isNotArchived = !thread.isArchived;
    const hasNoBlockedSender =
      !latestEmail ||
      !(await this.blockedSendersService.isSenderBlocked(
        userId,
        latestEmail.from || "",
      ));
    const isNotSnoozed =
      !latestEmail ||
      !latestEmail.isSnoozed ||
      !latestEmail.snoozeUntil ||
      new Date(latestEmail.snoozeUntil) <= new Date();
    const isNotBatched =
      !latestEmail ||
      !latestEmail.isBatched ||
      !latestEmail.batchReleaseAt ||
      new Date(latestEmail.batchReleaseAt) <= new Date();

    const baseConditionsMet =
      isNotArchived && hasNoBlockedSender && isNotSnoozed && isNotBatched;

    // Triage: starCount = 0
    const wouldShowInTriage = baseConditionsMet && thread.starCount === 0;

    // Action: starCount > 0
    const wouldShowInAction = baseConditionsMet && thread.starCount > 0;

    // Follow-up: starCount > 0 (additional filtering for user_sent_last happens elsewhere)
    const wouldShowInFollowUp = baseConditionsMet && thread.starCount > 0;

    // 6. Add mode-specific reasons
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
}
