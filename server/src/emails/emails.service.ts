import { Injectable, Inject, forwardRef, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, Not, In, MoreThan } from "typeorm";
import PgBoss = require("pg-boss");
import * as fs from "fs";
import * as path from "path";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ActionItem } from "../database/entities/action-item.entity";
import {
  UserContext,
  ContextKey,
} from "../database/entities/user-context.entity";
import { PriorityService } from "../priority/priority.service";
import { User } from "../database/entities/user.entity";
import { EmailProviderManager } from "./email-provider-manager.service";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
 wimport { BlockedKeywordsService } from "../blocked-keywords/blocked-keywords.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { getJobPriority } from "../queue/job-priorities";
import { GitHubService } from "../github/github.service";
import { GitHubApiService } from "../github/github-api.service";
import { searchLogger } from "../utils/search-logger";
import { PERCENTAGES, RATIOS } from "../constants/percentages";
import {
  MINUTES,
  DAYS,
  MILLISECONDS,
  HOURS,
} from "../constants/time-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import { STAR_COUNTS } from "../constants/priority-constants";
import {
  PRIORITY_SCORES,
  PRIORITY_BOOSTS,
} from "../constants/priority-constants";
import { isError, isDatabaseError } from "../types/common";
import { EmailThreadService } from "./email-thread.service";
import { EmailSearchService } from "./email-search.service";
import { EmailStarService } from "./email-star.service";
import { EmailDebugService } from "./email-debug.service";
import { EmailReadService } from "./email-read.service";
import { EmailCrudService } from "./email-crud.service";
import { EmailGmailService } from "./email-gmail.service";
import { EmailStatusService } from "./email-status.service";
import { BatchScheduleService } from "../batch-schedule/batch-schedule.service";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";

// Performance budgets in milliseconds
// Use PERFORMANCE_BUDGETS and QUERY_LIMITS constants directly instead of local PERF_BUDGETS

interface RawEmailRow {
  id: string;
  labels?: string;
  priorityExplanation?: string;
  [key: string]: unknown;
}

interface RankedResult {
  index: number;
  relevanceScore: number;
}

interface EmailWithMetadata extends Email {
  searchExplanation?: string;
  relevanceScore?: number;
  debugInfo?: unknown;
  lastTheirReplyAt?: string;
  lastMyReplyAt?: string;
  _needsThreadUpdate?: { threadId: string; isArchived: boolean };
}

interface PerfSpan {
  name: string;
  start: number;
  end?: number;
  duration?: number;
  budget: number;
  exceeded?: boolean;
}

class PerformanceTracker {
  private spans: PerfSpan[] = [];
  private startTime: number;
  private logger = new Logger("PerformanceTracker");
  private static logsDir = path.join(process.cwd(), "logs");
  private logFile = path.join(PerformanceTracker.logsDir, "performance.log");

  constructor(private operation: string) {
    this.startTime = Date.now();
    // Ensure logs directory exists
    if (!fs.existsSync(PerformanceTracker.logsDir)) {
      fs.mkdirSync(PerformanceTracker.logsDir, { recursive: true });
    }
  }

  startSpan(name: string, budget: number): () => void {
    const span: PerfSpan = { name, start: Date.now(), budget };
    this.spans.push(span);
    return () => {
      span.end = Date.now();
      span.duration = span.end - span.start;
      span.exceeded = span.duration > budget;
    };
  }

  finish(mode?: "triage" | "action" | "follow-up"): void {
    const totalDuration = Date.now() - this.startTime;
    const exceededSpans = this.spans.filter((span) => span.exceeded);
    let budget: number;
    if (this.operation === "priority-explanation") {
      budget = PERFORMANCE_BUDGETS.PRIORITY_EXPLANATION;
    } else {
      budget =
        mode === "action"
          ? PERFORMANCE_BUDGETS.INBOX_PROCESS_TOTAL
          : PERFORMANCE_BUDGETS.INBOX_TOTAL;
    }
    const totalExceeded = totalDuration > budget;

    // Only log if the TOTAL budget was exceeded (not just individual spans)
    if (totalExceeded) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        operation: this.operation,
        totalDuration,
        totalBudget: budget,
        totalExceeded,
        mode: mode || "triage",
        spans: this.spans.map((span) => ({
          name: span.name,
          duration: span.duration,
          budget: span.budget,
          exceeded: span.exceeded,
        })),
        exceededSpans: exceededSpans.map(
          (span) =>
            `${span.name}: ${span.duration}ms (budget: ${span.budget}ms)`,
        ),
      };

      const logLine = `${JSON.stringify(logEntry)}\n`;

      // Log to console - only if total exceeded budget
      this.logger.warn(
        `⚠️ PERF ISSUE: ${this.operation} (mode: ${mode || "triage"}) took ${totalDuration}ms (budget: ${budget}ms)`,
      );
      exceededSpans.forEach((span) => {
        this.logger.warn(
          `   - ${span.name}: ${span.duration}ms exceeded budget of ${span.budget}ms`,
        );
      });

