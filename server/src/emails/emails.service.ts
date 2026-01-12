import { Injectable, Inject, forwardRef, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, Not, In, MoreThan } from "typeorm";
import PgBoss = require("pg-boss");
import * as fs from "fs";
import * as path from "path";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  UserContext,
  ContextKey,
} from "../database/entities/user-context.entity";
import { PriorityService } from "../priority/priority.service";
import { User } from "../database/entities/user.entity";
import { EmailProviderManager } from "./email-provider-manager.service";
import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { google } from "googleapis";
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
import { GMAIL_LABELS } from "../constants/email-labels";
import { isError, isDatabaseError } from "../types/common";
import { EmailThreadService } from "./email-thread.service";

// Performance budgets in milliseconds
// Use PERFORMANCE_BUDGETS and QUERY_LIMITS constants directly instead of local PERF_BUDGETS

interface RawEmailRow {
  id: string;
  labels?: string;
  priorityExplanation?: string;
  [key: string]: unknown;
}

interface GmailHeader {
  name: string;
  value?: string;
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
    private priorityService: PriorityService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    private blockedSendersService: BlockedSendersService,
    private llmService: LLMService,
    private usersService: UsersService,
    private emailThreadService: EmailThreadService,
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
        thread."isProcessingPriority",
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
      LIMIT 200`,
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
              "INBOX", "SENT", "TRASH", "SPAM", "DRAFT", "UNREAD", "STARRED", "IMPORTANT",
              "CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS", "CATEGORY_UPDATES", "CATEGORY_FORUMS",
              "GREEN_CIRCLE", "BLUE_STAR", "YELLOW_STAR", "RED_BANG", "YELLOW_BANG", "PURPLE_QUESTION", "ORANGE_GUILLEMET",
              "BLUE_INFO", "RED_MINUS", "YELLOW_MINUS", "GREEN_CHECK", "BLUE_CHECK", "RED_CHECK", "ORANGE_CHECK",
            ]);
            labels = Array.from(new Set(
              parsedLabels.filter((label: string) => !systemLabels.has(label))
            ));
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

    // STEP 6: Sort by priority (DESC), then by received date (DESC)
    const sortedEmails = threadRepresentatives.sort((a, b) => {
      // Calculate scores - use 0 as fallback (not MEDIUM_THRESHOLD) to avoid inflating scores
      // Emails without priority explanation should sort to the bottom
      const aScore =
        this.calculateScoreFromBreakdown((a as any).priorityExplanation) ?? 0;
      const bScore =
        this.calculateScoreFromBreakdown((b as any).priorityExplanation) ?? 0;
      if (Math.abs(bScore - aScore) > RATIOS.TINY) {
        return bScore - aScore; // Higher scores first (DESC order)
      }
      return (
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );
    });

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

    this.logger.log(
      `getInbox(${mode}): Returning ${filteredEmails.length} threads (from ${rawEmails.length} matching threads, ${blockedEmailIds.length} blocked)`,
    );

    perf.finish(mode);
    return filteredEmails;
  }

  /**
   * Check if thread meets follow-up criteria: user sent last AND no reply received
   */
  // eslint-disable-next-line max-statements
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
    if (!user?.googleCalendarAccessToken) {
      throw new Error("User not connected to Gmail");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    // Handle token refresh
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await this.usersService.update(userId, {
          googleCalendarAccessToken: tokens.access_token,
          ...(tokens.refresh_token && {
            googleCalendarRefreshToken: tokens.refresh_token,
          }),
        });
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const userEmail = EncryptionHelper.decrypt(user.email);

    try {
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });

      const messages = thread.data.messages || [];
      if (messages.length === 0) {
        return {
          userSentLast: false,
          replyReceived: false,
          lastTheirReplyAt: null,
          lastMyReplyAt: null,
        };
      }

      // Sort messages by internalDate (timestamp)
      const sortedMessages = messages.sort((a, b) => {
        const aDate = parseInt(a.internalDate || "0");
        const bDate = parseInt(b.internalDate || "0");
        return aDate - bDate;
      });

      let lastTheirReplyAt: Date | null = null;
      let lastMyReplyAt: Date | null = null;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let lastMessageIsFromUser = false;

      // Check each message to find last reply from them and from user
      for (const msg of sortedMessages) {
        const labelIds = msg.labelIds || [];
        const isFromUser = labelIds.includes("SENT");

        if (isFromUser) {
          lastMyReplyAt = new Date(parseInt(msg.internalDate || "0"));
          lastMessageIsFromUser = true;
        } else {
          // Get the "From" header to check if it's from the user
          const headers = msg.payload?.headers || [];
          const fromHeader =
            headers.find((h: GmailHeader) => h.name === "From")?.value || "";
          const fromEmail = fromHeader.match(/<(.+)>/)
            ? fromHeader.match(/<(.+)>/)?.[1]
            : fromHeader;

          // If not from user, it's from them
          if (
            fromEmail &&
            fromEmail.toLowerCase() !== userEmail.toLowerCase()
          ) {
            lastTheirReplyAt = new Date(parseInt(msg.internalDate || "0"));
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            lastMessageIsFromUser = false;
          }
        }
      }

      // User sent last if the last message has SENT label
      const lastMessage = sortedMessages[sortedMessages.length - 1];
      const lastMessageLabelIds = lastMessage.labelIds || [];
      const userSentLast = lastMessageLabelIds.includes("SENT");

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

    // Get label names from Gmail
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
        const systemLabels = new Set([
          "INBOX", "SENT", "TRASH", "SPAM", "DRAFT", "UNREAD", "STARRED", "IMPORTANT",
          "CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS", "CATEGORY_UPDATES", "CATEGORY_FORUMS",
          "GREEN_CIRCLE", "BLUE_STAR", "YELLOW_STAR", "RED_BANG", "YELLOW_BANG", "PURPLE_QUESTION", "ORANGE_GUILLEMET",
          "BLUE_INFO", "RED_MINUS", "YELLOW_MINUS", "GREEN_CHECK", "BLUE_CHECK", "RED_CHECK", "ORANGE_CHECK",
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
            if (!idOrName.startsWith("Label_") && !idOrName.startsWith("label_")) {
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
        if (JSON.stringify(uniqueConvertedLabels) !== JSON.stringify(email.labels)) {
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

  async getEmailById(userId: string, emailId: string): Promise<Email> {
    return this.emailRepository.findOne({
      where: { id: emailId, userId },
    });
  }

  /**
   * Fetch current star status from Gmail for debugging
   * Returns both DB starCount and Gmail star status for comparison
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
    const email = await this.getEmailById(userId, emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    // Get thread info from DB
    let dbStarCount = 0;
    if (email.emailThreadId) {
      const thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId, userId },
      });
      dbStarCount = thread?.starCount || 0;
    }

    // Fetch from Gmail
    let gmailStarStatus = {
      isStarred: false,
      starCount: 0,
      threadId: email.threadId,
      latestMessageLabelIds: [] as string[],
      messageStarStatuses: [] as Array<{
        messageIndex: number;
        messageId: string;
        isStarred: boolean;
        labelIds: string[];
      }>,
      isAnyStarred: false,
      starredMessageCount: 0,
      error: undefined as string | undefined,
    };

    try {
      const user = await this.usersService.findOne(userId);
      if (!user?.googleCalendarAccessToken) {
        gmailStarStatus.error = "User not connected to Gmail";
        return {
          dbStarCount,
          gmailStarStatus,
          threadInfo: {
            threadId: email.threadId,
            emailThreadId: email.emailThreadId,
          },
        };
      }

      const { google } = await import("googleapis");
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
      );
      oauth2Client.setCredentials({
        access_token: user.googleCalendarAccessToken,
        refresh_token: user.googleCalendarRefreshToken,
      });

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      // Get thread from Gmail
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: email.threadId,
        format: "metadata",
        metadataHeaders: ["Subject", "From"],
      });

      const thread = threadData.data;
      if (thread.messages && thread.messages.length > 0) {
        // Check all messages in the thread for STARRED label
        const messageStarStatuses = thread.messages.map((msg, idx) => {
          const labelIds = msg.labelIds || [];
          const isStarred = labelIds.includes("STARRED");
          return {
            messageIndex: idx,
            messageId: msg.id || "",
            isStarred,
            labelIds,
          };
        });

        const isAnyStarred = messageStarStatuses.some((m) => m.isStarred);
        const starredMessageCount = messageStarStatuses.filter(
          (m) => m.isStarred,
        ).length;

        // Get the latest message (last in array) for backward compatibility
        const latestMessage = thread.messages[thread.messages.length - 1];
        const latestLabelIds = latestMessage.labelIds || [];
        const latestIsStarred = latestLabelIds.includes("STARRED");

        gmailStarStatus = {
          isStarred: isAnyStarred, // Use isAnyStarred instead of just latest message
          starCount: isAnyStarred ? 3 : 0,
          threadId: email.threadId,
          latestMessageLabelIds: latestLabelIds,
          messageStarStatuses,
          isAnyStarred,
          starredMessageCount,
          error: undefined,
        };
      } else {
        gmailStarStatus.error = "Thread has no messages";
      }
    } catch (error) {
      gmailStarStatus.error = isError(error)
        ? error.message
        : "Unknown error fetching from Gmail";
      this.logger.error("Error fetching Gmail star status:", error);
    }

    return {
      dbStarCount,
      gmailStarStatus,
      threadInfo: {
        threadId: email.threadId,
        emailThreadId: email.emailThreadId,
      },
    };
  }

  /**
   * Fetch current labels from Gmail for a specific message for debugging
   * Returns both DB labels and Gmail labels for comparison
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
    const email = await this.getEmailById(userId, emailId);
    if (!email) {
      throw new Error("Email not found");
    }

    // Get labels from DB (need to query raw encrypted value)
    // TypeORM automatically decrypts when using findOne, so we need to use raw query
    let dbLabelsRaw: string[] | null = null;
    const emailWithLabels = await this.emailRepository.query(
      `SELECT labels FROM emails WHERE id = $1 AND "userId" = $2`,
      [email.id, userId],
    );

    if (emailWithLabels && emailWithLabels.length > 0 && emailWithLabels[0].labels) {
      try {
        const decryptedLabels = EncryptionHelper.decrypt(
          emailWithLabels[0].labels,
        );
        if (decryptedLabels) {
          dbLabelsRaw = JSON.parse(decryptedLabels);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to decrypt/parse labels for email ${email.id}:`,
          error,
        );
        dbLabelsRaw = null;
      }
    }

    // Fetch from Gmail
    let gmailLabelIds: string[] = [];
    let gmailLabelNames: string[] = [];
    let labelMapping: Array<{ id: string; name: string }> = [];
    let gmailError: string | undefined;

    try {
      const user = await this.usersService.findOne(userId);
      if (!user?.googleCalendarAccessToken) {
        gmailError = "User not connected to Gmail";
        return {
          dbLabels: {
            raw: dbLabelsRaw,
            names: dbLabelsRaw, // If stored as names, they're already names
          },
          gmailLabels: {
            labelIds: [],
            labelNames: [],
            messageId: email.messageId,
            error: gmailError,
          },
          labelMapping: [],
          emailInfo: {
            id: email.id,
            messageId: email.messageId,
            threadId: email.threadId,
          },
        };
      }

      const { google } = await import("googleapis");
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI,
      );
      oauth2Client.setCredentials({
        access_token: user.googleCalendarAccessToken,
        refresh_token: user.googleCalendarRefreshToken,
      });

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      // Fetch specific message from Gmail (not thread)
      const messageData = await gmail.users.messages.get({
        userId: "me",
        id: email.messageId,
        format: "metadata",
      });

      const message = messageData.data;
      if (message.labelIds) {
        gmailLabelIds = message.labelIds;

        // Convert label IDs to names (this will filter system labels and deduplicate)
        gmailLabelNames = await this.emailProviderManager.convertLabelIdsToNames(
          userId,
          gmailLabelIds,
        );

        // Get the label map to show ID -> Name mapping
        // Access GmailProvider through EmailProviderManager to get the raw label map
        const provider = await this.emailProviderManager.getProvider(userId, "gmail");
        if (provider && "getGmailLabels" in provider) {
          const labelMap = await (provider as any).getGmailLabels(userId);
          // Create mapping for all label IDs (including system labels for debugging)
          labelMapping = gmailLabelIds.map((id) => ({
            id,
            name: labelMap.get(id) || id,
          }));
        } else {
          // Fallback: build mapping from convertLabelIdsToNames result
          // Note: convertLabelIdsToNames filters system labels, so we need to get raw map
          const provider = await this.emailProviderManager.getProvider(userId, "gmail");
          if (provider && "getGmailLabels" in provider) {
            const labelMap = await (provider as any).getGmailLabels(userId);
            labelMapping = gmailLabelIds.map((id) => ({
              id,
              name: labelMap.get(id) || id,
            }));
          } else {
            labelMapping = gmailLabelIds.map((id) => ({
              id,
              name: id, // Fallback to ID if we can't get the map
            }));
          }
        }
      } else {
        gmailError = "Message has no labelIds";
      }
    } catch (error) {
      gmailError = isError(error)
        ? error.message
        : "Unknown error fetching from Gmail";
      this.logger.error("Error fetching Gmail labels:", error);
    }

    return {
      dbLabels: {
        raw: dbLabelsRaw,
        names: dbLabelsRaw, // DB stores converted names (or IDs if not yet converted)
      },
      gmailLabels: {
        labelIds: gmailLabelIds,
        labelNames: gmailLabelNames,
        messageId: email.messageId,
        error: gmailError,
      },
      labelMapping,
      emailInfo: {
        id: email.id,
        messageId: email.messageId,
        threadId: email.threadId,
      },
    };
  }

  async getThreadEmails(
    userId: string,
    threadId: string,
    options?: { limit?: number; order?: "ASC" | "DESC" },
  ): Promise<Email[]> {
    // CRITICAL: Use query builder with explicit select to avoid decrypting body/htmlBody
    // These are large encrypted fields that cause significant slowdown
    // The frontend can fetch body/htmlBody separately if needed for individual emails
    const queryBuilder = this.emailRepository
        .createQueryBuilder("email")
        .select([
          "email.id",
          "email.userId",
          "email.threadId",
          "email.messageId",
          "email.from",
          "email.fromName",
          "email.senderJobTitle",
          "email.subject",
          "email.isSnoozed",
          "email.snoozeUntil",
          "email.isBatched",
          "email.batchReleaseAt",
          "email.isRead",
          "email.summary",
          "email.receivedAt",
          "email.labels", // Include labels field
          // Only include body/htmlBody if explicitly needed - they're large and encrypted
          // For thread view, we can fetch them separately for expanded emails
          "email.body",
          "email.htmlBody",
        ])
        .where("email.userId = :userId", { userId })
      .andWhere("email.threadId = :threadId", { threadId });

    // Apply ordering (default to ASC for thread view, DESC for priority calculation)
    const order = options?.order || "ASC";
    queryBuilder.orderBy("email.receivedAt", order);

    // Apply limit if specified
    if (options?.limit) {
      queryBuilder.take(options.limit);
    }

    // TypeORM will automatically decrypt labels field due to the transformer
    return queryBuilder.getMany();
  }

  /**
   * Get recent thread IDs that are not archived (for checking archived status in Gmail)
   */
  async getRecentNonArchivedThreadIds(
    userId: string,
    days: number = DAYS.WEEK,
  ): Promise<string[]> {
    const cutoffDate = new Date(Date.now() - days * MILLISECONDS.DAY);
    const results = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select("thread.threadId", "threadId")
      .where("thread.userId = :userId", { userId })
      .andWhere("thread.isArchived = false")
      .innerJoin("emails", "email", "email.emailThreadId = thread.id")
      .andWhere("email.receivedAt >= :cutoffDate", { cutoffDate })
      // Limit to avoid rate limits
      .limit(QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE)
      .getRawMany();

    // Filter out any null/undefined
    return results
      .map((r: { threadId: string }) => r.threadId)
      .filter((id: string) => id);
  }

  /**
   * Get ALL non-archived thread IDs (for checking starred/archived status in Gmail)
   * This is used to ensure all starred emails are properly synced
   */
  async getAllNonArchivedThreadIds(userId: string): Promise<string[]> {
    const results = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select("thread.threadId", "threadId")
      .where("thread.userId = :userId", { userId })
      .andWhere("thread.isArchived = false")
      // Limit to avoid rate limits, but higher than recent threads
      .limit(QUERY_LIMITS.MAX_THREADS_FOR_ANALYSIS)
      .getRawMany();

    // Filter out any null/undefined
    return results
      .map((r: { threadId: string }) => r.threadId)
      .filter((id: string) => id);
  }

  /**
   * Get non-archived threads that need status verification
   * Prioritizes threads that haven't been checked recently (oldest lastCheckedAt first)
   * Limits to a reasonable number per user per run to spread work across sync cycles
   */
  async getNonArchivedThreadsNeedingCheck(
    userId: string,
    limit: number = 50,
  ): Promise<string[]> {
    const results = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select("thread.threadId", "threadId")
      .where("thread.userId = :userId", { userId })
      .andWhere("thread.isArchived = false")
      .orderBy("thread.lastCheckedAt", "ASC", "NULLS FIRST")
      // Prioritize threads that haven't been checked or were checked longest ago
      .limit(limit)
      .getRawMany();

    // Filter out any null/undefined
    return results
      .map((r: { threadId: string }) => r.threadId)
      .filter((id: string) => id);
  }

  /**
   * Get ALL threads for sync comparison (returns threadId, isArchived, starCount)
   * Used by Gmail sync to compare with Gmail search results
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
   */
  async updateThreadArchivedStatus(
    userId: string,
    threadId: string,
    isArchived: boolean,
  ): Promise<void> {
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    if (thread) {
      // Only update if status changed to avoid unnecessary DB writes
      if (thread.isArchived !== isArchived) {
        thread.isArchived = isArchived;
        await this.emailThreadRepository.save(thread);
        this.logger.debug(
          `Updated thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... archived status to ${isArchived}`,
        );
      }
    } else {
      // Thread doesn't exist yet, create it
      await this.getOrCreateEmailThread(
        userId,
        threadId,
        STAR_COUNTS.NONE,
        isArchived,
      );
    }
  }

  /**
   * Update lastCheckedAt for multiple threads (used to track verification without status changes)
   */
  async updateThreadsLastCheckedAt(
    userId: string,
    threadIds: string[],
  ): Promise<void> {
    if (threadIds.length === 0) return;

    const now = new Date();
    await this.emailThreadRepository
      .createQueryBuilder()
      .update()
      .set({ lastCheckedAt: now })
      .where("userId = :userId", { userId })
      .andWhere("threadId IN (:...threadIds)", { threadIds })
      .execute();
  }

  /**
   * Batch update thread archived statuses (more efficient than individual updates)
   */
  async batchUpdateThreadArchivedStatuses(
    userId: string,
    updates: Array<{ threadId: string; isArchived: boolean }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    // Group by status for more efficient updates
    const archivedThreadIds = updates
      .filter((update) => update.isArchived)
      .map((update) => update.threadId);
    const unarchivedThreadIds = updates
      .filter((update) => !update.isArchived)
      .map((update) => update.threadId);

    const now = new Date();
    // Batch update archived threads
    if (archivedThreadIds.length > 0) {
      await this.emailThreadRepository.update(
        { userId, threadId: In(archivedThreadIds) },
        { isArchived: true, lastCheckedAt: now },
      );
    }

    // Batch update unarchived threads
    if (unarchivedThreadIds.length > 0) {
      await this.emailThreadRepository.update(
        { userId, threadId: In(unarchivedThreadIds) },
        { isArchived: false, lastCheckedAt: now },
      );
    }

    this.logger.debug(
      `Batch updated ${updates.length} thread archived statuses`,
    );
  }

  /**
   * Update star count for a thread (updates EmailThread)
   */
  async updateThreadStarCount(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void> {
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    if (thread) {
      thread.starCount = starCount;
      await this.emailThreadRepository.save(thread);
      this.logger.debug(
        `Updated thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... star count to ${starCount}`,
      );
    } else {
      // Thread doesn't exist yet, create it
      await this.getOrCreateEmailThread(userId, threadId, starCount, false);
    }
  }

  /**
   * Batch update thread statuses (archived + starred) in a single transaction
   * This is MUCH faster than individual updates for syncing many threads
   */
  // eslint-disable-next-line max-lines
  async batchUpdateThreadStatus(
    userId: string,
    updates: { threadId: string; isArchived: boolean; starCount: number }[],
    deletedThreadIds: string[],
  ): Promise<void> {
    if (updates.length === 0 && deletedThreadIds.length === 0) return;

    // Use a transaction for atomic updates
    await this.emailThreadRepository.manager.transaction(async (manager) => {
      const threadRepo = manager.getRepository(
        this.emailThreadRepository.target,
      );

      // Batch update existing threads
      if (updates.length > 0) {
        // Group by archived status and star count to minimize queries
        const archivedUpdates = updates.filter(
          (updateItem) => updateItem.isArchived,
        );
        const starredUpdates = updates.filter(
          (updateItem) => updateItem.starCount > 0,
        );
        const unstarredUpdates = updates.filter(
          (updateItem) => updateItem.starCount === 0 && !updateItem.isArchived,
        );

        // Update archived threads
        if (archivedUpdates.length > 0) {
          const archivedIds = archivedUpdates.map(
            (updateItem) => updateItem.threadId,
          );
          await threadRepo
            .createQueryBuilder()
            .update()
            .set({ isArchived: true })
            .where("userId = :userId", { userId })
            .andWhere("threadId IN (:...threadIds)", { threadIds: archivedIds })
            .execute();
        }

        // Update starred threads (starCount = 3)
        if (starredUpdates.length > 0) {
          const starredIds = starredUpdates.map(
            (updateItem) => updateItem.threadId,
          );
          await threadRepo
            .createQueryBuilder()
            .update()
            .set({ starCount: 3 })
            .where("userId = :userId", { userId })
            .andWhere("threadId IN (:...threadIds)", { threadIds: starredIds })
            .execute();
        }

        // Update unstarred threads (starCount = 0)
        if (unstarredUpdates.length > 0) {
          const unstarredIds = unstarredUpdates.map(
            (updateItem) => updateItem.threadId,
          );
          await threadRepo
            .createQueryBuilder()
            .update()
            .set({ starCount: 0 })
            .where("userId = :userId", { userId })
            .andWhere("threadId IN (:...threadIds)", {
              threadIds: unstarredIds,
            })
            .execute();
        }
      }

      // Mark deleted threads as archived
      if (deletedThreadIds.length > 0) {
        await threadRepo
          .createQueryBuilder()
          .update()
          .set({ isArchived: true })
          .where("userId = :userId", { userId })
          .andWhere("threadId IN (:...threadIds)", {
            threadIds: deletedThreadIds,
          })
          .execute();
      }
    });
  }

  /**
   * Get or create EmailThread for a given userId and threadId
   * Handles race conditions by catching duplicate key errors
   */
  async getOrCreateEmailThread(
    userId: string,
    threadId: string,
    starCount: number = STAR_COUNTS.NONE,
    isArchived: boolean = false,
  ): Promise<EmailThread> {
    // Try to find existing thread first
    let thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    if (!thread) {
      // Thread doesn't exist, try to create it
      // Use a transaction to handle race conditions
      try {
        thread = this.emailThreadRepository.create({
          userId,
          threadId,
          starCount,
          isArchived,
        });
        thread = await this.emailThreadRepository.save(thread);
        this.logger.debug(
          `Created EmailThread for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... (starCount=${starCount}, isArchived=${isArchived})`,
        );
      } catch (error: unknown) {
        // Handle race condition: if another process created the thread between our check and save
        const isDbError = isDatabaseError(error) && error.code === "23505";
        const errorMessage = isError(error) ? error.message : undefined;
        if (
          isDbError ||
          errorMessage?.includes("duplicate key") ||
          errorMessage?.includes("unique constraint")
        ) {
          // Thread was created by another process, fetch it
          this.logger.debug(
            `Race condition detected for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}..., fetching existing thread`,
          );
          thread = await this.emailThreadRepository.findOne({
            where: { userId, threadId },
          });
          if (!thread) {
            // Still not found, this is unexpected
            throw new Error(
              `Failed to create or find thread ${threadId} after race condition`,
            );
          }
        } else {
          // Some other error, rethrow
          throw error;
        }
      }
    }

    // Update if values changed
    if (thread) {
      const needsUpdate =
        thread.starCount !== starCount || thread.isArchived !== isArchived;
      if (needsUpdate) {
        thread.starCount = starCount;
        thread.isArchived = isArchived;
        thread = await this.emailThreadRepository.save(thread);
        this.logger.debug(
          `Updated EmailThread for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... (starCount=${starCount}, isArchived=${isArchived})`,
        );
      }
    }

    return thread;
  }

  async getEmailByMessageId(userId: string, messageId: string): Promise<Email> {
    return this.emailRepository.findOne({
      where: { messageId, userId },
    });
  }

  // eslint-disable-next-line max-lines-per-function, max-statements
  async createEmail(userId: string, emailData: Partial<Email>): Promise<Email> {
    this.logger.debug(
      `Creating email for user ${userId}: ${emailData.subject}`,
    );

    // Check if sender is blocked
    const senderEmail = emailData.from || "";
    const isBlocked = await this.blockedSendersService.isSenderBlocked(
      userId,
      senderEmail,
    );

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

    // If sender is blocked, skip priority calculation and LLM processing
    if (isBlocked) {
      this.logger.log(
        `📛 Email from blocked sender ${senderEmail} - auto-archiving and skipping LLM processing`,
      );
      // Priority score will be calculated from breakdown (0 for blocked senders)
      // Update thread flag (priority is thread-level)
      thread.isProcessingPriority = false;
      await this.emailThreadRepository.save(thread);
      email.isProcessingSummary = false;
      email.summary = "[Blocked sender]";

      // Add blocked-by-bearlymail label
      const existingLabels = email.labels || [];
      email.labels = [...existingLabels, "blocked-by-bearlymail"];

      const savedEmail = await this.emailRepository.save(email);
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
    const isUrgent = (thread.urgencyScore || 0) >= 90;

    // Apply batching if not urgent and not starred (starCount = 0)
    if (!isUrgent && starCount === 0) {
      // Use default batch hours (6 hours)
      const batchHours = HOURS.SIX;
      email.isBatched = true;
      email.batchReleaseAt = new Date(
        Date.now() + batchHours * MILLISECONDS.HOUR,
      );
    }

    const savedEmail = await this.emailRepository.save(email);
    this.logger.debug(`[EmailsService] Saved email ${savedEmail.id} to database`);
    
    // Debug: Verify labels were saved correctly
    if (savedEmail.labels) {
      this.logger.debug(
        `[EmailsService] Email ${savedEmail.id} saved with labels (after TypeORM): ${JSON.stringify(savedEmail.labels)}`,
      );
    } else {
      this.logger.debug(`[EmailsService] Email ${savedEmail.id} saved with no labels`);
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

    // Detect GitHub links and fetch status asynchronously (fire and forget)
    this.detectAndFetchGitHubLinks(userId, savedEmail).catch((err) => {
      this.logger.error(
        `Failed to detect/fetch GitHub links for email ${savedEmail.id}:`,
        err,
      );
    });

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

  async markAsRead(userId: string, emailId: string): Promise<Email> {
    await this.emailRepository.update(
      { id: emailId, userId },
      { isRead: true },
    );
    return this.getEmailById(userId, emailId);
  }

  async markAsUnread(userId: string, emailId: string): Promise<Email> {
    await this.emailRepository.update(
      { id: emailId, userId },
      { isRead: false },
    );
    return this.getEmailById(userId, emailId);
  }

  async bulkMarkAsRead(userId: string, emailIds: string[]): Promise<void> {
    if (emailIds.length === 0) return;
    await this.emailRepository.update(
      { id: In(emailIds), userId },
      { isRead: true },
    );
  }

  async bulkMarkAsUnread(userId: string, emailIds: string[]): Promise<void> {
    if (emailIds.length === 0) return;
    await this.emailRepository.update(
      { id: In(emailIds), userId },
      { isRead: false },
    );
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
    this.logger.log(`[Archive] archiveEmail called: userId=${userId}, emailId=${emailId}`);
    const email = await this.getEmailById(userId, emailId);
    if (!email) {
      this.logger.warn(`[Archive] Email not found: userId=${userId}, emailId=${emailId}`);
      throw new Error("Email not found");
    }
    
    if (!email.threadId) {
      this.logger.warn(`[Archive] Email has no threadId: userId=${userId}, emailId=${emailId}`);
      throw new Error("Email has no threadId");
    }

    this.logger.log(`[Archive] Email found: emailId=${emailId}, threadId=${email.threadId}`);
    
      // Check if the thread is starred
      const thread = await this.emailThreadRepository.findOne({
        where: { userId, threadId: email.threadId },
      });

      const isStarred = thread && thread.starCount > 0;
      const { threadId } = email;
    
    this.logger.log(`[Archive] Thread info: threadId=${threadId}, isStarred=${isStarred}, currentIsArchived=${thread?.isArchived || false}`);

      // Archive the thread in Gmail (this will also remove the star if present)
      // Only update database if Gmail API call succeeds
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider && "archiveThread" in provider) {
      this.logger.log(`[Archive] Calling provider.archiveThread: userId=${userId}, threadId=${threadId}`);
        await provider.archiveThread(userId, threadId);
      this.logger.log(`[Archive] provider.archiveThread completed successfully: userId=${userId}, threadId=${threadId}`);
      } else {
      this.logger.error(`[Archive] No email provider available: userId=${userId}`);
        throw new Error("No email provider available to archive thread");
      }

      // Update database: remove star and mark as archived
      // Only reached if Gmail API call succeeded
      if (isStarred) {
      this.logger.log(`[Archive] Removing star from thread: userId=${userId}, threadId=${threadId}`);
        await this.updateThreadStarCount(userId, threadId, 0);
      }
    this.logger.log(`[Archive] Updating thread archived status to true: userId=${userId}, threadId=${threadId}`);
      await this.updateThreadArchivedStatus(userId, threadId, true);
    this.logger.log(`[Archive] archiveEmail completed successfully: userId=${userId}, emailId=${emailId}, threadId=${threadId}`);
  }

  async deleteEmail(userId: string, emailId: string): Promise<void> {
    const email = await this.getEmailById(userId, emailId);
    if (email && email.threadId) {
      const { threadId } = email;

      // Delete/trash the thread in Gmail
      // Only update database if Gmail API call succeeds
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

  async updateEmail(
    emailId: string,
    updates: Partial<Email>,
  ): Promise<Email | null> {
    await this.emailRepository.update({ id: emailId }, updates);
    return this.emailRepository.findOne({ where: { id: emailId } });
  }

  async setStarCount(
    userId: string,
    emailId: string,
    starCount: number,
  ): Promise<Email> {
    const email = await this.getEmailById(userId, emailId);
    if (email && email.threadId) {
      const thread = await this.emailThreadRepository.findOne({
        where: { userId, threadId: email.threadId },
      });
      const oldStarCount = thread?.starCount ?? 0;

      // Ensure starCount is between 0-3
      const newStarCount = Math.max(0, Math.min(3, starCount));
      await this.updateThreadStarCount(userId, email.threadId, newStarCount);

      // Sync star status to Gmail
      try {
        const provider =
          await this.emailProviderManager.getPrimaryProvider(userId);
        if (provider && "syncStarStatusToGmail" in provider) {
          await provider.syncStarStatusToGmail(
            userId,
            email.threadId,
            newStarCount,
          );
        }
      } catch (error) {
        // Log error but don't fail - star status can be fixed by sync job
        this.logger.error(
          `Failed to sync star status to Gmail for user ${userId}, thread ${email.threadId}:`,
          error,
        );
      }

      // Trigger learning if star count changed
      if (oldStarCount !== newStarCount) {
        // Queue learning job asynchronously (don't block the response)
        this.boss
          .send(
            "learn-from-star",
            { userId, emailId, starCount: newStarCount },
            {
              priority: getJobPriority("learn-from-star", false),
            },
          )
          .catch((err) =>
            this.logger.error("Failed to queue learning job", err),
          );
      }
    }
    return email;
  }

  // Backwards compatibility - toggle between 0 and 3 stars
  async toggleStar(userId: string, emailId: string): Promise<Email> {
    const email = await this.getEmailById(userId, emailId);
    if (email && email.threadId) {
      const thread = await this.emailThreadRepository.findOne({
        where: { userId, threadId: email.threadId },
      });
      const currentStarCount = thread?.starCount ?? 0;
      const newStarCount = currentStarCount > 0 ? 0 : 3;
      await this.updateThreadStarCount(userId, email.threadId, newStarCount);

      // Sync star status to Gmail
      try {
        const provider =
          await this.emailProviderManager.getPrimaryProvider(userId);
        if (provider && "syncStarStatusToGmail" in provider) {
          await provider.syncStarStatusToGmail(
            userId,
            email.threadId,
            newStarCount,
          );
        }
      } catch (error) {
        // Log error but don't fail - star status can be fixed by sync job
        this.logger.error(
          `Failed to sync star status to Gmail for user ${userId}, thread ${email.threadId}:`,
          error,
        );
      }
    }
    return email;
  }

  async forceCheckNewEmails(userId: string): Promise<Email[]> {
    // Unbatch ALL pending batched emails for the user, effectively "delivering" them now
    await this.emailRepository.update(
      {
        userId,
        isBatched: true,
      },
      { isBatched: false },
    );

    // Return Triage inbox by default after force check
    return this.getInbox(userId, true, "triage");
  }

  async getNextBatchReleaseTime(userId: string): Promise<Date | null> {
    const nextBatch = await this.emailRepository.findOne({
      where: { userId, isBatched: true },
      order: { batchReleaseAt: "ASC" },
      select: ["batchReleaseAt"],
    });
    return nextBatch?.batchReleaseAt || null;
  }

  async checkForUrgentEmails(userId: string): Promise<{
    hasUrgent: boolean;
    urgentCount: number;
    urgentEmails: Array<{
      subject: string;
      from: string;
      priorityScore: number;
    }>;
  }> {
    // Get all batched emails that are marked as urgent AND have very high priority score
    // Require BOTH conditions to be more strict about what counts as urgent
    // Priority threshold raised to 90+ (was 80+) to reduce false positives
    // Join with email_threads to check isArchived and get priority (now thread-level)
    const urgentBatchedEmails = await this.emailRepository
      .createQueryBuilder("email")
      .innerJoin("email_threads", "thread", "thread.id = email.emailThreadId")
      .where("email.userId = :userId", { userId })
      .andWhere("thread.userId = :userId", { userId })
      .andWhere("email.isBatched = true")
      .andWhere("thread.isArchived = false")
      // Must have high urgency score (90+)
      .andWhere("thread.urgencyScore >= 90")
      // AND must have very high priority (90+) - calculated from thread priorityExplanation
      .andWhere(
        `COALESCE(
          (SELECT (jsonb_extract_path_text(thread."priorityExplanation"::jsonb, 'score')::int))
          , 0
        ) >= 90`,
      )
      .orderBy("email.receivedAt", "DESC")
      .take(10)
      .getMany();

    // Get threads for priority scores
    const emailThreadIds = urgentBatchedEmails
      .map((e) => e.emailThreadId)
      .filter((id): id is string => id !== null);
    const threads = await this.emailThreadRepository.find({
      where: { id: In(emailThreadIds) },
    });
    const threadMap = new Map(threads.map((t) => [t.id, t]));

    return {
      hasUrgent: urgentBatchedEmails.length > 0,
      urgentCount: urgentBatchedEmails.length,
      urgentEmails: urgentBatchedEmails.map((email) => {
        const thread = email.emailThreadId
          ? threadMap.get(email.emailThreadId)
          : null;
        return {
          // Will be automatically decrypted by transformer
          subject: email.subject,
          // Will be automatically decrypted by transformer
          from: email.fromName || email.from,
          priorityScore: this.calculateScoreFromBreakdown(
            thread?.priorityExplanation || null,
          ),
        };
      }),
    };
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
            (item) => item.description === "Calculating..." || item.description?.includes("Calculating...")
          ) ?? false;

        // If stuck in "Calculating..." for more than 10 minutes, reset flag and requeue
        if (hasCalculatingItems && thread.isProcessingPriority) {
          const processingTime = Date.now() - new Date(thread.updatedAt).getTime();
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

        if ((hasOldStructure || hasCalculatingItems) && !thread.isProcessingPriority) {
          // Queue recalculation job for old structure or incomplete calculation
          const reason = hasOldStructure ? "old priority structure" : "calculating items";
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
            breakdown?: Array<{ factor: string; value: number; description: string }>;
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
              urgency: explanation.dimensions?.urgency || { score: 0, reasons: [] },
              goalAlignment: explanation.dimensions?.goalAlignment || { score: 0, reasons: [] },
              vipContact: explanation.dimensions?.vipContact || { score: 0, reasons: [] },
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
      if (email.emailThreadId) {
        const endSave = perf.startSpan("save-explanation", 500);
        this.emailThreadRepository
          .update({ id: email.emailThreadId }, { priorityExplanation: explanation })
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
   * Detect if a query is time-sensitive (questions about meetings, events, etc.)
   * Time-sensitive queries should penalize older emails more heavily
   */
  private isTimeSensitiveQuery(query: string): boolean {
    const lowerQuery = query.toLowerCase();

    // Patterns that indicate time-sensitive queries
    const timeSensitivePatterns = [
      // Questions about attendance/participation
      /\b(is|are|will|coming|going|attending|joining|participating)\b/i,
      // Meeting-related
      /\b(meeting|appointment|call|conference|event|gathering|session)\b/i,
      // Time-related questions
      /\b(when|what time|what day|which day|tomorrow|today|this week|next week)\b/i,
      // Status questions
      /\b(status|confirmed|cancel|reschedule|postpone)\b/i,
      // Questions about future plans
      /\b(plan|schedule|arrange|organize|set up)\b/i,
    ];

    // Check if query contains question words AND time-sensitive patterns
    const hasQuestionWord = /\b(is|are|will|when|what|where|who|how)\b/i.test(
      lowerQuery,
    );
    const hasTimeSensitivePattern = timeSensitivePatterns.some((pattern) =>
      pattern.test(lowerQuery),
    );

    // Also check for direct questions (starts with question word or contains "?")
    const isDirectQuestion =
      /\b(is|are|will|when|what|where|who|how)\b/i.test(
        lowerQuery.trim().split(/\s+/)[0],
      ) || lowerQuery.includes("?");

    return (
      (hasQuestionWord && hasTimeSensitivePattern) ||
      (isDirectQuestion && hasTimeSensitivePattern)
    );
  }

  /**
   * Convert natural language query to Gmail search syntax using AI
   */
  private async convertQueryToGmailSearch(
    userId: string,
    query: string,
  ): Promise<string> {
    // Check if query already looks like Gmail syntax (contains operators like from:, to:, subject:, etc.)
    const gmailOperators = [
      "from:",
      "to:",
      "subject:",
      "has:",
      "before:",
      "after:",
      "is:",
      "in:",
      "label:",
      "-",
    ];
    const hasGmailSyntax = gmailOperators.some((op) =>
      query.toLowerCase().includes(op),
    );

    if (hasGmailSyntax) {
      // User already provided Gmail syntax, use as-is
      return query;
    }

    // Use AI to convert natural language to Gmail search syntax
    const conversionPrompt = `Convert this natural language email search query into Gmail search syntax.

User's query: "${query}"

Gmail search syntax examples:
- "emails from John" → "from:john"
- "Is Jay coming to the meeting?" → "from:jay OR jay"
- "meeting confirmations" → "subject:meeting OR subject:confirm"
- "emails about project X" → "project X"
- "attachments from last week" → "has:attachment after:2024/1/1"

CRITICAL RULES:
1. If the query mentions a person's name (like "Jay", "John", "Sarah"), prioritize searching FROM that person: "from:jay" or "from:john"
2. Names should be searched in the from: field FIRST, then as a general term
3. For questions about people (e.g., "Is Jay coming?"), search for the person's name in from: field
4. Don't add unrelated terms - if query is about "Jay", don't add "meeting" unless the query explicitly asks about meetings with Jay
5. Keep it focused - only include terms directly mentioned in the query
6. Return ONLY the Gmail search query, nothing else

Gmail search query:`;

    try {
      const gmailQuery = await this.llmService.generateText(
        {
          prompt: conversionPrompt,
          systemPrompt:
            "You are a helpful assistant that converts natural language to Gmail search syntax. Return only the search query.",
          temperature: 0.2,
          maxTokens: 100,
          userId,
        },
        undefined,
        userId,
      );

      // Clean up the response (remove quotes, extra text, etc.)
      const cleaned = gmailQuery
        .trim()
        // Remove surrounding quotes
        .replace(/^["']|["']$/g, "")
        // Remove prefix
        .replace(/^Gmail search query:?\s*/i, "")
        .trim();

      this.logger.debug(
        `Converted query "${query}" to Gmail syntax: "${cleaned}"`,
      );
      // Fallback to original if conversion fails
      return cleaned || query;
    } catch (error) {
      this.logger.warn(
        "Failed to convert query to Gmail syntax, using original",
        error,
      );
      // Fallback: extract key terms from the query
      const words = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2);
      return words.join(" OR ");
    }
  }

  // eslint-disable-next-line max-lines-per-function, complexity, max-statements
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
    const originalQuery = query;
    const queriesTried: Array<{ query: string; resultCount: number }> = [];
    const searchStartTime = Date.now();

    // Log search start
    searchLogger.logSearchStart(userId, originalQuery);

    try {
      // Use the injected EmailProviderManager
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (!provider) {
        this.logger.warn(`No email provider connected for user ${userId}`);
        searchLogger.logSearchError(
          userId,
          originalQuery,
          "No email provider connected",
        );
        return [
          {
            id: "no-results",
            subject: "",
            from: "",
            body: "",
            receivedAt: new Date().toISOString(),
            debugInfo: {
              originalQuery,
              queriesTried: [],
              message: "No email provider connected",
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ];
      }

      // Step 1: Generate query variations and try them in order
      onProgress?.("converting", "Crafting search query for Gmail...");

      // Generate natural language variations first
      const naturalVariations = [query]; // Simple implementation: use query as-is
      this.logger.log(
        `[SEARCH] Generated ${naturalVariations.length} variations: ${naturalVariations.join(", ")}`,
      );
      searchLogger.logQueryVariations(userId, originalQuery, naturalVariations);

      // Convert each variation to Gmail syntax
      const gmailQueries: string[] = [];
      for (const naturalVar of naturalVariations) {
        try {
          const gmailQuery = await this.convertQueryToGmailSearch(
            userId,
            naturalVar,
          );
          if (gmailQuery && !gmailQueries.includes(gmailQuery)) {
            gmailQueries.push(gmailQuery);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to convert variation "${naturalVar}"`,
            error,
          );
        }
      }

      // If no variations were generated, use the original conversion
      if (gmailQueries.length === 0) {
        const gmailQuery = await this.convertQueryToGmailSearch(userId, query);
        gmailQueries.push(gmailQuery);
      }

      this.logger.log(
        `[SEARCH] Will try ${gmailQueries.length} Gmail queries: ${gmailQueries.join(", ")}`,
      );
      searchLogger.logGmailQueries(userId, originalQuery, gmailQueries);

      // Step 2: Try each query variation until we get results
      onProgress?.("searching", "Searching for emails in Gmail...");
      const initialMaxResults = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE;
      let rawEmails: Array<{
        receivedAt: Date;
        from?: string;
        fromName?: string;
        subject?: string;
        [key: string]: unknown;
      }> = [];
      let successfulQuery: string | null = null;

      for (let i = 0; i < gmailQueries.length; i++) {
        const gmailQuery = gmailQueries[i];
        this.logger.log(
          `[SEARCH] Trying query ${i + 1}/${gmailQueries.length}: "${gmailQuery}"`,
        );
        searchLogger.logGmailQueryAttempt(
          userId,
          originalQuery,
          gmailQuery,
          i + 1,
          gmailQueries.length,
        );

        try {
          const queryStartTime = Date.now();
          const results = await provider.searchEmails(
            userId,
            gmailQuery,
            initialMaxResults,
          );
          const queryDuration = Date.now() - queryStartTime;
          searchLogger.logPerformance(
            userId,
            originalQuery,
            `Gmail query "${gmailQuery}"`,
            queryDuration,
          );

          queriesTried.push({ query: gmailQuery, resultCount: results.length });
          this.logger.log(
            `[SEARCH] Query "${gmailQuery}" returned ${results.length} results`,
          );
          searchLogger.logGmailQueryResult(
            userId,
            originalQuery,
            gmailQuery,
            results.length,
          );

          if (results.length > 0) {
            rawEmails = results as unknown as Array<{
              receivedAt: Date;
              from?: string;
              fromName?: string;
              subject?: string;
              [key: string]: unknown;
            }>;
            successfulQuery = gmailQuery;
            // Stop trying once we get results
            break;
          }
        } catch (error) {
          this.logger.warn(`Query "${gmailQuery}" failed:`, error);
          searchLogger.logGmailQueryError(
            userId,
            originalQuery,
            gmailQuery,
            error,
          );
          queriesTried.push({ query: gmailQuery, resultCount: 0 });
        }
      }

      if (rawEmails.length === 0) {
        onProgress?.("complete", "No emails found");
        // Log for debugging - ALWAYS log queriesTried
        this.logger.log(
          `[SEARCH] No results found for query "${originalQuery}". Queries tried: ${queriesTried.length}`,
        );
        searchLogger.logNoResults(userId, originalQuery, queriesTried);
        const totalTime = Date.now() - searchStartTime;
        searchLogger.logSearchComplete(userId, originalQuery, 0, totalTime);

        // Return a special marker object with queriesTried info for the UI
        return [
          {
            id: "no-results",
            subject: "",
            from: "",
            body: "",
            receivedAt: new Date().toISOString(),
            debugInfo: {
              originalQuery,
              // Always include, even if empty
              queriesTried,
              message:
                queriesTried.length === 0
                  ? "No queries were attempted - check server logs for errors"
                  : "No emails found with any of the attempted queries",
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ];
      }

      // Deduplicate by threadId immediately - keep only the most recent email per thread
      // This ensures we only score and process one email per thread
      const threadDedupMap = new Map<string, (typeof rawEmails)[0]>();
      rawEmails.forEach((email) => {
        const { threadId } = email as { threadId?: string };
        if (!threadId) {
          // If no threadId, keep the email (shouldn't happen, but handle it)
          const { messageId } = email as { messageId?: string };
          threadDedupMap.set(
            (messageId as string) || `no-thread-${Math.random()}`,
            email,
          );
          return;
        }
        const existing = threadDedupMap.get(threadId);
        if (!existing) {
          threadDedupMap.set(threadId, email);
        } else {
          // Keep the more recent email
          const existingDate = new Date(existing.receivedAt);
          const currentDate = new Date(email.receivedAt);
          if (currentDate > existingDate) {
            threadDedupMap.set(threadId, email);
          }
        }
      });
      const beforeDedupCount = rawEmails.length;
      rawEmails = Array.from(threadDedupMap.values());
      this.logger.debug(
        `After initial thread deduplication: ${rawEmails.length} unique threads from ${threadDedupMap.size} emails`,
      );
      searchLogger.logThreadDeduplication(
        userId,
        originalQuery,
        beforeDedupCount,
        rawEmails.length,
      );

      // Step 3: Filter and rank with AI
      onProgress?.(
        "filtering",
        `Filtering ${rawEmails.length} emails with AI...`,
      );

      // Score ALL raw emails first (for debug info)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const now = new Date();
      // Find the most recent email to calculate daysSinceLastEmail
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const mostRecentDate = Math.max(
        ...rawEmails.map((email) => new Date(email.receivedAt).getTime()),
      );
      const daysSinceLastEmail = Math.floor(
        (now.getTime() - mostRecentDate) / (1000 * 60 * 60 * 24),
      );

      const emailSummaries = rawEmails.map((email, index) => {
        const receivedDate = new Date(email.receivedAt);
        const daysAgo = Math.floor(
          (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        return {
          index,
          from: email.fromName || email.from,
          subject: email.subject,
          snippet: ((email as { body?: string }).body?.substring(
            0,
            QUERY_LIMITS.SUBSTRING_SNIPPET_LENGTH,
          ) || "") as string,
          receivedAt: email.receivedAt,
          daysAgo,
          isRecent: daysAgo <= DAYS.WEEK,
        };
      });

      // Use AI to filter and rank results if we have multiple results
      let filteredEmails = rawEmails;
      // Track scores for all emails (for debug)
      const allScores: Map<number, number> = new Map();

      // Always score emails, even if we don't need to filter
      if (rawEmails.length > 0) {
        try {
          searchLogger.logAIScoringStart(
            userId,
            originalQuery,
            rawEmails.length,
          );
          const aiScoringStartTime = Date.now();

          // Detect if query is time-sensitive
          const isTimeSensitive = this.isTimeSensitiveQuery(originalQuery);

          // Adjust recency penalties based on time-sensitivity
          // For time-sensitive queries (e.g., "Is Jay coming to the meeting?"),
          // older emails are much less relevant
          const recencyToday = PRIORITY_BOOSTS.RECENCY_TODAY;
          const recency24H = PRIORITY_BOOSTS.RECENCY_24H;
          const recency7D = PRIORITY_BOOSTS.RECENCY_7D;
          const recency30D = PRIORITY_BOOSTS.RECENCY_30D;
          // Stronger penalties for old emails in time-sensitive queries
          const recency30DPenalty = isTimeSensitive
            ? PRIORITY_BOOSTS.RECENCY_30D_PENALTY * 1.5 // 50% stronger penalty
            : PRIORITY_BOOSTS.RECENCY_30D_PENALTY;
          const recency60DPenalty = isTimeSensitive
            ? PRIORITY_BOOSTS.RECENCY_60D_PENALTY * 1.5 // 50% stronger penalty
            : PRIORITY_BOOSTS.RECENCY_60D_PENALTY;

          const timeSensitivityNote = isTimeSensitive
            ? "\n\n⚠️ TIME-SENSITIVE QUERY DETECTED: This query appears to be about a meeting, event, or time-sensitive question. OLDER emails should be penalized MORE HEAVILY as they are likely about past events, not the current question. Emails older than 30 days should receive significantly lower scores unless they are extremely relevant."
            : "";

          // Use AI to rank ALL emails by relevance to the ORIGINAL query (prioritizing newer emails) with scores
          const rankingPrompt = `You are an email search assistant. Rank these ${emailSummaries.length} emails by relevance to the search query: "${originalQuery}"

IMPORTANT CONTEXT:
- The most recent email in this set was received ${daysSinceLastEmail} days ago (daysSinceLastEmail: ${daysSinceLastEmail})
- Prioritize RECENT emails heavily - if two emails are equally relevant, the more recent one should rank much higher${timeSensitivityNote}

CRITICAL RELEVANCE RULES:
1. If the query asks about a specific person (e.g., "Is Jay coming?"), emails MUST be from that person or mention them prominently to be relevant
2. Emails that don't mention the person at all should get a score of 0-20 (not relevant)
3. Emails from automated services (like "Fireflies.ai", "noreply", etc.) that don't mention the person should get very low scores (0-15)
4. Only emails that directly relate to the query should score above ${PRIORITY_SCORES.MEDIUM_THRESHOLD}

CRITICAL RECENCY RULES (apply these bonuses/penalties):
- Emails from TODAY (0 days ago) should get a +${recencyToday} bonus (STRONG priority for today's emails)
- Emails from the last 24 hours (0-1 days ago) should get a +${recency24H} bonus
- Emails from the last ${DAYS.WEEK} days should get a +${recency7D} bonus
- Emails from ${DAYS.WEEK + 1}-${DAYS.MONTH} days ago should get a +${recency30D} bonus
- Emails older than ${DAYS.MONTH} days should get a ${recency30DPenalty} penalty (${isTimeSensitive ? "VERY STRONG" : "STRONG"} penalty for old emails${isTimeSensitive ? " - time-sensitive query" : ""})
- Emails older than 60 days should get a ${recency60DPenalty} penalty (${isTimeSensitive ? "EXTREMELY STRONG" : "VERY STRONG"} penalty${isTimeSensitive ? " - time-sensitive query" : ""})

RELEVANCE SCORING (base score before recency adjustment):
- 100 = Perfect match, directly answers the question (e.g., email from Jay about the meeting)
- 80-99 = Very relevant, strong connection to query
- 60-79 = Moderately relevant, some connection
- 40-59 = Somewhat relevant, weak connection
- 20-39 = Barely relevant, minimal connection
- 0-19 = Not relevant at all (e.g., automated emails that don't mention the person)

Then apply the recency bonus/penalty above. Final score = base score + recency adjustment (capped at 0-100).

STRICT FILTERING: Only include emails with final score >= ${PRIORITY_BOOSTS.RELEVANCE_THRESHOLD} in the top results. Emails scoring below ${PRIORITY_BOOSTS.RELEVANCE_THRESHOLD} should be excluded even if they're recent.

Return a JSON array of objects with index and relevanceScore for ALL ${emailSummaries.length} emails, sorted by relevanceScore (highest first).

Format: [{"index": 2, "relevanceScore": 95}, {"index": 5, "relevanceScore": 87}, ...]

Emails:
${emailSummaries
  .map((e, index) => {
    let recencyLabel = "";
    if (e.daysAgo === 0) {
      recencyLabel = " (TODAY!)";
    } else if (e.daysAgo <= 1) {
      recencyLabel = " (LAST 24 HOURS!)";
    } else if (e.isRecent) {
      recencyLabel = " (RECENT)";
    }
    return `${index}. From: ${e.from}, Subject: ${e.subject}, Received: ${e.daysAgo} days ago${recencyLabel}, Preview: ${e.snippet.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LONG)}...`;
  })
  .join("\n")}

Return ONLY a JSON array of objects.`;

          const rankingResponse = await this.llmService.generateText(
            {
              prompt: rankingPrompt,
              systemPrompt:
                "You are a helpful email search assistant. Return only valid JSON arrays.",
              temperature: QUERY_LIMITS.LLM_TEMPERATURE,
              maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS,
              userId,
            },
            undefined,
            userId,
          );

          // Parse ranking with scores
          try {
            const jsonMatch = rankingResponse.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const rankedResults = JSON.parse(jsonMatch[0]);
              if (Array.isArray(rankedResults) && rankedResults.length > 0) {
                // Create map of index to relevance score for ALL emails
                rankedResults.forEach((item: RankedResult) => {
                  if (
                    item.index !== undefined &&
                    item.relevanceScore !== undefined
                  ) {
                    allScores.set(item.index, item.relevanceScore);
                    // Log individual email score if we have the email data
                    const email = rawEmails[item.index];
                    if (email) {
                      const receivedDate = new Date(email.receivedAt);
                      const daysAgo = Math.floor(
                        (now.getTime() - receivedDate.getTime()) /
                          (1000 * 60 * 60 * 24),
                      );
                      // Calculate recency adjustment (simplified - actual calculation is in the prompt)
                      // Apply stronger penalties for time-sensitive queries
                      const isTimeSensitive =
                        this.isTimeSensitiveQuery(originalQuery);
                      let recencyAdj = 0;
                      if (daysAgo === 0)
                        recencyAdj = PRIORITY_BOOSTS.RECENCY_TODAY;
                      else if (daysAgo <= 1)
                        recencyAdj = PRIORITY_BOOSTS.RECENCY_24H;
                      else if (daysAgo <= DAYS.WEEK)
                        recencyAdj = PRIORITY_BOOSTS.RECENCY_7D;
                      else if (daysAgo <= DAYS.MONTH)
                        recencyAdj = PRIORITY_BOOSTS.RECENCY_30D;
                      else if (daysAgo > 60)
                        recencyAdj = isTimeSensitive
                          ? PRIORITY_BOOSTS.RECENCY_60D_PENALTY * 1.5
                          : PRIORITY_BOOSTS.RECENCY_60D_PENALTY;
                      else
                        recencyAdj = isTimeSensitive
                          ? PRIORITY_BOOSTS.RECENCY_30D_PENALTY * 1.5
                          : PRIORITY_BOOSTS.RECENCY_30D_PENALTY;

                      const baseScore = item.relevanceScore - recencyAdj;
                      const included =
                        item.relevanceScore >=
                        PRIORITY_BOOSTS.RELEVANCE_THRESHOLD;
                      searchLogger.logEmailScore(
                        userId,
                        originalQuery,
                        item.index,
                        email.fromName || email.from,
                        email.subject || "",
                        Math.max(0, Math.min(100, baseScore)),
                        recencyAdj,
                        item.relevanceScore,
                        included,
                        included
                          ? undefined
                          : `Score below threshold (${PRIORITY_BOOSTS.RELEVANCE_THRESHOLD})`,
                      );
                    }
                  }
                });

                // Sort by relevance score (descending) and filter out low-scoring emails
                const sorted = rankedResults
                  // Only include emails with score >= threshold
                  .filter(
                    (item: RankedResult) =>
                      (item.relevanceScore || 0) >=
                      PRIORITY_BOOSTS.RELEVANCE_THRESHOLD,
                  )
                  .sort(
                    (a: RankedResult, b: RankedResult) =>
                      (b.relevanceScore || 0) - (a.relevanceScore || 0),
                  )
                  .slice(0, maxResults);

                // Get emails in ranked order with scores
                const scoredEmails = sorted
                  .map((item: RankedResult) => {
                    const email = rawEmails[item.index];
                    if (email) {
                      (email as { relevanceScore?: number }).relevanceScore =
                        item.relevanceScore;
                    }
                    return email;
                  })
                  .filter(Boolean);

                // Deduplicate by threadId - keep only the highest-scoring email per thread
                const threadMap = new Map<
                  string,
                  (typeof rawEmails)[0] & { relevanceScore: number }
                >();
                scoredEmails.forEach((email) => {
                  const emailTyped = email as unknown as EmailWithMetadata;
                  const { threadId } = emailTyped;
                  if (!threadId) {
                    // If no threadId, use messageId as fallback (treat as unique)
                    const messageId =
                      (emailTyped.messageId as string) || undefined;
                    this.logger.warn(
                      `Email ${messageId?.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)} has no threadId, using messageId for deduplication`,
                    );
                    threadMap.set(
                      messageId || `no-thread-${Math.random()}`,
                      emailTyped as any,
                    );
                    return;
                  }
                  const existing = threadMap.get(threadId);
                  if (
                    !existing ||
                    (emailTyped.relevanceScore || 0) >
                      (existing.relevanceScore || 0)
                  ) {
                    threadMap.set(threadId, emailTyped as any);
                  }
                });

                // Convert back to array and limit to maxResults
                filteredEmails = Array.from(threadMap.values())
                  .sort(
                    (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0),
                  )
                  .slice(0, maxResults);

                this.logger.debug(
                  `After thread deduplication: ${filteredEmails.length} unique threads from ${scoredEmails.length} emails`,
                );

                this.logger.debug(
                  `AI ranking complete: ${filteredEmails.length} emails with scores. Top score: ${filteredEmails[0] ? ((filteredEmails[0] as unknown as EmailWithMetadata).relevanceScore ?? "N/A") : "N/A"}`,
                );
                const aiScoringDuration = Date.now() - aiScoringStartTime;
                searchLogger.logPerformance(
                  userId,
                  originalQuery,
                  "AI scoring",
                  aiScoringDuration,
                );
                const rejectedCount = rawEmails.length - filteredEmails.length;
                searchLogger.logAIScoringComplete(
                  userId,
                  originalQuery,
                  rawEmails.length,
                  filteredEmails.length,
                  rejectedCount,
                );
              }
            }
          } catch (parseError) {
            this.logger.warn(
              "Failed to parse AI ranking, using first results",
              parseError,
            );
            searchLogger.logAIScoringError(userId, originalQuery, parseError);
            // Deduplicate by thread even in fallback case
            const threadMap = new Map<string, (typeof rawEmails)[0]>();
            rawEmails.slice(0, maxResults * 2).forEach((email) => {
              const emailTyped = email as {
                threadId?: string;
                messageId?: string;
              };
              const { threadId } = emailTyped;
              if (!threadId) {
                // If no threadId, use messageId as fallback
                threadMap.set(
                  (emailTyped.messageId as string) ||
                    `no-thread-${Math.random()}`,
                  email,
                );
                return;
              }
              if (!threadMap.has(threadId)) {
                threadMap.set(threadId, email);
              }
            });
            filteredEmails = Array.from(threadMap.values()).slice(
              0,
              maxResults,
            );
            this.logger.debug(
              `Fallback deduplication: ${filteredEmails.length} unique threads from ${rawEmails.length} emails`,
            );
          }
        } catch (error) {
          // If AI filtering fails, just take first maxResults and deduplicate by thread
          this.logger.warn("AI filtering failed, using first results", error);
          const threadMap = new Map<string, (typeof rawEmails)[0]>();
          rawEmails.slice(0, maxResults * 2).forEach((email) => {
            const emailTyped = email as {
              threadId?: string;
              messageId?: string;
            };
            const { threadId } = emailTyped;
            if (!threadId) {
              // If no threadId, use messageId as fallback
              threadMap.set(
                (emailTyped.messageId as string) ||
                  `no-thread-${Math.random()}`,
                email,
              );
              return;
            }
            if (!threadMap.has(threadId)) {
              threadMap.set(threadId, email);
            }
          });
          filteredEmails = Array.from(threadMap.values()).slice(0, maxResults);
          this.logger.debug(
            `Error fallback deduplication: ${filteredEmails.length} unique threads from ${rawEmails.length} emails`,
          );
        }
      }

      // Step 4: Generate AI-powered explanations that explain WHY the email is relevant
      onProgress?.("explaining", `Generating explanations...`);

      // #region agent log
      try {
        // fs is already imported at the top
        const logPath =
          "/Users/s3255727/Documents/dev/email-client/.cursor/debug.log";
        const logEntry = `${JSON.stringify({
          location: "emails.service.ts:1770",
          message: "Starting AI explanation generation",
          logData: {
            filteredEmailsCount: filteredEmails.length,
            originalQuery,
          },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "run1",
          hypothesisId: "E",
        })}\n`;
        fs.appendFileSync(logPath, logEntry);
      } catch (e) {}
      // #endregion

      // Generate AI explanations in parallel for all filtered emails
      const emailsWithExplanations = await Promise.all(
        // eslint-disable-next-line max-lines-per-function
        filteredEmails.map(async (rawEmail) => {
          try {
            const from = rawEmail.fromName || rawEmail.from;
            const subject = rawEmail.subject || "";
            // Use first 500 chars for context
            const bodyPreview = ((rawEmail.body as string) || "").substring(
              0,
              QUERY_LIMITS.SUBSTRING_BODY_PREVIEW,
            );

            // Generate explanation using AI
            const explanationPrompt = `The user searched for: "${originalQuery}"

Email details:
- From: ${from}
- Subject: ${subject}
- Preview: ${bodyPreview}

Explain in ONE SHORT SENTENCE (max 100 characters) why this email is relevant to the search query. Be specific about what connection you see. Examples:
- "Jeremy asked Jay if he's coming to the meeting"
- "Email from Sarah confirming the project deadline"
- "Meeting invitation that matches the search query"

Explanation:`;

            const explanation = await this.llmService.generateText(
              {
                prompt: explanationPrompt,
                systemPrompt:
                  "You are a helpful email search assistant. Provide concise, specific explanations of why emails are relevant to search queries.",
                temperature: QUERY_LIMITS.LLM_TEMPERATURE,
                maxTokens: QUERY_LIMITS.SUBSTRING_EXPLANATION_MAX,
                userId,
              },
              undefined,
              userId,
            );

            // #region agent log
            try {
              // fs is already imported at the top
              const logPath =
                "/Users/s3255727/Documents/dev/email-client/.cursor/debug.log";
              const logEntry = `${JSON.stringify({
                location: "emails.service.ts:1785",
                message: "AI explanation generated",
                logData: {
                  emailId: (rawEmail.messageId as string)?.substring(
                    0,
                    QUERY_LIMITS.THREAD_ID_SHORT,
                  ),
                  originalQuery,
                  explanationLength: explanation?.length,
                  explanationPreview: explanation?.substring(
                    0,
                    QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH,
                  ),
                },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run1",
                hypothesisId: "E",
              })}\n`;
              fs.appendFileSync(logPath, logEntry);
            } catch (e) {}
            // #endregion

            // Clean up the explanation (remove quotes, trim, ensure it's not too long)
            let cleanedExplanation = explanation.trim();
            // Remove surrounding quotes if present
            if (
              (cleanedExplanation.startsWith('"') &&
                cleanedExplanation.endsWith('"')) ||
              (cleanedExplanation.startsWith("'") &&
                cleanedExplanation.endsWith("'"))
            ) {
              cleanedExplanation = cleanedExplanation.slice(1, -1);
            }
            // Limit to 100 characters
            if (
              cleanedExplanation.length > QUERY_LIMITS.SUBSTRING_EXPLANATION_MAX
            ) {
              cleanedExplanation = `${cleanedExplanation.substring(0, QUERY_LIMITS.SUBSTRING_EXPLANATION_TRUNCATE)}...`;
            }

            // #region agent log
            try {
              // fs is already imported at the top
              const logPath =
                "/Users/s3255727/Documents/dev/email-client/.cursor/debug.log";
              const logEntry = `${JSON.stringify({
                location: "emails.service.ts:1805",
                message: "Explanation cleaned and finalized",
                logData: {
                  emailId: (rawEmail.messageId as string)?.substring(
                    0,
                    QUERY_LIMITS.THREAD_ID_SHORT,
                  ),
                  finalExplanation:
                    cleanedExplanation || `Relevant to "${originalQuery}"`,
                },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run1",
                hypothesisId: "E",
              })}\n`;
              fs.appendFileSync(logPath, logEntry);
            } catch (e) {}
            // #endregion

            return {
              rawEmail,
              explanation:
                cleanedExplanation || `Relevant to "${originalQuery}"`,
            };
          } catch (error) {
            // Fallback to simple explanation if AI generation fails
            this.logger.warn(
              `Failed to generate AI explanation for email ${rawEmail.messageId}:`,
              error,
            );
            // #region agent log
            try {
              // fs is already imported at the top
              const logPath =
                "/Users/s3255727/Documents/dev/email-client/.cursor/debug.log";
              const logEntry = `${JSON.stringify({
                location: "emails.service.ts:1815",
                message: "AI explanation generation failed, using fallback",
                logData: {
                  emailId: (rawEmail.messageId as string)?.substring(
                    0,
                    QUERY_LIMITS.THREAD_ID_SHORT,
                  ),
                  error: error?.message,
                },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run1",
                hypothesisId: "E",
              })}\n`;
              fs.appendFileSync(logPath, logEntry);
            } catch (e) {}
            // #endregion
            const from = rawEmail.fromName || rawEmail.from;
            const subject = rawEmail.subject || "";
            return {
              rawEmail,
              explanation: `From ${from}${subject ? `: ${subject.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH)}` : ""}`,
            };
          }
        }),
      );

      // Step 5: Save emails to database
      onProgress?.("saving", "Saving emails to database...");

      // Convert raw emails to database entities and save/fetch them
      // Process in parallel for better performance
      const emailPromises = emailsWithExplanations.map(
        async ({ rawEmail, explanation }) => {
          // Check if email already exists in DB
          let email = await this.getEmailByMessageId(
            userId,
            rawEmail.messageId as string,
          );

          if (!email) {
            // Check if thread is archived by checking Gmail labels
            const labelIds = (rawEmail.labelIds as string[]) || [];
            const isArchived = !labelIds.includes(GMAIL_LABELS.INBOX);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const starCount = (rawEmail as any).starCount || 0;

            // Get or create thread with correct archived status
            const thread = await this.getOrCreateEmailThread(
              userId,
              rawEmail.threadId as string,
              starCount,
              isArchived,
            );

            email = this.emailRepository.create({
              userId,
              messageId: rawEmail.messageId as string,
              threadId: rawEmail.threadId as string,
              emailThreadId: thread.id,
              subject: rawEmail.subject as string,
              from: rawEmail.from as string,
              fromName: rawEmail.fromName as string | undefined,
              body: rawEmail.body as string,
              htmlBody: rawEmail.htmlBody as string | undefined,
              receivedAt: rawEmail.receivedAt,
              // Priority score will be calculated from breakdown
              isRead: (rawEmail.isRead as boolean) || false,
              isBatched: false,
              labels: (rawEmail.labelIds as string[]) || [],
            } as Partial<Email>);
            email = await this.emailRepository.save(email);
          } else {
            // Update thread archived status if email exists (defer to batch update)
            // We'll batch these updates at the end for better performance
          }

          // Add explanation and relevance score to email object (not stored in DB, just for this search result)
          const emailWithMetadata = email as EmailWithMetadata;
          // Always include explanation - use generated one or create a simple one
          emailWithMetadata.searchExplanation =
            explanation || `Relevant to "${originalQuery}"`;
          emailWithMetadata.relevanceScore =
            (rawEmail as unknown as EmailWithMetadata).relevanceScore ??
            undefined;
          const isArchived = !((rawEmail.labelIds as string[]) || []).includes(
            GMAIL_LABELS.INBOX,
          );
          if (email.emailThreadId && isArchived) {
            emailWithMetadata._needsThreadUpdate = {
              threadId: email.threadId,
              isArchived: true,
            };
          }

          return emailWithMetadata;
        },
      );

      const emails = await Promise.all(emailPromises);

      // Batch update thread archived statuses (more efficient than individual updates)
      const threadUpdates = emails
        .filter((e) => e._needsThreadUpdate)
        .map((e) => {
          const update = e._needsThreadUpdate;
          // Clean up temporary property
          delete e._needsThreadUpdate;
          return update;
        });

      // Use batch update for better performance
      if (threadUpdates.length > 0) {
        this.batchUpdateThreadArchivedStatuses(userId, threadUpdates).catch(
          (err) => {
            this.logger.warn("Failed to batch update thread statuses:", err);
          },
        );
      }

      // Build debug info with all raw emails and their scores
      const debugInfo = {
        originalQuery,
        gmailQuery: successfulQuery || gmailQueries[0] || query,
        queriesTried,
        totalRawEmails: rawEmails.length,
        maxResultsRequested: maxResults,
        filteredCount: filteredEmails.length,
        allRawEmails: rawEmails.map((rawEmail, index) => {
          const receivedDate = new Date(rawEmail.receivedAt);
          const daysAgo = Math.floor(
            (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          return {
            index,
            from: rawEmail.fromName || rawEmail.from,
            subject: rawEmail.subject,
            receivedAt: rawEmail.receivedAt,
            daysAgo,
            aiScore: allScores.get(index) ?? null,
            includedInResults: filteredEmails.includes(rawEmail),
          };
        }),
      };

      // Sort results by relevance score (highest first) before returning
      emails.sort((a, b) => {
        const scoreA = (a as EmailWithMetadata).relevanceScore ?? 0;
        const scoreB = (b as EmailWithMetadata).relevanceScore ?? 0;
        // Descending order
        return scoreB - scoreA;
      });

      // Return emails with metadata (explanations and relevance scores)
      // Convert to plain objects to ensure custom properties are serialized
      const result = emails.map((email) => {
        const emailTyped = email as EmailWithMetadata;
        const plain: EmailWithMetadata = {
          ...emailTyped,
          getPriorityScore:
            emailTyped.getPriorityScore?.bind(emailTyped) || (() => 0),
        };
        // Explicitly include searchExplanation, relevanceScore, and debugInfo
        // Use Object.assign to ensure properties are copied
        const emailWithMeta = email as EmailWithMetadata;
        plain.searchExplanation = emailWithMeta.searchExplanation;
        plain.relevanceScore = emailWithMeta.relevanceScore;
        // Add debug info to first email only (to avoid bloating response)
        if (emails.indexOf(email) === 0) {
          plain.debugInfo = debugInfo;
        }
        return plain;
      });

      this.logger.debug(
        `Search returning ${result.length} emails, sorted by relevance. First email has explanation: ${!!result[0]?.searchExplanation}, relevanceScore: ${result[0]?.relevanceScore}`,
      );

      onProgress?.("complete", `Found ${result.length} emails`);

      return result as Array<
        Email & {
          searchExplanation?: string;
          relevanceScore?: number;
          debugInfo?: Record<string, unknown>;
        }
      >;
    } catch (error) {
      this.logger.error(
        `Error in searchEmails for query "${originalQuery}":`,
        error,
      );
      // Always return no-results marker with queriesTried, even on error
      return [
        {
          id: "no-results",
          subject: "",
          from: "",
          body: "",
          receivedAt: new Date().toISOString(),
          debugInfo: {
            originalQuery,
            queriesTried: queriesTried.length > 0 ? queriesTried : [],
            message: `Error occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
            error: true,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ];
    }
  }

  /**
   * Debug endpoint to find missing starred threads
   * Compares Gmail starred emails with what's in our DB
   */
  // eslint-disable-next-line max-lines-per-function
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
      .where("thread.userId = :userId", { userId })
      .andWhere('thread."starCount" > 0')
      .getMany();

    // 3. Get all emails that belong to starred threads
    const starredThreadIds = allStarredThreads.map((t) => t.id);
    const emailsInStarredThreads =
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
    const actionTabEmails = await this.getInbox(userId, false, "action");

    // 5. Compare Gmail vs DB
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

    // 6. Identify issues for each starred thread
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

    // 7. Identify threads missing from process tab
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
        id: `${e.id.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...`,
        threadId:
          `${e.threadId?.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...` ||
          "N/A",
        emailThreadId:
          `${e.emailThreadId?.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW)}...` ||
          null,
        subject:
          e.subject?.substring(0, QUERY_LIMITS.SUBSTRING_PREVIEW_LENGTH) ||
          "N/A",
        from: e.from?.substring(0, MINUTES.THIRTY) || "N/A",
        receivedAt: e.receivedAt,
      })),
      threadsInDb: allThreads.length,
      threadsWithoutEmails,
    };
  }

  /**
   * Fix orphan emails by creating/linking EmailThread records
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
   * Fix threads stuck in "calculating" status
   * Finds emails with isProcessingPriority=true that are older than 10 minutes
   * and either resets them or re-queues the job
   */
  async fixStuckCalculatingThreads(
    userId: string,
  ): Promise<{ fixed: number; requeued: number; errors: string[] }> {
    this.logger.log(
      `Checking for stuck calculating threads for user ${userId}`,
    );

    // Find threads that have been in "calculating" state for more than 10 minutes
    // Priority is now thread-level, so check threads instead of emails
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const stuckThreads = await this.emailThreadRepository.find({
      where: {
        userId,
        isProcessingPriority: true,
      },
      select: ["id", "updatedAt", "priorityExplanation"],
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

        // Re-queue the job
        const jobId = await this.boss
          .send(
            "refine-priority",
            { userId, emailId: email.id },
            {
              priority: getJobPriority("refine-priority-background", false),
              singletonKey: `refine-priority-${email.id}`,
              singletonMinutes: 5,
            },
          )
          .catch((err) => {
            this.logger.error(
              `Failed to re-queue priority job for thread ${thread.id} (email ${email.id}):`,
              err,
            );
            return null;
          });

        if (jobId) {
          requeued++;
          this.logger.debug(
            `Re-queued priority job ${jobId} for stuck thread ${thread.id} (email ${email.id})`,
          );
        } else {
          // Just reset the flag, couldn't queue
          fixed++;
        }
      } catch (err: unknown) {
        const errorMsg = `Failed to fix stuck thread ${thread.id}: ${isError(err) ? err.message : "Unknown error"}`;
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
   * Get existing starred threads from database
   * Delegates to EmailThreadService
   */
  async getThreadsByThreadIds(
    userId: string,
    threadIds: string[],
  ): Promise<Array<{ threadId: string; updatedAt: Date }>> {
    if (threadIds.length === 0) return [];
    
    const threads = await this.emailThreadRepository.find({
      where: { userId, threadId: In(threadIds) },
      select: ["threadId", "updatedAt"],
    });
    return threads.map((t) => ({
      threadId: t.threadId,
      updatedAt: t.updatedAt,
    }));
  }

  async getExistingStarredThreads(
    userId: string,
  ): Promise<
    Array<{ threadId: string; starCount: number; isArchived: boolean }>
  > {
    const threads = await this.emailThreadRepository.find({
      where: { userId, starCount: MoreThan(0) },
      select: ["threadId", "starCount", "isArchived"],
    });
    return threads.map((t) => ({
      threadId: t.threadId,
      starCount: t.starCount,
      isArchived: t.isArchived,
    }));
  }
}