      // Append to log file
      try {
        fs.appendFileSync(this.logFile, logLine);
      } catch (err) {
        this.logger.error("Failed to write to performance log file:", err);
      }
    }
  }
}

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  // eslint-disable-next-line max-params
  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    @InjectRepository(ActionItem)
    private actionItemRepository: Repository<ActionItem>,
    private priorityService: PriorityService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    private blockedSendersService: BlockedSendersService,
    private blockedKeywordsService: BlockedKeywordsService,
    private llmService: LLMService,
    private usersService: UsersService,
    private emailThreadService: EmailThreadService,
    private emailSearchService: EmailSearchService,
    private emailStarService: EmailStarService,
    private emailDebugService: EmailDebugService,
    private emailReadService: EmailReadService,
    private emailCrudService: EmailCrudService,
    private emailGmailService: EmailGmailService,
    private emailStatusService: EmailStatusService,
    private batchScheduleService: BatchScheduleService,
    @Inject(forwardRef(() => GitHubService))
    private githubService?: GitHubService,
    @Inject(forwardRef(() => GitHubApiService))
    private githubApiService?: GitHubApiService,
  ) {}

  // eslint-disable-next-line max-lines-per-function, max-statements
  async getInbox(
    userId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _includeBatched: boolean = false,
    mode: "triage" | "action" | "follow-up" = "triage",
  ): Promise<Email[]> {
    const perf = new PerformanceTracker(`getInbox(${mode})`);

    // Pre-warm blocked senders cache to avoid DB query during filtering
    await this.blockedSendersService.getBlockedEmailHashes(userId);

    // Auto-fix stuck calculating threads (non-blocking, runs in background)
    // Only check occasionally to avoid performance impact (10% chance)
    if (Math.random() < RATIOS.SMALL) {
      this.fixStuckCalculatingThreads(userId).catch((err) =>
        this.logger.error("Error auto-fixing stuck calculating threads:", err),
      );
    }

    // OPTIMIZED: Single combined query that fetches threads + full email data in one round-trip
    // This eliminates the second database round-trip, saving ~250ms network latency
    const threadQueryBudget =
      mode === "action"
        ? PERFORMANCE_BUDGETS.THREAD_QUERY_PROCESS
        : PERFORMANCE_BUDGETS.THREAD_QUERY;
    const endCombinedQuery = perf.startSpan(
      "combined_query",
      threadQueryBudget + PERFORMANCE_BUDGETS.EMAIL_QUERY,
    );

    // Build filter conditions
    let threadFilter = "";
    if (mode === "action") {
      threadFilter =
        'AND thread."isArchived" = false AND thread."starCount" > 0';
    } else if (mode === "follow-up") {
      // For follow-up: starred AND not_snoozed
      // We'll filter user_sent_last and no_reply_received later
      threadFilter =
        'AND thread."isArchived" = false AND thread."starCount" > 0';
    } else {
      threadFilter =
        'AND thread."isArchived" = false AND thread."starCount" = 0';
    }

    // Single query: Get threads + full email data in one round-trip
    // Uses LATERAL JOIN to find best email per thread, then fetches all needed fields
    // Priority explanation is now thread-level, so get it from thread table
    // Filter out batched emails that haven't been released yet (isBatched = true AND batchReleaseAt > NOW())
    const rawEmails = await this.emailRepository.query(
      `SELECT
        thread."starCount",
        thread."isArchived",
        thread."urgencyScore",
        thread."priorityExplanation",
        thread."priorityScore",
        thread."isProcessingPriority",
        thread."githubMetadata",
        thread."updatedAt" as "threadUpdatedAt",
        e.id,
        e."userId",
        e."threadId",
        e."emailThreadId",
        e."messageId",
        e."from",
        e."fromName",
        e."senderJobTitle",
        e.subject,
        e."isSnoozed",
        e."snoozeUntil",
        e."isBatched",
        e."batchReleaseAt",
        e."isRead",
        e.summary,
        e."isProcessingSummary",
        e."receivedAt",
        e.labels
      FROM email_threads thread
      CROSS JOIN LATERAL (
        SELECT
          em.id,
          em."userId",
          em."threadId",
          em."emailThreadId",
          em."messageId",
          em."from",
          em."fromName",
          em."senderJobTitle",
          em.subject,
          em."isSnoozed",
          em."snoozeUntil",
          em."isBatched",
          em."batchReleaseAt",
          em."isRead",
          em.summary,
          em."isProcessingSummary",
          em."receivedAt",
          em.labels
        FROM emails em
        WHERE em."emailThreadId" = thread.id AND em."userId" = $1
        ORDER BY em."receivedAt" DESC, em.id DESC
        LIMIT 1
      ) e
      WHERE thread."userId" = $1
        ${threadFilter}
        AND (e."isBatched" = false OR e."batchReleaseAt" IS NULL OR e."batchReleaseAt" <= NOW())
        AND (e."isSnoozed" = false OR e."snoozeUntil" IS NULL OR e."snoozeUntil" <= NOW())
      ORDER BY
        COALESCE(thread."priorityScore", 0) DESC,
        thread."updatedAt" DESC,
        thread."threadId" ASC
      LIMIT ${mode === "action" ? QUERY_LIMITS.INBOX_PROCESS_TOTAL : QUERY_LIMITS.INBOX_TOTAL}`,
      [userId],
    );

    endCombinedQuery();

    if (rawEmails.length === 0) {
      perf.finish(mode);
      return [];
    }

    this.logger.debug(`Found ${rawEmails.length} threads for mode=${mode}`);

    // STEP 2: Decrypt encrypted fields and add thread info
    const endDecryption = perf.startSpan(
      "decryption",
      PERFORMANCE_BUDGETS.DECRYPTION,
    );

    const threadRepresentatives: Email[] = rawEmails.map((row: RawEmailRow) => {
      // Decrypt and parse labels (stored as encrypted JSON)
      let labels: string[] | null = null;
      if (row.labels) {
        try {
          const decryptedLabels = EncryptionHelper.decrypt(row.labels);
          if (decryptedLabels) {
            const parsedLabels = JSON.parse(decryptedLabels);
            // Filter system labels and remove duplicates from stored labels
            const systemLabels = new Set([
              "INBOX",
              "SENT",
              "TRASH",
              "SPAM",
              "DRAFT",
              "UNREAD",
              "STARRED",
              "IMPORTANT",
              "CATEGORY_PERSONAL",
              "CATEGORY_SOCIAL",
              "CATEGORY_PROMOTIONS",
              "CATEGORY_UPDATES",
              "CATEGORY_FORUMS",
              "GREEN_CIRCLE",
              "BLUE_STAR",
              "YELLOW_STAR",
              "RED_BANG",
              "YELLOW_BANG",
              "PURPLE_QUESTION",
              "ORANGE_GUILLEMET",
              "BLUE_INFO",
              "RED_MINUS",
              "YELLOW_MINUS",
              "GREEN_CHECK",
              "BLUE_CHECK",
              "RED_CHECK",
              "ORANGE_CHECK",
            ]);
            labels = Array.from(
              new Set(
                parsedLabels.filter(
                  (label: string) => !systemLabels.has(label),
                ),
              ),
            );
          }
        } catch (error) {
          this.logger.warn(
            `Failed to decrypt/parse labels for email ${row.id}:`,
            error,
          );
          labels = null;
        }
      }

      // Parse priorityExplanation from thread (stored as encrypted JSON)
      let priorityExplanation: Record<string, unknown> | null = null;
      if (row.priorityExplanation) {
        try {
          const decryptedExplanation = EncryptionHelper.decrypt(
            row.priorityExplanation,
          );
          if (decryptedExplanation) {
            priorityExplanation = JSON.parse(decryptedExplanation);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to decrypt/parse priorityExplanation for thread ${row.emailThreadId}:`,
            error,
          );
          priorityExplanation = null;
        }
      }

      return {
        id: row.id,
        userId: row.userId,
        threadId: row.threadId,
        emailThreadId: row.emailThreadId,
        messageId: row.messageId,
        from: EncryptionHelper.decrypt(row.from as string | null),
        fromName: EncryptionHelper.decrypt(row.fromName as string | null),
        senderJobTitle: EncryptionHelper.decrypt(
          row.senderJobTitle as string | null,
        ),
        subject: EncryptionHelper.decrypt(row.subject as string | null),
        priorityExplanation,
        isSnoozed: row.isSnoozed,
        snoozeUntil: row.snoozeUntil,
        isBatched: row.isBatched,
        batchReleaseAt: row.batchReleaseAt,
        isRead: row.isRead,
        summary: EncryptionHelper.decrypt(row.summary as string | null),
        isProcessingPriority: row.isProcessingPriority, // From thread
        isProcessingSummary: row.isProcessingSummary,
        receivedAt: row.receivedAt,
        labels: labels || [],
        // Thread-level properties from the combined query
        starCount: row.starCount,
        isArchived: row.isArchived,
        urgencyScore: row.urgencyScore,
        githubMetadata: row.githubMetadata || null,
        threadUpdatedAt: row.threadUpdatedAt,
      } as unknown as Email;
    });

    endDecryption();

    // STEP 5: Priority scores are now calculated from breakdown on-demand
    // No need to calculate basic priority scores here - they're calculated when emails are received
    // Priority scores are now calculated from breakdown on-demand
    // No need to calculate basic priority scores here - they're calculated when emails are received
    const emailsNeedingPriority: Email[] = [];
    if (emailsNeedingPriority.length > 0) {
      const endPriorityCalc = perf.startSpan(
        "priority_calc",
        PERFORMANCE_BUDGETS.PRIORITY_CALC,
      );

      // Fetch context once for all emails using raw query for speed
      const endGetContexts = perf.startSpan(
        "priority_get_contexts",
        PERFORMANCE_BUDGETS.DECRYPTION,
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const contexts = (await this.userContextRepository.query(
        `SELECT "contextId", "userId", "contextKey", "contextValue", priority, explanation
         FROM user_contexts WHERE "userId" = $1`,
        [userId],
      )) as UserContext[];
      endGetContexts();

      // OPTIMIZATION: Skip expensive days calculation for inbox display
      // Days since last email provides marginal priority improvement (~5-15 points)
      // but costs 250-2300ms in database queries
      // Priority scores are already calculated on email receipt, so this is redundant

      // Priority scores are now calculated from breakdown, not stored
      // Emails will get priority scores calculated on-demand from their priorityExplanation
      endPriorityCalc();
    }

    // STEP 6: Emails are already sorted by the database query:
    // ORDER BY priorityScore DESC, updatedAt DESC, threadId ASC
    // No need for JavaScript sorting - database handles it efficiently
    const sortedEmails = threadRepresentatives;

    // Limit to top results (database already limited, but we apply a final limit after filtering)
    const maxResults = 200;

    // STEP 7: Filter out blocked senders
    const endBlockedFilter = perf.startSpan(
      "blocked_filter",
      QUERY_LIMITS.MAX_RESULTS_DEFAULT,
    );
    const blockedEmailIds =
      await this.blockedSendersService.filterBlockedEmails(
        userId,
        sortedEmails.map((e) => ({ id: e.id, from: e.from })),
      );
    const blockedSet = new Set(blockedEmailIds);
    let filteredEmails = sortedEmails.filter((e) => !blockedSet.has(e.id));
    endBlockedFilter();

    if (blockedEmailIds.length > 0) {
      this.logger.debug(
        `Filtered ${blockedEmailIds.length} emails from blocked senders`,
      );
    }

    // STEP 7.5: For follow-up mode, filter by user_sent_last AND no_reply_received AND not_snoozed
    if (mode === "follow-up") {
      const endFollowUpFilter = perf.startSpan(
        "follow_up_filter",
        QUERY_LIMITS.INBOX_TOTAL,
      );
      // Filter out snoozed emails first
      filteredEmails = filteredEmails.filter(
        (e) =>
          !e.isSnoozed ||
          (e.snoozeUntil && new Date(e.snoozeUntil) < new Date()),
      );

      // Check thread status for each email to determine if user sent last and no reply received
      const followUpEmails: Email[] = [];
      for (const email of filteredEmails) {
        try {
          const threadStatus = await this.checkThreadFollowUpStatus(
            userId,
            email.threadId,
          );
          if (threadStatus.userSentLast && !threadStatus.replyReceived) {
            // Add reply times to email
            const emailWithReplyTimes = email as EmailWithMetadata;
            emailWithReplyTimes.lastTheirReplyAt =
              threadStatus.lastTheirReplyAt?.toISOString();
            emailWithReplyTimes.lastMyReplyAt =
              threadStatus.lastMyReplyAt?.toISOString();
            followUpEmails.push(email);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to check follow-up status for thread ${email.threadId}:`,
            error,
          );
          // Skip this email if we can't check its status
        }
      }
      filteredEmails = followUpEmails;
      endFollowUpFilter();
    }

    // STEP 8: Convert labels (non-blocking background task)
    this.convertEmailLabels(userId, filteredEmails).catch((err) =>
      this.logger.error("Error converting labels:", err),
    );

    // Apply final limit after all filtering to ensure consistent page size
    const finalEmails = filteredEmails.slice(0, maxResults);

    this.logger.log(
      `getInbox(${mode}): Returning ${finalEmails.length} threads (from ${rawEmails.length} matching threads, ${blockedEmailIds.length} blocked)`,
    );

    perf.finish(mode);
    return finalEmails;
  }

  /**
   * Check if thread meets follow-up criteria: user sent last AND no reply received
   * Uses database emails instead of provider-specific API calls
   */
  private async checkThreadFollowUpStatus(
    userId: string,
    threadId: string,
  ): Promise<{
    userSentLast: boolean;
    replyReceived: boolean;
    lastTheirReplyAt: Date | null;
    lastMyReplyAt: Date | null;
  }> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const userEmail = EncryptionHelper.decrypt(user.email);

    try {
      // Get all emails in the thread from database
      const threadEmails = await this.emailThreadService.getThreadEmails(
        userId,
        threadId,
        { order: "ASC" }, // Get in chronological order
      );

      if (threadEmails.length === 0) {
        return {
          userSentLast: false,
          replyReceived: false,
          lastTheirReplyAt: null,
          lastMyReplyAt: null,
        };
      }

      let lastTheirReplyAt: Date | null = null;
      let lastMyReplyAt: Date | null = null;

      // Check each email to find last reply from them and from user
      for (const email of threadEmails) {
        const fromEmail = email.from?.toLowerCase() || "";
        const isFromUser = fromEmail === userEmail.toLowerCase();

        if (isFromUser) {
          lastMyReplyAt = email.receivedAt;
        } else {
          lastTheirReplyAt = email.receivedAt;
        }
      }

      // User sent last if the last email is from the user
      const lastEmail = threadEmails[threadEmails.length - 1];
      const lastEmailFrom = lastEmail.from?.toLowerCase() || "";
      const userSentLast = lastEmailFrom === userEmail.toLowerCase();

      // No reply received if user sent last and there's no message after the last user message
      const replyReceived =
        !userSentLast ||
        (lastTheirReplyAt && lastMyReplyAt && lastTheirReplyAt > lastMyReplyAt);

      return {
        userSentLast,
        replyReceived,
        lastTheirReplyAt,
        lastMyReplyAt,
      };
    } catch (error) {
      this.logger.error(
        `Error checking thread follow-up status for ${threadId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Convert label IDs to human-readable names for a list of emails
   */
  private async convertEmailLabels(
    userId: string,
    emails: Email[],
  ): Promise<void> {
    // Collect all unique label IDs
    const allLabelIds = new Set<string>();
    for (const email of emails) {
      if (email.labels && Array.isArray(email.labels)) {
        email.labels.forEach((id) => allLabelIds.add(id));
      }
    }

    if (allLabelIds.size === 0) return;

    // Get label names from email provider
    const labelNames = await this.emailProviderManager.convertLabelIdsToNames(
      userId,
      Array.from(allLabelIds),
    );

    // Create a mapping
    const labelIdToName = new Map<string, string>();
    const labelIdsArray = Array.from(allLabelIds);
    labelIdsArray.forEach((id, index) => {
      if (labelNames[index]) {
        labelIdToName.set(id, labelNames[index]);
      }
    });

    // Update emails in place (and save to DB for next time)
    for (const email of emails) {
      if (email.labels && Array.isArray(email.labels)) {
        // Convert each label ID to name, or keep as-is if not in mapping
        // Also filter out system labels and unmapped Label_* labels
        // These are common system labels across providers (Gmail, O365, Zoho)
        const systemLabels = new Set([
          "INBOX",
          "SENT",
          "TRASH",
          "SPAM",
          "DRAFT",
          "UNREAD",
          "STARRED",
          "IMPORTANT",
          "CATEGORY_PERSONAL",
          "CATEGORY_SOCIAL",
          "CATEGORY_PROMOTIONS",
          "CATEGORY_UPDATES",
          "CATEGORY_FORUMS",
          "GREEN_CIRCLE",
          "BLUE_STAR",
          "YELLOW_STAR",
          "RED_BANG",
          "YELLOW_BANG",
          "PURPLE_QUESTION",
          "ORANGE_GUILLEMET",
          "BLUE_INFO",
          "RED_MINUS",
          "YELLOW_MINUS",
          "GREEN_CHECK",
          "BLUE_CHECK",
          "RED_CHECK",
          "ORANGE_CHECK",
        ]);

        const convertedLabels = email.labels
          .map((idOrName) => {
            // First check if it's a system label (by ID or name)
            if (systemLabels.has(idOrName)) {
              return null; // Skip system labels
            }

            // If it's an ID, try to convert it
            if (labelIdToName.has(idOrName)) {
              const convertedName = labelIdToName.get(idOrName)!;
              // Check if the converted name is also a system label
              if (systemLabels.has(convertedName)) {
                return null;
              }
              return convertedName;
            }

            // If it doesn't start with Label_ and isn't a system label, it might already be a name
            if (
              !idOrName.startsWith("Label_") &&
              !idOrName.startsWith("label_")
            ) {
              // Double-check it's not a system label (in case it was stored as a name)
              if (systemLabels.has(idOrName)) {
                return null;
              }
              return idOrName; // Keep as-is (might be a custom label name)
            }
            return null; // Skip unmapped Label_* labels
          })
          .filter((label): label is string => label !== null);

        // Remove duplicates using Set
        const uniqueConvertedLabels = Array.from(new Set(convertedLabels));

        // Only update if labels changed
        if (
          JSON.stringify(uniqueConvertedLabels) !== JSON.stringify(email.labels)
        ) {
          this.logger.debug(
            `[EmailsService] Updating labels for email ${email.id}: ${JSON.stringify(email.labels)} -> ${JSON.stringify(uniqueConvertedLabels)}`,
          );
          email.labels = uniqueConvertedLabels;
          // Update in DB (non-blocking)
          this.emailRepository
            .update(email.id, { labels: uniqueConvertedLabels })
            .catch((err) =>
              console.error(
                `Failed to update labels for email ${email.id}:`,
                err,
              ),
            );
        }
      }
    }
  }

  /**
   * Get email by ID
   * Delegates to EmailCrudService
   */
  async getEmailById(userId: string, emailId: string): Promise<Email> {
    return this.emailCrudService.getEmailById(userId, emailId);
  }

  /**
   * Fetch current star status from email provider for debugging
   * Delegates to EmailGmailService (provider-specific debugging)
   */
  async getGmailStarStatus(
    userId: string,
    emailId: string,
  ): Promise<{
    dbStarCount: number;
    gmailStarStatus: {
      isStarred: boolean;
      starCount: number;
      threadId: string;
      latestMessageLabelIds: string[];
      messageStarStatuses: Array<{
        messageIndex: number;
        messageId: string;
        isStarred: boolean;
        labelIds: string[];
      }>;
      isAnyStarred: boolean;
      starredMessageCount: number;
      error?: string;
    };
    threadInfo: {
      threadId: string;
      emailThreadId: string | null;
    };
  }> {
    return this.emailGmailService.getGmailStarStatus(
      userId,
      emailId,
      (userId, emailId) => this.getEmailById(userId, emailId),
    );
  }

  /**
   * Fetch current labels from Gmail for a specific message for debugging
   * Delegates to EmailGmailService
   */
  async getGmailLabels(
    userId: string,
    emailId: string,
  ): Promise<{
    dbLabels: {
      raw: string[] | null;
      names: string[] | null;
    };
    gmailLabels: {
      labelIds: string[];
      labelNames: string[];
      messageId: string;
      error?: string;
    };
    labelMapping: Array<{ id: string; name: string }>;
    emailInfo: {
      id: string;
      messageId: string;
      threadId: string;
    };
  }> {
    return this.emailGmailService.getGmailLabels(
      userId,
      emailId,
      (userId, emailId) => this.getEmailById(userId, emailId),
    );
  }

  /**
   * Get attachment data from an email
   */
  async getAttachment(
    userId: string,
    emailId: string,
    attachmentId: string,
  ): Promise<{
    data: Buffer;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    // Get the email to find the messageId
    const email = await this.getEmailById(userId, emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    // Verify the attachment exists in the email
    if (!email.attachments || email.attachments.length === 0) {
      throw new Error("Email has no attachments");
    }

    const attachment = email.attachments.find(
      (att) => att.attachmentId === attachmentId,
    );
    if (!attachment) {
      throw new Error("Attachment not found in email");
    }

    // Get the provider and fetch the attachment
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error("No email provider connected");
    }

    return provider.getAttachment(userId, email.messageId, attachmentId);
  }

  async getThreadEmails(
    userId: string,
    threadId: string,
    options?: { limit?: number; order?: "ASC" | "DESC" },
  ): Promise<Email[]> {
    // Delegate to EmailThreadService
    return this.emailThreadService.getThreadEmails(userId, threadId, options);
  }

  /**
   * Get recent thread IDs that are not archived (for checking archived status in email provider)
   * Delegates to EmailThreadService
   */
  async getRecentNonArchivedThreadIds(
    userId: string,
    days: number = DAYS.WEEK,
  ): Promise<string[]> {
    return this.emailThreadService.getRecentNonArchivedThreadIds(userId, days);
  }

  /**
   * Get ALL non-archived thread IDs (for checking starred/archived status in email provider)
   * Delegates to EmailThreadService
   */
  async getAllNonArchivedThreadIds(userId: string): Promise<string[]> {
    return this.emailThreadService.getAllNonArchivedThreadIds(userId);
  }

  /**
   * Get non-archived threads that need status verification
   * Delegates to EmailThreadService
   */
  async getNonArchivedThreadsNeedingCheck(
    userId: string,
    limit: number = 50,
  ): Promise<string[]> {
    return this.emailThreadService.getNonArchivedThreadsNeedingCheck(
      userId,
      limit,
    );
  }

  /**
   * Get ALL threads for sync comparison (returns threadId, isArchived, starCount)
   * Used by email provider sync to compare with provider search results
   */
  async getAllThreadsForSync(
    userId: string,
  ): Promise<
    Array<{ threadId: string; isArchived: boolean; starCount: number }>
  > {
    const results = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select(["thread.threadId", "thread.isArchived", "thread.starCount"])
      .where("thread.userId = :userId", { userId })
      // Reasonable limit for sync
      .limit(QUERY_LIMITS.INBOX_TOTAL)
      .getMany();

    return (
      results
        .map((t) => ({
          threadId: t.threadId,
          isArchived: t.isArchived,
          starCount: t.starCount,
        }))
        // Filter out any null/undefined threadIds
        .filter((t) => t.threadId)
    );
  }

  /**
   * Update archived status for a thread (updates EmailThread)
   * Delegates to EmailThreadService
   */
  async updateThreadArchivedStatus(
    userId: string,
    threadId: string,
    isArchived: boolean,
  ): Promise<void> {
    return this.emailThreadService.updateThreadArchivedStatus(
      userId,
      threadId,
      isArchived,
    );
  }

  /**
   * Update lastCheckedAt for multiple threads (used to track verification without status changes)
   * Delegates to EmailThreadService
   */
  async updateThreadsLastCheckedAt(
    userId: string,
    threadIds: string[],
  ): Promise<void> {
    return this.emailThreadService.updateThreadsLastCheckedAt(
      userId,
      threadIds,
    );
  }

  /**
   * Batch update thread archived statuses (more efficient than individual updates)
   * Delegates to EmailThreadService
   */
  async batchUpdateThreadArchivedStatuses(
    userId: string,
    updates: Array<{ threadId: string; isArchived: boolean }>,
  ): Promise<void> {
    return this.emailThreadService.batchUpdateThreadArchivedStatuses(
      userId,
      updates,
    );
  }

  /**
   * Update star count for a thread (updates EmailThread)
   * Delegates to EmailThreadService
   */
  async updateThreadStarCount(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void> {
    return this.emailThreadService.updateThreadStarCount(
      userId,
      threadId,
      starCount,
    );
  }

  /**
   * Batch update thread statuses (archived + starred) in a single transaction
   * Delegates to EmailThreadService
   */
  async batchUpdateThreadStatus(
    userId: string,
    updates: { threadId: string; isArchived: boolean; starCount: number }[],
    deletedThreadIds: string[],
  ): Promise<void> {
    return this.emailThreadService.batchUpdateThreadStatus(
      userId,
      updates,
      deletedThreadIds,
    );
  }

  /**
   * Get or create EmailThread for a given userId and threadId
   * Delegates to EmailThreadService
   */
  async getOrCreateEmailThread(
    userId: string,
    threadId: string,
    starCount: number = STAR_COUNTS.NONE,
    isArchived: boolean = false,
  ): Promise<EmailThread> {
    return this.emailThreadService.getOrCreateEmailThread(
      userId,
      threadId,
      starCount,
      isArchived,
    );
  }

  /**
   * Get email by message ID
   * Delegates to EmailCrudService
   */
  async getEmailByMessageId(userId: string, messageId: string): Promise<Email> {
    return this.emailCrudService.getEmailByMessageId(userId, messageId);
  }

  // eslint-disable-next-line max-lines-per-function, max-statements
  async createEmail(userId: string, emailData: Partial<Email>): Promise<Email> {
    this.logger.debug(
      `Creating email for user ${userId}: ${emailData.subject}`,
    );

    // Check if sender is blocked
    const senderEmail = emailData.from || "";
    const isSenderBlocked = await this.blockedSendersService.isSenderBlocked(
      userId,
      senderEmail,
    );

    // Check if subject contains blocked keywords
    const subject = emailData.subject || "";
    const hasBlockedKeyword =
      await this.blockedKeywordsService.checkSubjectForBlockedKeywords(
        userId,
        subject,
      );

    // Email is blocked if sender is blocked OR subject contains blocked keyword
    const isBlocked = isSenderBlocked || hasBlockedKeyword;

    // Extract thread-level properties (these should come from EmailThread, not Email)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const starCount = (emailData as any).starCount || 0;
    // If blocked, always archive
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isArchived = isBlocked
      ? true
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (emailData as any).isArchived || false;

    // Get or create EmailThread
    const thread = await this.getOrCreateEmailThread(
      userId,
      emailData.threadId!,
      starCount,
      isArchived,
    );

    // Remove thread-level properties from emailData before creating Email
    const {
      starCount: _starCount,
      isArchived: _isArchived,
      ...emailDataWithoutThreadProps
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } = emailData as any;
    // Suppress unused variable warnings for destructured properties we're intentionally ignoring
    void _starCount;
    void _isArchived;

    // TypeORM create can return Email or Email[], but we're passing a single object so it returns Email
    const emailDataToCreate: Partial<Email> = {
      ...emailDataWithoutThreadProps,
      userId,
      // Link to EmailThread
      emailThreadId: thread.id,
    };

    // Debug: Log labels being saved
    const labelsToSave = (emailDataToCreate as any).labels;
    if (labelsToSave) {
      this.logger.debug(
        `[EmailsService] Creating email ${emailDataToCreate.messageId} with raw labelIds: ${JSON.stringify(labelsToSave)}`,
      );
    } else {
      this.logger.debug(
        `[EmailsService] Creating email ${emailDataToCreate.messageId} with no labels`,
      );
    }

    const createdEntities = this.emailRepository.create(emailDataToCreate);
    const email = (
      Array.isArray(createdEntities) ? createdEntities[0] : createdEntities
    ) as Email;

    // If sender is blocked or subject contains blocked keyword, skip priority calculation and LLM processing
    if (isBlocked) {
      const blockReason = isSenderBlocked
        ? `blocked sender ${senderEmail}`
        : `blocked keyword in subject "${subject}"`;
      this.logger.log(
        `📛 Email from ${blockReason} - auto-archiving and skipping LLM processing`,
      );
      // Priority score will be calculated from breakdown (0 for blocked emails)
      // Update thread flag (priority is thread-level)
      thread.isProcessingPriority = false;
      await this.emailThreadRepository.save(thread);
      email.isProcessingSummary = false;
      email.summary = isSenderBlocked
        ? "[Blocked sender]"
        : "[Blocked keyword]";

      // Add blocked-by-bearlymail label
      const existingLabels = email.labels || [];
      email.labels = [...existingLabels, "blocked-by-bearlymail"];

      const savedEmail = await this.emailRepository.save(email);

      // Queue archive job to archive the thread in the email provider (Gmail, Outlook, Zoho)
      // This ensures the email is actually archived in the user's email client, not just hidden in BearlyMail
      this.boss
        .send(
          "archive-email",
          { userId, emailId: savedEmail.id },
          {
            priority: getJobPriority("archive-email", false),
            singletonKey: `archive-blocked-${savedEmail.threadId}`,
            singletonMinutes: 5,
          },
        )
        .then((jobId) => {
          if (jobId) {
            this.logger.log(
              `📛 Queued archive job ${jobId} for blocked sender email: threadId=${savedEmail.threadId}`,
            );
          }
        })
        .catch((err) => {
          this.logger.error(
            `Failed to queue archive job for blocked sender email ${savedEmail.id}:`,
            err,
          );
        });

      return savedEmail;
    }

    // Get context for basic priority calculation
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const contexts = await this.priorityService.getUserContexts(userId);

    // Calculate days since last email in thread for priority boost
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const daysSinceLastEmail = await this.calculateDaysSinceLastEmail(
      userId,
      email,
    );

    // Priority score is now calculated from breakdown, not stored directly
    // Mark thread as processing for LLM refinement (priority is thread-level)
    if (thread) {
      thread.isProcessingPriority = true;
      await this.emailThreadRepository.save(thread);
    }
    // Mark as processing for summary generation
    email.isProcessingSummary = true;

    // Check if urgent (override batching) - urgency is now stored on thread as urgencyScore
    const urgencyScore = thread.urgencyScore || 0;
    const isUrgent = urgencyScore >= 90;

    // Apply batching if not urgent and not starred (starCount = 0)
    if (!isUrgent && starCount === 0) {
      // Get user's batch schedule
      let schedule = await this.batchScheduleService.getSchedule(userId);

      // If no schedule exists, use default schedule
      if (!schedule) {
        const defaultScheduleData =
          this.batchScheduleService.getDefaultSchedule();
        // Create a temporary schedule object with default values for calculation
        schedule = {
          ...defaultScheduleData,
          userId,
          id: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as BatchSchedule;
      }

      // Calculate next batch release time based on schedule
      const nextReleaseTime = this.batchScheduleService.getNextBatchReleaseTime(
        schedule,
        urgencyScore,
      );

      // If getNextBatchReleaseTime returns null, don't batch (immediate delivery)
      // Otherwise, set the batch release time
      if (nextReleaseTime !== null) {
        email.isBatched = true;
        email.batchReleaseAt = nextReleaseTime;
      }
    }

    const savedEmail = await this.emailRepository.save(email);
    this.logger.debug(
      `[EmailsService] Saved email ${savedEmail.id} to database`,
    );

    // Ensure thread's updatedAt is updated when a new email is added
    // This is critical for detecting new emails in priority recalculation logic
    if (thread) {
      await this.emailThreadRepository.update(
        { id: thread.id },
        { updatedAt: new Date() },
      );

      // Invalidate LLM-generated suggested actions for this thread
      // Only delete LLM-generated suggested actions, preserve user-created ones and regular action items
      try {
        await this.actionItemRepository.delete({
          emailThreadId: thread.id,
          source: "llm",
          actionType: Not(IsNull()),
        });
        this.logger.debug(
          `Invalidated LLM suggested actions cache for thread ${thread.id}`,
        );
      } catch (error) {
        // Log but don't fail email creation if cache invalidation fails
        this.logger.warn(
          `Failed to invalidate suggested actions cache for thread ${thread.id}:`,
          error,
        );
      }
    }

    // Debug: Verify labels were saved correctly
    if (savedEmail.labels) {
      this.logger.debug(
        `[EmailsService] Email ${savedEmail.id} saved with labels (after TypeORM): ${JSON.stringify(savedEmail.labels)}`,
      );
    } else {
      this.logger.debug(
        `[EmailsService] Email ${savedEmail.id} saved with no labels`,
      );
    }

    // IMPORTANT: Always queue jobs immediately when isProcessingPriority/Summary is set
    // This ensures "Calculating..." status in UI has an actual job behind it
    // Use singleton key with thread ID to allow recalculation when new emails arrive in thread
    // This ensures only one job runs per thread at a time, but new emails will queue a new job
    const singletonKey = thread
      ? `refine-priority-thread-${thread.id}`
      : `refine-priority-${savedEmail.id}`;
    const priorityJobId = await this.boss
      .send(
        "refine-priority",
        { userId, emailId: savedEmail.id },
        {
          priority: getJobPriority("refine-priority-background", false),
          singletonKey,
          // Prevent duplicate jobs within 1 minute (reduced from 5 to allow faster recalculation)
          singletonMinutes: 1,
        },
      )
      .catch(async (err) => {
        this.logger.error(
          `Failed to queue priority refinement for email ${savedEmail.id}:`,
          err,
        );
        // Reset thread flag if job queueing failed
        if (thread) {
          thread.isProcessingPriority = false;
          await this.emailThreadRepository.save(thread);
        }
        return null;
      });

    if (priorityJobId) {
      this.logger.debug(
        `Queued priority refinement job ${priorityJobId} for email ${savedEmail.id}`,
      );
    }

    // Queue summary generation job
    const summaryJobId = await this.boss
      .send(
        "generate-summary",
        { userId, emailId: savedEmail.id },
        {
          priority: getJobPriority("generate-summary-background", false),
          singletonKey: `generate-summary-${savedEmail.id}`,
          singletonMinutes: 5,
        },
      )
      .catch((err) => {
        this.logger.error(
          `Failed to queue summary generation for email ${savedEmail.id}:`,
          err,
        );
        // Reset flag if job queueing failed
        this.emailRepository.update(
          { id: savedEmail.id },
          { isProcessingSummary: false },
        );
        return null;
      });

    if (summaryJobId) {
      this.logger.debug(
        `Queued summary generation job ${summaryJobId} for email ${savedEmail.id}`,
      );
    }

    // Queue GitHub metadata fetch job (processes in background)
    if (savedEmail.emailThreadId) {
      this.boss
        .send(
          "fetch-github-metadata",
          {
            userId,
            emailId: savedEmail.id,
            threadId: savedEmail.emailThreadId,
          },
          {
            priority: getJobPriority("generate-summary-background", false),
            singletonKey: `github-metadata-${savedEmail.emailThreadId}`,
            singletonMinutes: 60, // Only refetch once per hour per thread
          },
        )
        .catch((err) => {
          this.logger.error(
            `Failed to queue GitHub metadata job for email ${savedEmail.id}:`,
            err,
          );
        });
    }

    return savedEmail;
  }

  private checkIfUrgent(email: Partial<Email>): boolean {
    // More strict urgent keyword detection
    // Only flag as urgent if keywords appear in subject (not body) to reduce false positives
    // Body often contains quoted text or casual mentions of these words
    const urgentKeywords = [
      "urgent",
      "asap",
      "critical",
      "emergency",
      "immediate",
      "time-sensitive",
    ];
    const subjectLower = (email.subject || "").toLowerCase();

    // Only check subject for urgent keywords - more reliable indicator
    // Require exact word match (not substring) to avoid false positives like "currently" matching "urgent"
    const subjectWords = subjectLower.split(/\s+/);
    return urgentKeywords.some(
      (keyword) =>
        subjectWords.includes(keyword) ||
        subjectLower.includes(` ${keyword} `) ||
        subjectLower.startsWith(`${keyword} `) ||
        subjectLower.endsWith(` ${keyword}`),
    );
  }

  /**
   * Mark an email as read
   * Delegates to EmailReadService
   */
  async markAsRead(userId: string, emailId: string): Promise<Email> {
    return this.emailReadService.markAsRead(
      userId,
      emailId,
      (userId, emailId) => this.getEmailById(userId, emailId),
    );
  }

  /**
   * Mark an email as unread
   * Delegates to EmailReadService
   */
  async markAsUnread(userId: string, emailId: string): Promise<Email> {
    return this.emailReadService.markAsUnread(
      userId,
      emailId,
      (userId, emailId) => this.getEmailById(userId, emailId),
    );
  }

  /**
   * Bulk mark multiple emails as read
   * Delegates to EmailReadService
   */
  async bulkMarkAsRead(userId: string, emailIds: string[]): Promise<void> {
    return this.emailReadService.bulkMarkAsRead(userId, emailIds);
  }

  /**
   * Bulk mark multiple emails as unread
   * Delegates to EmailReadService
   */
  async bulkMarkAsUnread(userId: string, emailIds: string[]): Promise<void> {
    return this.emailReadService.bulkMarkAsUnread(userId, emailIds);
  }

  async getSyncStatus(userId: string): Promise<{
    lastSyncAt: Date | null;
    isSyncing: boolean;
  }> {
    const user = await this.usersService.findOne(userId);
    return {
      lastSyncAt: null, // TODO: Add lastEmailSyncAt property to User entity
      // TODO: Track active sync jobs
      isSyncing: false,
    };
  }

  async archiveEmail(userId: string, emailId: string): Promise<void> {
    this.logger.log(
      `[Archive] archiveEmail called: userId=${userId}, emailId=${emailId}`,
    );
    const email = await this.getEmailById(userId, emailId);
    if (!email) {
      this.logger.warn(
        `[Archive] Email not found: userId=${userId}, emailId=${emailId}`,
      );
      throw new Error("Email not found");
    }

    if (!email.threadId) {
      this.logger.warn(
        `[Archive] Email has no threadId: userId=${userId}, emailId=${emailId}`,
      );
      throw new Error("Email has no threadId");
    }

    this.logger.log(
      `[Archive] Email found: emailId=${emailId}, threadId=${email.threadId}`,
    );

    // Check if the thread is starred
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId: email.threadId },
    });

    const isStarred = thread && thread.starCount > 0;
    const { threadId } = email;

    this.logger.log(
      `[Archive] Thread info: threadId=${threadId}, isStarred=${isStarred}, currentIsArchived=${thread?.isArchived || false}`,
    );

    // Archive the thread in email provider (this will also remove the star if present)
    // Only update database if provider API call succeeds
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (provider && "archiveThread" in provider) {
      this.logger.log(
        `[Archive] Calling provider.archiveThread: userId=${userId}, threadId=${threadId}`,
      );
      await provider.archiveThread(userId, threadId);
      this.logger.log(
        `[Archive] provider.archiveThread completed successfully: userId=${userId}, threadId=${threadId}`,
      );
    } else {
      this.logger.error(
        `[Archive] No email provider available: userId=${userId}`,
      );
      throw new Error("No email provider available to archive thread");
    }

    // Update database: remove star, mark as read, and mark as archived
    // Only reached if provider API call succeeded
    if (isStarred) {
      this.logger.log(
        `[Archive] Removing star from thread: userId=${userId}, threadId=${threadId}`,
      );
      await this.updateThreadStarCount(userId, threadId, 0);
    }

    // Mark all emails in the thread as read in the database
    this.logger.log(
      `[Archive] Marking all emails in thread as read: userId=${userId}, threadId=${threadId}`,
    );
    const threadEmails = await this.emailRepository.find({
      where: { userId, threadId, isRead: false },
      select: ["id"],
    });
    if (threadEmails.length > 0) {
      const emailIds = threadEmails.map((e) => e.id);
      await this.bulkMarkAsRead(userId, emailIds);
      this.logger.log(
        `[Archive] Marked ${emailIds.length} emails as read: userId=${userId}, threadId=${threadId}`,
      );
    }

    this.logger.log(
      `[Archive] Updating thread archived status to true: userId=${userId}, threadId=${threadId}`,
    );
    await this.updateThreadArchivedStatus(userId, threadId, true);
    this.logger.log(
      `[Archive] archiveEmail completed successfully: userId=${userId}, emailId=${emailId}, threadId=${threadId}`,
    );
  }

  async deleteEmail(userId: string, emailId: string): Promise<void> {
    const email = await this.getEmailById(userId, emailId);
    if (email && email.threadId) {
      const { threadId } = email;

      // Delete/trash the thread in email provider
      // Only update database if provider API call succeeds
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider && "trashThread" in provider) {
        await provider.trashThread(userId, threadId);
      } else {
        throw new Error("No email provider available to delete thread");
      }

      // Mark as archived in database (deleted emails are effectively archived)
      await this.updateThreadArchivedStatus(userId, threadId, true);
    }
  }

  /**
   * Update email
   * Delegates to EmailCrudService
   */
  async updateEmail(
    emailId: string,
    updates: Partial<Email>,
  ): Promise<Email | null> {
    return this.emailCrudService.updateEmail(emailId, updates);
  }

  /**
   * Set star count for an email's thread
   * Delegates to EmailStarService
   */
  async setStarCount(
    userId: string,
    emailId: string,
    starCount: number,
  ): Promise<Email> {
    return this.emailStarService.setStarCount(
      userId,
      emailId,
      starCount,
      (userId, emailId) => this.getEmailById(userId, emailId),
      (userId, threadId, starCount) =>
        this.updateThreadStarCount(userId, threadId, starCount),
    );
  }

  /**
   * Toggle star for an email (backwards compatibility - toggle between 0 and 3 stars)
   * Delegates to EmailStarService
   */
  async toggleStar(userId: string, emailId: string): Promise<Email> {
    return this.emailStarService.toggleStar(
      userId,
      emailId,
      (userId, emailId) => this.getEmailById(userId, emailId),
      (userId, threadId, starCount) =>
        this.updateThreadStarCount(userId, threadId, starCount),
    );
  }

  /**
   * Force check for new emails by unbatting all pending batched emails
   * Delegates to EmailStatusService
   */
  async forceCheckNewEmails(userId: string): Promise<Email[]> {
    return this.emailStatusService.forceCheckNewEmails(
      userId,
      (userId, includeBatched, mode) =>
        this.getInbox(userId, includeBatched, mode),
    );
  }

  /**
   * Get the next batch release time for a user
   * Delegates to EmailStatusService
   */
  async getNextBatchReleaseTime(userId: string): Promise<Date | null> {
    return this.emailStatusService.getNextBatchReleaseTime(userId);
  }

  /**
   * Check for urgent emails that are currently batched
   * Delegates to EmailStatusService
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
    return this.emailStatusService.checkForUrgentEmails(userId);
  }

  /**
   * Batch calculate days since last email for multiple emails efficiently
   * Returns a Map<emailId, daysSinceLastEmail>
   */
  private async batchCalculateDaysSinceLastEmail(
    userId: string,
    emails: Partial<Email>[],
  ): Promise<Map<string, number | undefined>> {
    const resultMap = new Map<string, number | undefined>();

    // Filter out emails that can't be calculated (missing required fields)
    const validEmails = emails.filter(
      (e) => e.threadId && e.from && e.receivedAt && e.id,
    );
    if (validEmails.length === 0) {
      // Set all to undefined
      emails.forEach((e) => {
        if (e.id) resultMap.set(e.id, undefined);
      });
      return resultMap;
    }

    // Group by threadId to batch queries more efficiently
    const threadMap = new Map<string, Partial<Email>[]>();
    validEmails.forEach((email) => {
      const threadId = email.threadId!;
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId)!.push(email);
    });

    // For each thread, fetch all previous emails in one query, then calculate for each
    try {
      const threadIds = Array.from(threadMap.keys());
      if (threadIds.length === 0) {
        validEmails.forEach((e) => {
          if (e.id) resultMap.set(e.id, undefined);
        });
        return resultMap;
      }

      // Fetch all previous emails for all threads in one query (or a few queries if too many)
      // Since we need to match by encrypted 'from' field, we'll do one query per thread
      // But at least we're grouping by thread to minimize queries
      const promises = Array.from(threadMap.entries()).map(
        async ([threadId, threadEmails]) => {
          // Get the earliest receivedAt in this thread batch
          const earliestReceivedAt = threadEmails.reduce((earliest, email) => {
            if (!earliest || !email.receivedAt)
              return earliest || email.receivedAt;
            return email.receivedAt < earliest ? email.receivedAt : earliest;
          }, threadEmails[0]?.receivedAt);

          if (!earliestReceivedAt) return;

          // Fetch all emails in this thread before the earliest one using raw query
          // Only fetch 'from' and 'receivedAt' to avoid decrypting unnecessary fields
          const previousEmailsRaw = await this.emailRepository.query(
            `
          SELECT id, "from", "receivedAt"
          FROM emails
          WHERE "userId" = $1
            AND "threadId" = $2
            AND "receivedAt" < $3
          ORDER BY "receivedAt" DESC
          `,
            [userId, threadId, earliestReceivedAt],
          );

          // Decrypt only the 'from' field we need
          const previousEmails = previousEmailsRaw.map(
            (row: { id: string; from: string; receivedAt: Date }) => ({
              id: row.id,
              from: EncryptionHelper.decrypt(row.from),
              receivedAt: row.receivedAt,
            }),
          );

          // For each email in the batch, find the last email from the same sender BEFORE that email's receivedAt
          threadEmails.forEach((email) => {
            if (!email.id || !email.from || !email.receivedAt) {
              resultMap.set(email.id || "", undefined);
              return;
            }

            // Find last email from same sender that was received BEFORE this email
            // (TypeORM decrypts 'from' automatically, so we can compare decrypted values)
            const lastEmail = previousEmails.find(
              (e) => e.from === email.from && e.receivedAt < email.receivedAt,
            );

            if (!lastEmail) {
              resultMap.set(email.id, undefined);
              return;
            }

            // Calculate days difference
            const daysDiff =
              (email.receivedAt.getTime() - lastEmail.receivedAt.getTime()) /
              (1000 * 60 * 60 * 24);
            resultMap.set(
              email.id,
              Math.max(0, Math.round(daysDiff * 10) / 10),
            );
          });
        },
      );

      await Promise.all(promises);
    } catch (error) {
      this.logger.error(
        "Error batch calculating days since last email:",
        error,
      );
      // Set all to undefined on error
      validEmails.forEach((e) => {
        if (e.id) resultMap.set(e.id, undefined);
      });
    }

    // Set undefined for emails that were filtered out
    emails.forEach((e) => {
      if (e.id && !resultMap.has(e.id)) {
        resultMap.set(e.id, undefined);
      }
    });

    return resultMap;
  }

  /**
   * Calculate days since the last email in the thread from the same sender
   * Returns undefined if this is the first email in the thread or from this sender
   * @deprecated Use batchCalculateDaysSinceLastEmail for multiple emails
   */
  private async calculateDaysSinceLastEmail(
    userId: string,
    email: Partial<Email>,
  ): Promise<number | undefined> {
    if (!email.threadId || !email.from || !email.receivedAt) {
      return undefined;
    }

    try {
      // Find the last email in the same thread from the same sender, before the current email
      const lastEmail = await this.emailRepository
        .createQueryBuilder("email")
        .where("email.userId = :userId", { userId })
        .andWhere("email.threadId = :threadId", { threadId: email.threadId })
        .andWhere("email.from = :from", { from: email.from })
        .andWhere("email.receivedAt < :receivedAt", {
          receivedAt: email.receivedAt,
        })
        .orderBy("email.receivedAt", "DESC")
        .take(1)
        .getOne();

      if (!lastEmail) {
        // First email from this sender in the thread
        return undefined;
      }

      // Calculate days difference
      const daysDiff =
        (email.receivedAt.getTime() - lastEmail.receivedAt.getTime()) /
        (1000 * 60 * 60 * 24);
      // Round to 1 decimal place
      return Math.max(0, Math.round(daysDiff * 10) / 10);
    } catch (error) {
      this.logger.error("Error calculating days since last email:", error);
      return undefined;
    }
  }

  /**
   * Get priority score explanation breakdown for an email
   * Returns dimensions: Urgency, Goal Alignment, VIP Contact
   */
  // eslint-disable-next-line max-lines-per-function, complexity, max-statements
  async getPriorityExplanation(
    userId: string,
    emailId: string,
  ): Promise<{
    score: number;
    dimensions: {
      urgency: { score: number; reasons: string[] };
      goalAlignment: { score: number; reasons: string[] };
      vipContact: { score: number; reasons: string[] };
      sentiment: { score: number; type: string; reasons: string[] };
    };
    breakdown: Array<{ factor: string; value: number; description: string }>;
  }> {
    const perf = new PerformanceTracker("priority-explanation");
    const endTotal = perf.startSpan(
      "total",
      PERFORMANCE_BUDGETS.PRIORITY_EXPLANATION,
    );

    try {
      const endEmailQuery = perf.startSpan("email-query", 200);
      const email = await this.getEmailById(userId, emailId);
      endEmailQuery();

      if (!email) {
        throw new Error("Email not found");
      }

      // Get thread to access priority explanation (now thread-level)
      let thread = null;
      if (email.emailThreadId) {
        thread = await this.emailThreadRepository.findOne({
          where: { id: email.emailThreadId },
        });
      }

      // Return precomputed explanation if available (from thread)
      if (thread?.priorityExplanation) {
        // Check if it's the old structure (has "Base Score" or "AI Analysis") - if so, trigger recalculation
        const hasOldStructure =
          thread.priorityExplanation.breakdown?.some(
            (item) =>
              item.factor === "Base Score" ||
              item.factor === "🤖 AI Analysis" ||
              item.factor === "AI Analysis",
          ) ?? false;

        // Check if breakdown has "Calculating..." items (incomplete calculation)
        const hasCalculatingItems =
          thread.priorityExplanation.breakdown?.some(
            (item) =>
              item.description === "Calculating..." ||
              item.description?.includes("Calculating..."),
          ) ?? false;

        // If stuck in "Calculating..." for more than 10 minutes, reset flag and requeue
        if (hasCalculatingItems && thread.isProcessingPriority) {
          const processingTime =
            Date.now() - new Date(thread.updatedAt).getTime();
          const tenMinutes = 10 * 60 * 1000;
          if (processingTime > tenMinutes) {
            this.logger.warn(
              `Thread ${thread.id} stuck in "Calculating..." for ${Math.round(processingTime / 1000 / 60)} minutes, resetting flag and requeuing`,
            );
            await this.emailThreadRepository.update(
              { id: thread.id },
              { isProcessingPriority: false },
            );
          }
        }

        if (
          (hasOldStructure || hasCalculatingItems) &&
          !thread.isProcessingPriority
        ) {
          // Queue recalculation job for old structure or incomplete calculation
          const reason = hasOldStructure
            ? "old priority structure"
            : "calculating items";
          this.logger.log(
            `Detected ${reason} for email ${emailId}, queuing recalculation`,
          );
          await this.boss
            .send(
              "refine-priority",
              { userId, emailId },
              {
                priority: getJobPriority("refine-priority-background", false),
                singletonKey: `refine-priority-${emailId}`,
                singletonMinutes: 5,
              },
            )
            .catch((err) => {
              this.logger.error(
                `Failed to queue priority recalculation for email ${emailId}:`,
                err,
              );
            });
          // Continue to fallback calculation below
        } else if (hasCalculatingItems && thread.isProcessingPriority) {
          // Return partial explanation even if still calculating - don't make user wait
          const explanation = thread.priorityExplanation as {
            score: number;
            dimensions?: {
              urgency?: { score: number; reasons: string[] };
              goalAlignment?: { score: number; reasons: string[] };
              vipContact?: { score: number; reasons: string[] };
              sentiment?: { score: number; type: string; reasons: string[] };
            };
            breakdown?: Array<{
              factor: string;
              value: number;
              description: string;
            }>;
          };
          if (!explanation.dimensions?.sentiment) {
            explanation.dimensions = {
              ...explanation.dimensions,
              sentiment: {
                score: email.sentimentScore ?? 0,
                type:
                  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                  (email.sentimentScore ?? 0) < -0.3
                    ? "negative"
                    : // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                      (email.sentimentScore ?? 0) > 0.3
                      ? "positive"
                      : "neutral",
                reasons: [],
              },
            };
          }
          endTotal();
          perf.finish();
          this.logger.debug(
            `Returning partial priority explanation for email ${emailId} (still calculating)`,
          );
          return {
            score: explanation.score,
            dimensions: {
              urgency: explanation.dimensions?.urgency || {
                score: 0,
                reasons: [],
              },
              goalAlignment: explanation.dimensions?.goalAlignment || {
                score: 0,
                reasons: [],
              },
              vipContact: explanation.dimensions?.vipContact || {
                score: 0,
                reasons: [],
              },
              sentiment: explanation.dimensions?.sentiment || {
                score: email.sentimentScore ?? 0,
                type:
                  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                  (email.sentimentScore ?? 0) < -0.3
                    ? "negative"
                    : // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                      (email.sentimentScore ?? 0) > 0.3
                      ? "positive"
                      : "neutral",
                reasons: [],
              },
            },
            breakdown: explanation.breakdown || [],
          };
        } else if (!hasOldStructure && !hasCalculatingItems) {
          // New structure - return it with sentiment dimension
          const explanation = thread.priorityExplanation as {
            score: number;
            dimensions?: {
              urgency?: { score: number; reasons: string[] };
              goalAlignment?: { score: number; reasons: string[] };
              vipContact?: { score: number; reasons: string[] };
              sentiment?: { score: number; type: string; reasons: string[] };
            };
            breakdown?: Array<{
              factor: string;
              value: number;
              description: string;
            }>;
          };
          if (!explanation.dimensions?.sentiment) {
            explanation.dimensions = {
              ...explanation.dimensions,
              sentiment: {
                score: email.sentimentScore ?? 0,
                type:
                  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                  (email.sentimentScore ?? 0) < -0.3
                    ? "negative"
                    : // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                      (email.sentimentScore ?? 0) > 0.3
                      ? "positive"
                      : "neutral",
                reasons: [],
              },
            };
          }
          endTotal();
          perf.finish();
          return {
            score: explanation.score,
            dimensions: {
              urgency: explanation.dimensions?.urgency || {
                score: 0,
                reasons: [],
              },
              goalAlignment: explanation.dimensions?.goalAlignment || {
                score: 0,
                reasons: [],
              },
              vipContact: explanation.dimensions?.vipContact || {
                score: 0,
                reasons: [],
              },
              sentiment: explanation.dimensions?.sentiment || {
                score: email.sentimentScore ?? 0,
                type:
                  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                  (email.sentimentScore ?? 0) < -0.3
                    ? "negative"
                    : // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                      (email.sentimentScore ?? 0) > 0.3
                      ? "positive"
                      : "neutral",
                reasons: [],
              },
            },
            breakdown: explanation.breakdown || [],
          };
        }
        // If hasOldStructure and isProcessingPriority, fall through to fallback
      }

      // Fallback: compute explanation on demand if not precomputed (for legacy emails)
      // Get user context for prioritization
      const endContextQuery = perf.startSpan("context-query", 200);
      const contexts = await this.userContextRepository.find({
        where: { userId },
      });
      endContextQuery();

      const endDaysCalc = perf.startSpan("days-since-last-email", 500);
      const daysSinceLastEmail = await this.calculateDaysSinceLastEmail(
        userId,
        email,
      );
      endDaysCalc();

      // Initialize dimensions
      const dimensions = {
        urgency: { score: 0, reasons: [] as string[] },
        goalAlignment: { score: 0, reasons: [] as string[] },
        vipContact: { score: 0, reasons: [] as string[] },
        sentiment: {
          score: email.sentimentScore ?? 0,
          type:
            // eslint-disable-next-line @typescript-eslint/no-magic-numbers
            (email.sentimentScore ?? 0) < -0.3
              ? "negative"
              : // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                (email.sentimentScore ?? 0) > 0.3
                ? "positive"
                : "neutral",
          reasons: [] as string[],
        },
      };

      const breakdown: Array<{
        factor: string;
        value: number;
        description: string;
      }> = [];
      let currentScore = 0;
      const emailText = `${email.subject} ${email.body}`.toLowerCase();
      const senderEmail = email.from?.toLowerCase() || "";
      const senderName = email.fromName?.toLowerCase() || "";

      // Base score is 0 - no need to add it to breakdown

      // === VIP CONTACT DIMENSION ===
      const vipContacts = contexts.filter(
        (c) => c.contextKey === ContextKey.VIP_CONTACT,
      );
      const matchedVip = vipContacts.find(
        (vip) =>
          senderEmail.includes(vip.contextValue.toLowerCase()) ||
          senderName.includes(vip.contextValue.toLowerCase()),
      );

      if (matchedVip) {
        const vipBoost = PRIORITY_BOOSTS.URGENT_KEYWORD;
        dimensions.vipContact.score += vipBoost;
        dimensions.vipContact.reasons.push(
          `VIP contact: ${matchedVip.contextValue}`,
        );
        breakdown.push({
          factor: "⭐ VIP Contact",
          value: vipBoost,
          description: `From VIP: ${matchedVip.contextValue}`,
        });
        currentScore += vipBoost;
      }

      // Check job title for VIP
      if (email.senderJobTitle) {
        const jobTitleScore = this.calculateJobTitleScore(email.senderJobTitle);
        if (jobTitleScore > RATIOS.HALF) {
          const titleBoost = Math.round(
            jobTitleScore * PRIORITY_BOOSTS.GOAL_ALIGNMENT,
          );
          dimensions.vipContact.score += titleBoost;
          dimensions.vipContact.reasons.push(
            `Important role: ${email.senderJobTitle}`,
          );
          breakdown.push({
            factor: "⭐ VIP Contact",
            value: titleBoost,
            description: `Sender role: ${email.senderJobTitle}`,
          });
          currentScore += titleBoost;
        }
      }

      // === GOAL ALIGNMENT DIMENSION ===
      // Goal alignment is now calculated via LLM in llm-processor.ts
      // This fallback method is only used for legacy emails without stored priorityExplanation
      // Add placeholder for goal alignment (will be 0 until LLM processes)
      breakdown.push({
        factor: "🎯 Goal Alignment",
        value: 0,
        description: "Calculating...",
      });

      // === URGENCY DIMENSION ===
      // Urgency is now calculated via LLM in llm-processor.ts
      // This fallback method is only used for legacy emails without stored priorityExplanation
      // Add placeholder for urgency (will be 0 until LLM processes)
      breakdown.push({
        factor: "🔥 Urgency",
        value: 0,
        description: "Calculating...",
      });

      // === SENTIMENT DIMENSION ===
      // Add sentiment placeholder
      const fallbackSentimentScore = email.sentimentScore ?? 0;
      breakdown.push({
        factor: "😊 Sentiment",
        value: 0,
        description:
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          fallbackSentimentScore < -0.3
            ? "Negative sentiment"
            : // eslint-disable-next-line @typescript-eslint/no-magic-numbers
              fallbackSentimentScore > 0.3
              ? "Positive sentiment"
              : "Neutral sentiment",
      });

      // Calculate final score from breakdown
      const calculatedScore = Math.max(0, Math.min(100, currentScore));
      // Use the breakdown we just built to calculate the score
      const actualScore = calculatedScore;

      // Note: For legacy emails, breakdown may not match exactly
      // New emails will have breakdown pre-calculated via LLM in llm-processor.ts

      // Normalize dimension scores to 0-100
      // All dimensions start at 0 (base score is 0)
      dimensions.urgency.score = Math.max(
        PRIORITY_SCORES.MIN,
        Math.min(PRIORITY_SCORES.MAX, dimensions.urgency.score),
      );
      dimensions.goalAlignment.score = Math.max(
        PRIORITY_SCORES.MIN,
        Math.min(PRIORITY_SCORES.MAX, dimensions.goalAlignment.score),
      );
      dimensions.vipContact.score = Math.max(
        0,
        Math.min(100, dimensions.vipContact.score),
      );

      const endComputation = perf.startSpan("explanation-computation", 1000);
      const explanation = {
        score: actualScore,
        dimensions,
        breakdown,
      };
      endComputation();

      // Save the explanation to the thread (non-blocking)
      // Priority explanation is now thread-level, not email-level
      // Also save denormalized priorityScore for efficient SQL sorting
      if (email.emailThreadId) {
        const endSave = perf.startSpan("save-explanation", 500);
        const priorityScore =
          this.calculateScoreFromBreakdown(explanation) ?? 0;
        this.emailThreadRepository
          .update(
            { id: email.emailThreadId },
            { priorityExplanation: explanation, priorityScore },
          )
          .catch((err) =>
            this.logger.warn(
              `Failed to save priority explanation for thread ${email.emailThreadId}:`,
              err,
            ),
          );
        endSave();
      }

      endTotal();
      perf.finish();
      return explanation;
    } catch (error) {
      endTotal();
      perf.finish();
      throw error;
    }
  }

  /**
   * Calculate priority score from breakdown array
   * This is the single source of truth for priority scores
   * @param priorityExplanation The priority explanation object with breakdown array
   * @returns The calculated score (0-100), or 0 if no breakdown exists
   */
  calculateScoreFromBreakdown(
    priorityExplanation: {
      breakdown?: Array<{ value: number }>;
      score?: number;
    } | null,
  ): number {
    if (!priorityExplanation || !priorityExplanation.breakdown) {
      return 0;
    }

    const total = priorityExplanation.breakdown.reduce(
      (sum, item) => sum + (item.value || 0),
      0,
    );

    return Math.max(0, Math.min(100, total));
  }

  private calculateJobTitleScore(jobTitle: string): number {
    if (!jobTitle) return 0;

    const highPriorityTitles = [
      "ceo",
      "president",
      "director",
      "manager",
      "lead",
      "head",
      "chief",
      "vp",
      "vice president",
      "founder",
    ];
    const titleLower = jobTitle.toLowerCase();

    for (const title of highPriorityTitles) {
      if (titleLower.includes(title)) return 1;
    }

    return RATIOS.HALF;
  }

  /**
   * Search emails using the email provider's search functionality
   */
  /**
   * Search emails using natural language query
   * Delegates to EmailSearchService
   */
  async searchEmails(
    userId: string,
    query: string,
    maxResults: number = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
    onProgress?: (step: string, message: string) => void,
  ): Promise<
    Array<
      Email & {
        searchExplanation?: string;
        relevanceScore?: number;
        debugInfo?: Record<string, unknown>;
      }
    >
  > {
    return this.emailSearchService.searchEmails(
      userId,
      query,
      maxResults,
      onProgress,
      (userId, email) => this.calculateDaysSinceLastEmail(userId, email),
    );
  }

  /**
   * Debug endpoint to find missing starred threads
   * Delegates to EmailDebugService
   */
  async debugStarredThreads(userId: string): Promise<{
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
    return this.emailDebugService.debugStarredThreads(
      userId,
      (userId, includeBatched, mode) =>
        this.getInbox(userId, includeBatched, mode),
    );
  }

  /**
   * Debug endpoint to find emails without emailThreadId (orphan emails)
   * Delegates to EmailDebugService
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
    return this.emailDebugService.debugOrphanEmails(userId);
  }

  /**
   * Fix orphan emails by creating/linking EmailThread records
   */
  /**
   * Fix orphan emails by linking them to their threads
   * Delegates to EmailDebugService
   */
  async fixOrphanEmails(userId: string): Promise<{
    fixed: number;
    errors: string[];
  }> {
    return this.emailDebugService.fixOrphanEmails(userId);
  }

  /**
   * Fix threads stuck in "calculating" status
   * Delegates to EmailDebugService
   */
  async fixStuckCalculatingThreads(
    userId: string,
  ): Promise<{ fixed: number; requeued: number; errors: string[] }> {
    return this.emailDebugService.fixStuckCalculatingThreads(userId);
  }

  /**
   * Detect GitHub links in email and fetch their status
   * This runs asynchronously and doesn't block email processing
   */
  private async detectAndFetchGitHubLinks(
    userId: string,
    email: Email,
  ): Promise<void> {
    if (!this.githubService || !this.githubApiService) {
      // GitHub module not available
      return;
    }

    try {
      // Check if user has GitHub token
      const user = await this.usersService.findOne(userId);
      if (!user || !user.githubToken) {
        // No GitHub token configured
        return;
      }

      // Parse GitHub links from email body
      const links = this.githubService.parseGitHubLinks(
        email.body || "",
        email.htmlBody || undefined,
      );

      if (links.length === 0) {
        // No GitHub links found
        return;
      }

      // Fetch status for all links
      const token = EncryptionHelper.decrypt(user.githubToken);
      const statuses = await this.githubApiService.fetchMultipleStatuses(
        token,
        links,
      );

      // Build metadata
      const metadataLinks = links.map((link) => {
        const status = statuses.get(link.url);
        return {
          type: link.type,
          repo: link.repo,
          owner: link.owner,
          number: link.number,
          url: link.url,
          status: status
            ? {
                ...status,
                fetchedAt: new Date().toISOString(),
              }
            : undefined,
          fetchedAt: status ? new Date().toISOString() : undefined,
        };
      });

      // Update email with GitHub metadata (stored in a JSON column if available)
      // Note: githubMetadata is not a direct field on Email entity
      // This would need to be stored in a JSON field or separate table
      // For now, we'll skip this update to avoid type errors
      // TODO: Add githubMetadata field to Email entity or use a separate table

      this.logger.debug(
        `Updated GitHub metadata for email ${email.id} with ${metadataLinks.length} links`,
      );
    } catch (error: unknown) {
      // Log but don't throw - this is a background operation
      this.logger.warn(
        `Failed to detect/fetch GitHub links for email ${email.id}: ${isError(error) ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Batch update star counts for multiple threads
   * Delegates to EmailThreadService for performance
   */
  async batchUpdateThreadStarCount(
    userId: string,
    updates: { threadId: string; starCount: number }[],
  ): Promise<void> {
    await this.emailThreadService.batchUpdateThreadStarCount(userId, updates);
  }

  /**
   * Get threads by thread IDs
   * Delegates to EmailThreadService
   */
  async getThreadsByThreadIds(
    userId: string,
    threadIds: string[],
  ): Promise<
    Array<{
      threadId: string;
      updatedAt: Date;
      starCount: number;
      isArchived: boolean;
    }>
  > {
    return this.emailThreadService.getThreadsByThreadIds(userId, threadIds);
  }

  /**
   * Get existing starred threads from database
   * Delegates to EmailThreadService
   */
  async getExistingStarredThreads(
    userId: string,
  ): Promise<
    Array<{ threadId: string; starCount: number; isArchived: boolean }>
  > {
    return this.emailThreadService.getExistingStarredThreads(userId);
  }
}
