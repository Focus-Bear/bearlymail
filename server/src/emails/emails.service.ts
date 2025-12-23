import { Injectable, Inject, forwardRef, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan, MoreThan, IsNull, Not, In } from "typeorm";
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
import { BatchScheduleService } from "../batch-schedule/batch-schedule.service";

// Performance budgets in milliseconds
const PERF_BUDGETS = {
  INBOX_TOTAL: 500,
  INBOX_PROCESS_TOTAL: 1000, // Process mode can be slower (3.5s target)
  THREAD_QUERY: 100,
  THREAD_QUERY_PROCESS: 300, // Process mode query is more complex
  THREAD_COUNT_QUERY: 50,
  EMAIL_QUERY: 100, // Raw SQL query for emails
  DECRYPTION: 100, // Decrypting encrypted fields (from, fromName, subject, summary)
  PRIORITY_CALC: 200,
  LABEL_CONVERT: 100,
  THREAD_GROUPING: 50, // Just combining thread info with emails (no decryption)
  PRIORITY_EXPLANATION: 3000, // Max 3 seconds for priority explanation generation
};

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
    const exceededSpans = this.spans.filter((s) => s.exceeded);
    let budget: number;
    if (this.operation === "priority-explanation") {
      budget = PERF_BUDGETS.PRIORITY_EXPLANATION;
    } else if (this.operation === "search-relevance-explanations") {
      budget = 3000; // 3 seconds for all search explanations
    } else {
      budget =
        mode === "action"
          ? PERF_BUDGETS.INBOX_PROCESS_TOTAL
          : PERF_BUDGETS.INBOX_TOTAL;
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
        spans: this.spans.map((s) => ({
          name: s.name,
          duration: s.duration,
          budget: s.budget,
          exceeded: s.exceeded,
        })),
        exceededSpans: exceededSpans.map(
          (s) => `${s.name}: ${s.duration}ms (budget: ${s.budget}ms)`,
        ),
      };

      const logLine = `${JSON.stringify(logEntry)}\n`;

      // Log to console - only if total exceeded budget
      this.logger.warn(
        `⚠️ PERF ISSUE: ${this.operation} (mode: ${mode || "triage"}) took ${totalDuration}ms (budget: ${budget}ms)`,
      );
      exceededSpans.forEach((s) => {
        this.logger.warn(
          `   - ${s.name}: ${s.duration}ms exceeded budget of ${s.budget}ms`,
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
    private batchScheduleService: BatchScheduleService,
    @Inject(forwardRef(() => GitHubService))
    private githubService?: GitHubService,
    @Inject(forwardRef(() => GitHubApiService))
    private githubApiService?: GitHubApiService,
  ) {}

  async getInbox(
    userId: string,
    _includeBatched: boolean = false,
    mode: "triage" | "action" | "follow-up" = "triage",
  ): Promise<Email[]> {
    const perf = new PerformanceTracker(`getInbox(${mode})`);

    // Pre-warm blocked senders cache to avoid DB query during filtering
    await this.blockedSendersService.getBlockedEmailHashes(userId);

    // Auto-fix stuck calculating threads (non-blocking, runs in background)
    // Only check occasionally to avoid performance impact (10% chance)
    if (Math.random() < 0.1) {
      this.fixStuckCalculatingThreads(userId).catch((err) =>
        this.logger.error("Error auto-fixing stuck calculating threads:", err),
      );
    }

    // OPTIMIZED: Single combined query that fetches threads + full email data in one round-trip
    // This eliminates the second database round-trip, saving ~250ms network latency
    const threadQueryBudget =
      mode === "action"
        ? PERF_BUDGETS.THREAD_QUERY_PROCESS
        : PERF_BUDGETS.THREAD_QUERY;
    const endCombinedQuery = perf.startSpan(
      "combined_query",
      threadQueryBudget + PERF_BUDGETS.EMAIL_QUERY,
    );

    // Build filter conditions
    let threadFilter = "";
    if (mode === "action") {
      threadFilter =
        'AND thread."isArchived" = false AND thread."starCount" > 0';
    } else if (mode === "follow-up") {
      // For follow-up: starred AND not_snoozed (we'll filter user_sent_last and no_reply_received later)
      threadFilter =
        'AND thread."isArchived" = false AND thread."starCount" > 0';
    } else {
      threadFilter =
        'AND thread."isArchived" = false AND thread."starCount" = 0';
    }

    // Single query: Get threads + full email data in one round-trip
    // Uses LATERAL JOIN to find best email per thread, then fetches all needed fields
    const rawEmails = await this.emailRepository.query(
      `SELECT
        thread."starCount",
        thread."isArchived",
        thread."lastCheckedAt",
        thread."urgencyScore",
        thread."urgencyExplanation",
        thread."githubMetadata",
        e.id,
        e."userId",
        e."threadId",
        e."emailThreadId",
        e."messageId",
        e."from",
        e."fromName",
        e."senderJobTitle",
        e.subject,
        e."priorityScore",
        e."isSnoozed",
        e."snoozeUntil",
        e."isBatched",
        e."batchReleaseAt",
        e."isRead",
        e.summary,
        e."isProcessingPriority",
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
          em."priorityScore",
          em."isSnoozed",
          em."snoozeUntil",
          em."isBatched",
          em."batchReleaseAt",
          em."isRead",
          em.summary,
          em."isProcessingPriority",
          em."isProcessingSummary",
          em."receivedAt",
          em.labels
        FROM emails em
        WHERE em."emailThreadId" = thread.id AND em."userId" = $1
        ORDER BY COALESCE(em."priorityScore", 50) DESC NULLS LAST, em."receivedAt" DESC
        LIMIT 1
      ) e
      WHERE thread."userId" = $1
        ${threadFilter}
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
    const endDecryption = perf.startSpan("decryption", PERF_BUDGETS.DECRYPTION);

    const threadRepresentatives: Email[] = rawEmails.map((row: any) => {
      // Decrypt and parse labels (stored as encrypted JSON)
      let labels: string[] | null = null;
      if (row.labels) {
        try {
          const decryptedLabels = EncryptionHelper.decrypt(row.labels);
          if (decryptedLabels) {
            labels = JSON.parse(decryptedLabels);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to decrypt/parse labels for email ${row.id}:`,
            error,
          );
          labels = null;
        }
      }

      return {
        id: row.id,
        userId: row.userId,
        threadId: row.threadId,
        emailThreadId: row.emailThreadId,
        messageId: row.messageId,
        from: EncryptionHelper.decrypt(row.from),
        fromName: EncryptionHelper.decrypt(row.fromName),
        senderJobTitle: EncryptionHelper.decrypt(row.senderJobTitle),
        subject: EncryptionHelper.decrypt(row.subject),
        priorityScore: row.priorityScore,
        isSnoozed: row.isSnoozed,
        snoozeUntil: row.snoozeUntil,
        isBatched: row.isBatched,
        batchReleaseAt: row.batchReleaseAt,
        isRead: row.isRead,
        summary: EncryptionHelper.decrypt(row.summary),
        isProcessingPriority: row.isProcessingPriority,
        isProcessingSummary: row.isProcessingSummary,
        receivedAt: row.receivedAt,
        labels: labels || [],
        // Thread-level properties from the combined query
        starCount: row.starCount,
        isArchived: row.isArchived,
        urgencyScore: row.urgencyScore || 0,
        urgencyExplanation: row.urgencyExplanation
          ? EncryptionHelper.decrypt(row.urgencyExplanation)
          : null,
        githubMetadata: row.githubMetadata
          ? (() => {
              try {
                const decrypted = EncryptionHelper.decrypt(row.githubMetadata);
                return decrypted ? JSON.parse(decrypted) : null;
              } catch (error) {
                this.logger.warn(
                  `Failed to decrypt/parse githubMetadata for email ${row.id}:`,
                  error,
                );
                return null;
              }
            })()
          : null,
      } as unknown as Email;
    });

    endDecryption();

    // STEP 5: Calculate priorities if needed (only for emails with default score)
    // OPTIMIZATION: Skip days calculation for inbox display - it's expensive and provides marginal value
    // The priority score is already calculated when emails are first received
    const emailsNeedingPriority = threadRepresentatives.filter(
      (e) => !e.priorityScore || e.priorityScore === 50,
    );
    if (emailsNeedingPriority.length > 0) {
      const endPriorityCalc = perf.startSpan(
        "priority_calc",
        PERF_BUDGETS.PRIORITY_CALC,
      );

      // Fetch context once for all emails using raw query for speed
      const endGetContexts = perf.startSpan("priority_get_contexts", 100);
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

      // Calculate priority scores (synchronous, fast)
      const endScoreCalc = perf.startSpan("priority_score_calc", 50);
      const updates = emailsNeedingPriority.map((email) => ({
        id: email.id,
        priorityScore: this.priorityService.calculateBasicPriorityScore(
          email,
          contexts,
          undefined,
        ),
      }));
      endScoreCalc();

      // Update in-memory objects immediately
      updates.forEach((update) => {
        const email = emailsNeedingPriority.find((e) => e.id === update.id);
        if (email) email.priorityScore = update.priorityScore;
      });

      // Batch update in DB (non-blocking)
      Promise.all(
        updates.map((update) =>
          this.emailRepository
            .update(update.id, { priorityScore: update.priorityScore })
            .catch((err) =>
              this.logger.error(
                `Failed to update priority for email ${update.id}:`,
                err,
              ),
            ),
        ),
      ).catch((err) =>
        this.logger.error("Error batch updating priorities:", err),
      );

      endPriorityCalc();
    }

    // STEP 5.5: Adjust priority for read emails in triage mode
    // Read emails should appear lower since user already looked at them and didn't star them
    if (mode === "triage") {
      threadRepresentatives.forEach((email) => {
        if (email.isRead) {
          // Reduce priority score by 30 points for read emails (only for sorting, not stored)
          (email as any).adjustedPriorityScore =
            (email.priorityScore ?? 50) - 30;
        } else {
          (email as any).adjustedPriorityScore = email.priorityScore ?? 50;
        }
      });
    }

    // STEP 6: Sort by priority (DESC), then by received date (DESC)
    // In triage mode, use adjustedPriorityScore; otherwise use priorityScore
    const sortedEmails = threadRepresentatives.sort((a, b) => {
      const aScore =
        mode === "triage" && (a as any).adjustedPriorityScore !== undefined
          ? (a as any).adjustedPriorityScore
          : (a.priorityScore ?? 50);
      const bScore =
        mode === "triage" && (b as any).adjustedPriorityScore !== undefined
          ? (b as any).adjustedPriorityScore
          : (b.priorityScore ?? 50);
      if (Math.abs(bScore - aScore) > 0.01) {
        return bScore - aScore;
      }
      return (
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );
    });

    // STEP 7: Filter out blocked senders
    const endBlockedFilter = perf.startSpan("blocked_filter", 50);
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
    if (mode === "action") {
      // Action mode: exclude emails that meet follow-up criteria
      const endActionFilter = perf.startSpan("action_filter_exclude_followups", 500);
      
      // Get user email for comparison
      const user = await this.usersService.findOne(userId);
      if (!user?.email) {
        this.logger.warn("User email not found, skipping action filter");
      } else {
        const userEmail = EncryptionHelper.decrypt(user.email).toLowerCase();
        
        // Get all unique thread IDs
        const threadIds = [...new Set(filteredEmails.map((e) => e.threadId))];
        
        // Batch query: Get all emails for all threads in one query
        const allThreadEmails = await this.emailRepository.find({
          where: { userId, threadId: In(threadIds) },
          order: { receivedAt: "ASC" },
        });
        
        // Group emails by threadId
        const emailsByThread = new Map<string, Email[]>();
        for (const email of allThreadEmails) {
          if (!emailsByThread.has(email.threadId)) {
            emailsByThread.set(email.threadId, []);
          }
          emailsByThread.get(email.threadId)!.push(email);
        }
        
        // Filter out emails that meet follow-up criteria
        const actionEmails: Email[] = [];
        for (const email of filteredEmails) {
          try {
            const threadEmails = emailsByThread.get(email.threadId) || [];
            const threadStatus = this.checkThreadFollowUpStatusFromDB(
              threadEmails,
              userEmail,
            );
            
            // Exclude if it meets follow-up criteria
            if (threadStatus.userSentLast && !threadStatus.replyReceived) {
              // Check 4-day criteria
              const now = new Date();
              const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
              const meetsTimeCriteria = 
                !threadStatus.lastTheirReplyAt ||
                threadStatus.lastTheirReplyAt < fourDaysAgo;
              
              if (meetsTimeCriteria) {
                // This is a follow-up email, exclude it from action view
                continue;
              }
            }
            
            actionEmails.push(email);
          } catch (error) {
            // If we can't check, include it in action view
            actionEmails.push(email);
          }
        }
        filteredEmails = actionEmails;
      }
      endActionFilter();
    }

    if (mode === "follow-up") {
      const endFollowUpFilter = perf.startSpan("follow_up_filter", 500);
      // Filter out snoozed emails first
      filteredEmails = filteredEmails.filter(
        (e) =>
          !e.isSnoozed ||
          (e.snoozeUntil && new Date(e.snoozeUntil) < new Date()),
      );

      // Get user email for comparison (once, not per thread)
      const user = await this.usersService.findOne(userId);
      if (!user?.email) {
        this.logger.warn("User email not found, skipping follow-up filter");
        filteredEmails = [];
        endFollowUpFilter();
        perf.finish(mode);
        return filteredEmails;
      }
      const userEmail = EncryptionHelper.decrypt(user.email).toLowerCase();

      // Get all unique thread IDs
      const threadIds = [...new Set(filteredEmails.map((e) => e.threadId))];

      // Batch query: Get all emails for all threads in one query
      const allThreadEmails = await this.emailRepository.find({
        where: { userId, threadId: In(threadIds) },
        order: { receivedAt: "ASC" },
      });

      // Group emails by threadId
      const emailsByThread = new Map<string, Email[]>();
      for (const email of allThreadEmails) {
        if (!emailsByThread.has(email.threadId)) {
          emailsByThread.set(email.threadId, []);
        }
        emailsByThread.get(email.threadId)!.push(email);
      }

      // Check thread status for each email using database data
      const followUpEmails: Email[] = [];
      for (const email of filteredEmails) {
        try {
          const threadEmails = emailsByThread.get(email.threadId) || [];
          const threadStatus = this.checkThreadFollowUpStatusFromDB(
            threadEmails,
            userEmail,
          );
          if (threadStatus.userSentLast && !threadStatus.replyReceived) {
            // Check 4-day criteria: they never replied OR it's been more than 4 days since their last reply
            const now = new Date();
            const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
            const meetsTimeCriteria = 
              !threadStatus.lastTheirReplyAt || // They never replied
              threadStatus.lastTheirReplyAt < fourDaysAgo; // More than 4 days ago
            
            if (!meetsTimeCriteria) {
              // Skip this email - they replied less than 4 days ago
              continue;
            }
            
            // Add reply times to email
            (email as any).lastTheirReplyAt =
              threadStatus.lastTheirReplyAt?.toISOString();
            (email as any).lastMyReplyAt =
              threadStatus.lastMyReplyAt?.toISOString();
            
            // Find the other person's name from their last email
            if (threadStatus.lastTheirReplyAt) {
              const theirLastEmail = threadEmails.find(
                (e) => e.receivedAt.getTime() === threadStatus.lastTheirReplyAt!.getTime() &&
                (e.labels?.includes("SENT") === false &&
                 EncryptionHelper.decrypt(e.from).toLowerCase() !== userEmail)
              );
              if (theirLastEmail) {
                (email as any).otherPersonName = theirLastEmail.fromName 
                  ? EncryptionHelper.decrypt(theirLastEmail.fromName)
                  : EncryptionHelper.decrypt(theirLastEmail.from);
                (email as any).otherPersonEmail = EncryptionHelper.decrypt(theirLastEmail.from);
              }
            } else {
              // If they never replied, use the original sender
              (email as any).otherPersonName = email.fromName 
                ? EncryptionHelper.decrypt(email.fromName)
                : EncryptionHelper.decrypt(email.from);
              (email as any).otherPersonEmail = EncryptionHelper.decrypt(email.from);
            }
            
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
   * OPTIMIZED: Uses database data instead of Gmail API calls
   */
  private checkThreadFollowUpStatusFromDB(
    threadEmails: Email[],
    userEmail: string,
  ): {
    userSentLast: boolean;
    replyReceived: boolean;
    lastTheirReplyAt: Date | null;
    lastMyReplyAt: Date | null;
  } {
    if (threadEmails.length === 0) {
      return {
        userSentLast: false,
        replyReceived: false,
        lastTheirReplyAt: null,
        lastMyReplyAt: null,
      };
    }

    // Sort emails by receivedAt (already sorted from query, but ensure)
    const sortedEmails = [...threadEmails].sort(
      (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime(),
    );

    let lastTheirReplyAt: Date | null = null;
    let lastMyReplyAt: Date | null = null;

    // Check each email to find last reply from them and from user
    for (const email of sortedEmails) {
      // Check if email is from user (has SENT label or from matches user email)
      const isFromUser =
        email.labels?.includes("SENT") ||
        EncryptionHelper.decrypt(email.from).toLowerCase() === userEmail;

      if (isFromUser) {
        lastMyReplyAt = email.receivedAt;
      } else {
        // Not from user, so it's from them
        lastTheirReplyAt = email.receivedAt;
      }
    }

    // User sent last if the last email (by receivedAt) is from user
    const lastEmail = sortedEmails[sortedEmails.length - 1];
    const lastEmailIsFromUser =
      lastEmail.labels?.includes("SENT") ||
      EncryptionHelper.decrypt(lastEmail.from).toLowerCase() === userEmail;
    const userSentLast = lastEmailIsFromUser;

    // No reply received if user sent last and there's no message from them after the last user message
    const replyReceived =
      !userSentLast ||
      (lastTheirReplyAt && lastMyReplyAt && lastTheirReplyAt > lastMyReplyAt);

    return {
      userSentLast,
      replyReceived,
      lastTheirReplyAt,
      lastMyReplyAt,
    };
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
        const convertedLabels = email.labels
          .map((id) => labelIdToName.get(id) || id)
          .filter(
            (name) => !name.startsWith("Label_") && !name.startsWith("label_"),
          );

        // Only update if labels changed
        if (JSON.stringify(convertedLabels) !== JSON.stringify(email.labels)) {
          email.labels = convertedLabels;
          // Update in DB (non-blocking)
          this.emailRepository
            .update(email.id, { labels: convertedLabels })
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

  async getThreadEmails(userId: string, threadId: string): Promise<Email[]> {
    // CRITICAL: Use query builder with explicit select to avoid decrypting body/htmlBody
    // These are large encrypted fields that cause significant slowdown
    // The frontend can fetch body/htmlBody separately if needed for individual emails
    return this.emailRepository
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
        "email.priorityScore",
        "email.isSnoozed",
        "email.snoozeUntil",
        "email.isBatched",
        "email.batchReleaseAt",
        "email.isRead",
        "email.summary",
        "email.receivedAt",
        // Only include body/htmlBody if explicitly needed - they're large and encrypted
        // For thread view, we can fetch them separately for expanded emails
        "email.body",
        "email.htmlBody",
      ])
      .where("email.userId = :userId", { userId })
      .andWhere("email.threadId = :threadId", { threadId })
      .orderBy("email.receivedAt", "ASC") // Oldest first for thread view
      .getMany();
  }

  /**
   * Get recent thread IDs that are not archived (for checking archived status in Gmail)
   */
  async getRecentNonArchivedThreadIds(
    userId: string,
    days: number = 7,
  ): Promise<string[]> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const results = await this.emailThreadRepository
      .createQueryBuilder("thread")
      .select("thread.threadId", "threadId")
      .where("thread.userId = :userId", { userId })
      .andWhere("thread.isArchived = false")
      .innerJoin("emails", "email", "email.emailThreadId = thread.id")
      .andWhere("email.receivedAt >= :cutoffDate", { cutoffDate })
      .limit(50) // Limit to avoid rate limits
      .getRawMany();

    return results.map((r: any) => r.threadId).filter((id: string) => id); // Filter out any null/undefined
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
      .limit(200) // Limit to avoid rate limits, but higher than recent threads
      .getRawMany();

    return results.map((r: any) => r.threadId).filter((id: string) => id); // Filter out any null/undefined
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
      .limit(500) // Reasonable limit for sync
      .getMany();

    return results
      .map((t) => ({
        threadId: t.threadId,
        isArchived: t.isArchived,
        starCount: t.starCount,
      }))
      .filter((t) => t.threadId); // Filter out any null/undefined threadIds
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
          `Updated thread ${threadId.substring(0, 8)}... archived status to ${isArchived}`,
        );
      }
    } else {
      // Thread doesn't exist yet, create it
      await this.getOrCreateEmailThread(userId, threadId, 0, isArchived);
    }
  }

  /**
   * Batch update thread archived statuses (more efficient than individual updates)
   */
  async batchUpdateThreadArchivedStatuses(
    userId: string,
    updates: Array<{ threadId: string; isArchived: boolean }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    const now = new Date();
    // Group by status for more efficient updates
    const archivedThreadIds = updates
      .filter((u) => u.isArchived)
      .map((u) => u.threadId);
    const unarchivedThreadIds = updates
      .filter((u) => !u.isArchived)
      .map((u) => u.threadId);

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
   * For bulk updates, use batchUpdateThreadStarCount instead
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
      console.log(
        `Updated thread ${threadId.substring(0, 8)}... star count to ${starCount}`,
      );
    } else {
      // Thread doesn't exist yet, create it
      await this.getOrCreateEmailThread(userId, threadId, starCount, false);
    }
  }

  /**
   * Bulk update star counts for multiple threads in a single query
   * Performance budget: 200ms per thread (but bulk update makes this much faster)
   */
  async batchUpdateThreadStarCount(
    userId: string,
    updates: { threadId: string; starCount: number }[],
  ): Promise<void> {
    if (updates.length === 0) return;

    const startTime = Date.now();

    // Use raw SQL for efficient bulk update with CASE statements
    // Group updates by starCount to minimize queries
    const updatesByStarCount = new Map<number, string[]>();
    for (const update of updates) {
      const starCount = Math.max(0, Math.min(3, update.starCount));
      if (!updatesByStarCount.has(starCount)) {
        updatesByStarCount.set(starCount, []);
      }
      updatesByStarCount.get(starCount)!.push(update.threadId);
    }

    const now = new Date();
    // Execute bulk updates for each starCount value
    await this.emailThreadRepository.manager.transaction(async (manager) => {
      for (const [starCount, threadIds] of updatesByStarCount.entries()) {
        if (threadIds.length > 0) {
          await manager.query(
            `UPDATE email_threads 
             SET "starCount" = $1, "updatedAt" = CURRENT_TIMESTAMP, "lastCheckedAt" = $4
             WHERE "userId" = $2 AND "threadId" = ANY($3::text[])`,
            [starCount, userId, threadIds, now],
          );
        }
      }
    });

    const duration = Date.now() - startTime;
    const perThreadTime = duration / updates.length;
    if (perThreadTime > 200) {
      this.logger.warn(
        `batchUpdateThreadStarCount took ${duration}ms for ${updates.length} threads (${perThreadTime.toFixed(1)}ms/thread, budget: 200ms)`,
      );
    } else {
      this.logger.debug(
        `batchUpdateThreadStarCount: ${updates.length} threads in ${duration}ms (${perThreadTime.toFixed(1)}ms/thread)`,
      );
    }
  }

  /**
   * Get existing starred threads from database (for checking against Gmail)
   */
  async getExistingStarredThreads(userId: string): Promise<
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

  /**
   * Batch update thread statuses (archived + starred) in a single transaction
   * This is MUCH faster than individual updates for syncing many threads
   */
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
        const archivedUpdates = updates.filter((u) => u.isArchived);
        const starredUpdates = updates.filter((u) => u.starCount > 0);
        const unstarredUpdates = updates.filter(
          (u) => u.starCount === 0 && !u.isArchived,
        );

        // Update archived threads
        if (archivedUpdates.length > 0) {
          const archivedIds = archivedUpdates.map((u) => u.threadId);
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
          const starredIds = starredUpdates.map((u) => u.threadId);
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
          const unstarredIds = unstarredUpdates.map((u) => u.threadId);
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
    starCount: number = 0,
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
          `Created EmailThread for thread ${threadId.substring(0, 8)}... (starCount=${starCount}, isArchived=${isArchived})`,
        );
      } catch (error: any) {
        // Handle race condition: if another process created the thread between our check and save
        if (
          error.code === "23505" ||
          error.message?.includes("duplicate key") ||
          error.message?.includes("unique constraint")
        ) {
          // Thread was created by another process, fetch it
          this.logger.debug(
            `Race condition detected for thread ${threadId.substring(0, 8)}..., fetching existing thread`,
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
          `Updated EmailThread for thread ${threadId.substring(0, 8)}... (starCount=${starCount}, isArchived=${isArchived})`,
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

  async createEmail(userId: string, emailData: Partial<Email>): Promise<Email> {
    console.log(`Creating email for user ${userId}: ${emailData.subject}`);

    // Check if sender is blocked
    const senderEmail = emailData.from || "";
    const isBlocked = await this.blockedSendersService.isSenderBlocked(
      userId,
      senderEmail,
    );

    // Extract thread-level properties (these should come from EmailThread, not Email)
    const starCount = (emailData as any).starCount || 0;
    // If blocked, always archive
    const isArchived = isBlocked
      ? true
      : (emailData as any).isArchived || false;

    // Get or create EmailThread
    const thread = await this.getOrCreateEmailThread(
      userId,
      emailData.threadId!,
      starCount,
      isArchived,
    );

    // Remove thread-level properties from emailData before creating Email
    const {
      starCount: _,
      isArchived: __,
      ...emailDataWithoutThreadProps
    } = emailData as any;

    // TypeORM create can return Email or Email[], but we're passing a single object so it returns Email
    const emailDataToCreate: Partial<Email> = {
      ...emailDataWithoutThreadProps,
      userId,
      emailThreadId: thread.id, // Link to EmailThread
    };
    const createdEntities = this.emailRepository.create(emailDataToCreate);
    const email = (
      Array.isArray(createdEntities) ? createdEntities[0] : createdEntities
    ) as Email;

    // If sender is blocked, skip priority calculation and LLM processing
    if (isBlocked) {
      console.log(
        `📛 Email from blocked sender ${senderEmail} - auto-archiving and skipping LLM processing`,
      );
      email.priorityScore = 0; // Lowest priority
      email.isProcessingPriority = false;
      email.isProcessingSummary = false;
      email.summary = "[Blocked sender]";

      // Add blocked-by-bearlymail label
      const existingLabels = email.labels || [];
      email.labels = [...existingLabels, "blocked-by-bearlymail"];

      const savedEmail = await this.emailRepository.save(email);
      return savedEmail;
    }

    // Get context for basic priority calculation
    const contexts = await this.priorityService.getUserContexts(userId);

    // Calculate days since last email in thread for priority boost
    const daysSinceLastEmail = await this.calculateDaysSinceLastEmail(
      userId,
      email,
    );

    // Calculate basic priority score immediately (fast, no LLM)
    email.priorityScore = this.priorityService.calculateBasicPriorityScore(
      email,
      contexts,
      daysSinceLastEmail,
    );
    email.isProcessingPriority = true; // Mark as processing for LLM refinement
    email.isProcessingSummary = true; // Mark as processing for summary generation

    // Check thread urgency score to determine if we should bypass batching
    // If urgencyScore >= 90, never batch (immediate release)
    // Otherwise, apply normal batching logic
    const threadUrgencyScore = thread.urgencyScore || 0;
    const shouldBypassBatching = threadUrgencyScore >= 90;

    // Apply batching if not urgent and not starred (starCount = 0)
    if (!shouldBypassBatching && starCount === 0) {
      // Get batch schedule for user
      const schedule = await this.batchScheduleService.getSchedule(userId);
      if (schedule) {
        // Calculate next batch release time based on schedule
        const nextReleaseTime = this.batchScheduleService.getNextBatchReleaseTime(
          schedule,
          threadUrgencyScore,
        );
        if (nextReleaseTime) {
          email.isBatched = true;
          email.batchReleaseAt = nextReleaseTime;
        } else {
          // Schedule disabled or urgent bypass - don't batch
          email.isBatched = false;
          email.batchReleaseAt = null;
        }
      } else {
        // No schedule found - use default schedule
        const defaultSchedule = this.batchScheduleService.getDefaultSchedule();
        const tempSchedule = {
          ...defaultSchedule,
          userId,
          id: "temp",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any;
        const nextReleaseTime = this.batchScheduleService.getNextBatchReleaseTime(
          tempSchedule,
          threadUrgencyScore,
        );
        if (nextReleaseTime) {
          email.isBatched = true;
          email.batchReleaseAt = nextReleaseTime;
        } else {
          email.isBatched = false;
          email.batchReleaseAt = null;
        }
      }
    } else if (shouldBypassBatching) {
      // Never batch if urgency score >= 90
      email.isBatched = false;
      email.batchReleaseAt = null;
    }

    const savedEmail = await this.emailRepository.save(email);
    this.logger.debug(`Saved email ${savedEmail.id} to database`);

    // IMPORTANT: Always queue jobs immediately when isProcessingPriority/Summary is set
    // This ensures "Calculating..." status in UI has an actual job behind it
    // Use singleton key to prevent duplicate jobs for the same email
    const priorityJobId = await this.boss
      .send(
        "refine-priority",
        { userId, emailId: savedEmail.id },
        {
          priority: getJobPriority("refine-priority-background", false),
          singletonKey: `refine-priority-${savedEmail.id}`,
          singletonMinutes: 5, // Prevent duplicate jobs within 5 minutes
        },
      )
      .catch((err) => {
        this.logger.error(
          `Failed to queue priority refinement for email ${savedEmail.id}:`,
          err,
        );
        // Reset flag if job queueing failed
        this.emailRepository.update(
          { id: savedEmail.id },
          { isProcessingPriority: false },
        );
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

  async markAsRead(userId: string, emailId: string): Promise<Email> {
    // Update local database first
    await this.emailRepository.update(
      { id: emailId, userId },
      { isRead: true },
    );

    // Sync to Gmail (non-blocking, log errors but don't fail)
    const email = await this.getEmailById(userId, emailId);
    if (email?.messageId) {
      try {
        const provider =
          await this.emailProviderManager.getPrimaryProvider(userId);
        if (provider && "syncReadStatusToGmail" in provider) {
          // Cast to GmailProvider to access syncReadStatusToGmail method
          await (provider as any).syncReadStatusToGmail(
            userId,
            email.messageId,
            true,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to sync read status to Gmail for email ${emailId}:`,
          error,
        );
        // Don't throw - allow operation to succeed even if Gmail sync fails
      }
    }

    return email;
  }

  async markAsUnread(userId: string, emailId: string): Promise<Email> {
    // Update local database first
    await this.emailRepository.update(
      { id: emailId, userId },
      { isRead: false },
    );

    // Sync to Gmail (non-blocking, log errors but don't fail)
    const email = await this.getEmailById(userId, emailId);
    if (email?.messageId) {
      try {
        const provider =
          await this.emailProviderManager.getPrimaryProvider(userId);
        if (provider && "syncReadStatusToGmail" in provider) {
          // Cast to GmailProvider to access syncReadStatusToGmail method
          await (provider as any).syncReadStatusToGmail(
            userId,
            email.messageId,
            false,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to sync unread status to Gmail for email ${emailId}:`,
          error,
        );
        // Don't throw - allow operation to succeed even if Gmail sync fails
      }
    }

    return email;
  }

  async bulkMarkAsRead(userId: string, emailIds: string[]): Promise<void> {
    if (emailIds.length === 0) return;

    // Update local database
    await this.emailRepository.update(
      { id: In(emailIds), userId },
      { isRead: true },
    );

    // Sync to Gmail in batch (non-blocking, log errors but don't fail)
    try {
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider && "syncReadStatusToGmail" in provider) {
        // Get all emails with messageIds
        const emails = await this.emailRepository.find({
          where: { id: In(emailIds), userId },
        });

        // Batch sync to Gmail
        const syncPromises = emails
          .filter((email) => email.messageId)
          .map((email) =>
            (provider as any)
              .syncReadStatusToGmail(userId, email.messageId, true)
              .catch((error: any) => {
                this.logger.error(
                  `Failed to sync read status to Gmail for email ${email.id}:`,
                  error,
                );
              }),
          );

        await Promise.all(syncPromises);
      }
    } catch (error) {
      this.logger.error(`Failed to bulk sync read status to Gmail:`, error);
      // Don't throw - allow operation to succeed even if Gmail sync fails
    }
  }

  async bulkMarkAsUnread(userId: string, emailIds: string[]): Promise<void> {
    if (emailIds.length === 0) return;

    // Update local database
    await this.emailRepository.update(
      { id: In(emailIds), userId },
      { isRead: false },
    );

    // Sync to Gmail in batch (non-blocking, log errors but don't fail)
    try {
      const provider =
        await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider && "syncReadStatusToGmail" in provider) {
        // Get all emails with messageIds
        const emails = await this.emailRepository.find({
          where: { id: In(emailIds), userId },
        });

        // Batch sync to Gmail
        const syncPromises = emails
          .filter((email) => email.messageId)
          .map((email) =>
            (provider as any)
              .syncReadStatusToGmail(userId, email.messageId, false)
              .catch((error: any) => {
                this.logger.error(
                  `Failed to sync unread status to Gmail for email ${email.id}:`,
                  error,
                );
              }),
          );

        await Promise.all(syncPromises);
      }
    } catch (error) {
      this.logger.error(`Failed to bulk sync unread status to Gmail:`, error);
      // Don't throw - allow operation to succeed even if Gmail sync fails
    }
  }

  async archiveEmail(userId: string, emailId: string): Promise<void> {
    const email = await this.getEmailById(userId, emailId);
    if (email && email.threadId) {
      await this.updateThreadArchivedStatus(userId, email.threadId, true);
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
          .catch((err) => console.error("Failed to queue learning job", err));
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
    // Get all batched emails where thread has urgencyScore >= 90
    // Join with email_threads to check urgencyScore and isArchived
    const urgentBatchedEmails = await this.emailRepository
      .createQueryBuilder("email")
      .innerJoin("email_threads", "thread", "thread.id = email.emailThreadId")
      .where("email.userId = :userId", { userId })
      .andWhere("thread.userId = :userId", { userId })
      .andWhere("email.isBatched = true")
      .andWhere("thread.isArchived = false")
      .andWhere("thread.urgencyScore >= 90") // Must have urgency score >= 90
      .orderBy("thread.urgencyScore", "DESC")
      .addOrderBy("email.receivedAt", "DESC")
      .take(10)
      .getMany();

    return {
      hasUrgent: urgentBatchedEmails.length > 0,
      urgentCount: urgentBatchedEmails.length,
      urgentEmails: urgentBatchedEmails.map((email) => ({
        subject: email.subject, // Will be automatically decrypted by transformer
        from: email.fromName || email.from, // Will be automatically decrypted by transformer
        priorityScore: email.priorityScore,
      })),
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
          const previousEmails = previousEmailsRaw.map((row: any) => ({
            id: row.id,
            from: EncryptionHelper.decrypt(row.from),
            receivedAt: row.receivedAt,
          }));

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
      console.error("Error batch calculating days since last email:", error);
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
        return undefined; // First email from this sender in the thread
      }

      // Calculate days difference
      const daysDiff =
        (email.receivedAt.getTime() - lastEmail.receivedAt.getTime()) /
        (1000 * 60 * 60 * 24);
      return Math.max(0, Math.round(daysDiff * 10) / 10); // Round to 1 decimal place
    } catch (error) {
      console.error("Error calculating days since last email:", error);
      return undefined;
    }
  }

  /**
   * Get priority score explanation breakdown for an email
   * Returns dimensions: Urgency, Goal Alignment, VIP Contact
   */
  async getPriorityExplanation(
    userId: string,
    emailId: string,
  ): Promise<{
    score: number;
    dimensions: {
      urgency: { score: number; reasons: string[] };
      goalAlignment: { score: number; reasons: string[] };
      vipContact: { score: number; reasons: string[] };
    };
    breakdown: Array<{ factor: string; value: number; description: string }>;
  }> {
    const perf = new PerformanceTracker("priority-explanation");
    const endTotal = perf.startSpan("total", PERF_BUDGETS.PRIORITY_EXPLANATION);

    try {
      const endEmailQuery = perf.startSpan("email-query", 200);
      const email = await this.getEmailById(userId, emailId);
      endEmailQuery();

      if (!email) {
        throw new Error("Email not found");
      }

      // Get thread to access urgencyScore and urgencyExplanation
      let threadUrgencyScore = 0;
      let threadUrgencyExplanation: string | null = null;
      if (email.emailThreadId) {
        const thread = await this.emailThreadRepository.findOne({
          where: { id: email.emailThreadId, userId },
          select: ['urgencyScore', 'urgencyExplanation'],
        });
        if (thread) {
          threadUrgencyScore = thread.urgencyScore || 0;
          threadUrgencyExplanation = thread.urgencyExplanation 
            ? EncryptionHelper.decrypt(thread.urgencyExplanation) 
            : null;
        }
      }

      // Don't use cached explanation - always recalculate from components
      // This ensures the breakdown matches the actual score and uses current logic

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
      };

      // Calculate breakdown exactly like llm-processor.ts does
      // Formula: goalAlignment * 0.4 + sentiment * 0.3 + basicScore * 0.3 + urgency
      
      // Calculate goal alignment score (0-100 percentage)
      const goals = contexts.filter((c) => c.contextKey === ContextKey.MY_GOALS);
      let goalAlignmentScore = 0;
      if (goals.length > 0) {
        const matchingGoals = goals.filter((goal) => {
          const keywords = goal.contextValue
            .toLowerCase()
            .split(/[,;]/)
            .map((k) => k.trim())
            .filter(Boolean);
          return keywords.some((keyword) => emailText.includes(keyword));
        });
        goalAlignmentScore = Math.min(
          100,
          Math.round((matchingGoals.length / goals.length) * 100),
        );
      }
      
      // Get basicScore (VIP, job title, etc.) - this is what llm-processor uses
      const basicScore = this.priorityService.calculateBasicPriorityScore(
        email,
        contexts,
        daysSinceLastEmail,
      );
      
      // Get sentiment score (from LLM)
      const sentimentScore = email.sentimentScore ?? 0;
      const sentimentScoreNormalized = Math.max(0, Math.min(100, 50 - sentimentScore * 50));
      
      // Calculate contributions exactly like llm-processor
      const goalAlignmentContribution = Math.round(goalAlignmentScore * 0.4);
      const sentimentContribution = Math.round(sentimentScoreNormalized * 0.3) - 15; // Adjust for neutral
      const otherFactorsContribution = Math.round(basicScore * 0.3);
      
      // Get urgency contribution
      let urgencyContribution = 0;
      if (threadUrgencyScore > 0) {
        urgencyContribution = Math.round((threadUrgencyScore - 50) * 0.3);
      }
      
      // Build breakdown from components
      const breakdown: Array<{
        factor: string;
        value: number;
        description: string;
      }> = [];
      
      // Always add goal alignment (even if 0) so breakdown matches score
      breakdown.push({
        factor: "🎯 Goal Alignment",
        value: goalAlignmentContribution,
        description: goalAlignmentScore > 0 
          ? `Goal alignment: ${goalAlignmentScore}%`
          : "No goal alignment",
      });
      
      // Always add sentiment - the baseline of 15 is always included in the score
      // sentimentContribution is already adjusted for neutral (-15), so we add it back
      const sentimentDisplayValue = sentimentContribution; // This is already -15 adjusted
      breakdown.push({
        factor: sentimentScore < -0.3 ? "😟 Sentiment" : sentimentScore > 0.3 ? "😊 Sentiment" : "😐 Sentiment",
        value: sentimentDisplayValue,
        description: sentimentScore < -0.3 
          ? `Negative sentiment (${sentimentScore.toFixed(2)})` 
          : sentimentScore > 0.3 
            ? `Positive sentiment (${sentimentScore.toFixed(2)})`
            : "Neutral sentiment (baseline +15)",
      });
      
      // Add the neutral baseline separately so it's clear
      breakdown.push({
        factor: "📊 Baseline",
        value: 15, // Neutral sentiment baseline
        description: "Base priority score",
      });
      
      // Break down otherFactorsContribution into VIP, job title, etc.
      const emailText = `${email.subject} ${email.body}`.toLowerCase();
      const senderEmail = email.from?.toLowerCase() || "";
      const senderName = email.fromName?.toLowerCase() || "";
      
      // VIP contribution (scaled by 0.3)
      const vipContacts = contexts.filter((c) => c.contextKey === ContextKey.VIP_CONTACT);
      const matchedVip = vipContacts.find(
        (vip) =>
          senderEmail.includes(vip.contextValue.toLowerCase()) ||
          senderName.includes(vip.contextValue.toLowerCase()),
      );
      let vipTotalValue = 0;
      if (matchedVip) {
        const vipValue = Math.round(25 * 0.3); // VIP is +25, scaled by 0.3
        vipTotalValue += vipValue;
        breakdown.push({
          factor: "⭐ VIP Contact",
          value: vipValue,
          description: `From VIP: ${matchedVip.contextValue}`,
        });
        dimensions.vipContact.score = 25; // Store raw value for normalization
        dimensions.vipContact.reasons.push(`VIP contact: ${matchedVip.contextValue}`);
      }
      
      // Job title contribution (scaled by 0.3)
      if (email.senderJobTitle) {
        const jobTitleScore = this.calculateJobTitleScore(email.senderJobTitle);
        if (jobTitleScore > 0.5) {
          const jobValue = Math.round(jobTitleScore * 10 * 0.3); // jobTitleScore * 10, then scaled by 0.3
          if (jobValue > 0) {
            vipTotalValue += jobValue;
            breakdown.push({
              factor: "⭐ VIP Contact",
              value: jobValue,
              description: `Sender role: ${email.senderJobTitle}`,
            });
            dimensions.vipContact.score += Math.round(jobTitleScore * 10); // Add raw value
            dimensions.vipContact.reasons.push(`Important role: ${email.senderJobTitle}`);
          }
        }
      }
      
      // Always show VIP Contact (even if 0) so breakdown matches score
      if (vipTotalValue === 0) {
        breakdown.push({
          factor: "⭐ VIP Contact",
          value: 0,
          description: "Not a VIP contact",
        });
      }
      
      // Add remaining other factors if there's a difference
      const accountedOtherFactors = vipTotalValue;
      const remainingOtherFactors = otherFactorsContribution - accountedOtherFactors;
      if (Math.abs(remainingOtherFactors) > 0.1) {
        breakdown.push({
          factor: "📋 Other Factors",
          value: remainingOtherFactors,
          description: "Additional context and factors",
        });
      }
      
      // Always add urgency (even if 0) so breakdown matches score
      if (threadUrgencyScore > 0 && Math.abs(urgencyContribution) >= 5) {
        breakdown.push({
          factor: "🔥 Urgency",
          value: urgencyContribution,
          description: threadUrgencyExplanation || `Urgency score: ${threadUrgencyScore}/100`,
        });
        dimensions.urgency.score = threadUrgencyScore;
        if (threadUrgencyExplanation) {
          dimensions.urgency.reasons.push(threadUrgencyExplanation);
        } else {
          dimensions.urgency.reasons.push(`AI-determined urgency score: ${threadUrgencyScore}/100`);
        }
      } else if (daysSinceLastEmail !== undefined && daysSinceLastEmail > 3) {
        const daysBoost = Math.round(Math.min(15, daysSinceLastEmail * 2) * 10) / 10;
        breakdown.push({
          factor: "🔥 Urgency",
          value: daysBoost,
          description: `${daysSinceLastEmail} days since last email - needs attention`,
        });
        dimensions.urgency.score += daysBoost;
        dimensions.urgency.reasons.push(`${daysSinceLastEmail} days since last contact - may need follow-up`);
      } else {
        // Always show urgency, even if 0
        breakdown.push({
          factor: "🔥 Urgency",
          value: 0,
          description: "No urgency detected",
        });
      }
      
      // Update goal alignment dimension
      dimensions.goalAlignment.score = goalAlignmentContribution;
      if (goalAlignmentScore > 0) {
        dimensions.goalAlignment.reasons.push(`Goal alignment: ${goalAlignmentScore}%`);
      }
      
      // Calculate final score from components (matches llm-processor formula)
      const finalScore = Math.max(0, Math.min(100,
        goalAlignmentContribution +
        (sentimentContribution + 15) + // Add back neutral baseline
        otherFactorsContribution +
        urgencyContribution
      ));


      // Normalize dimension scores to 0-100 for display
      // Urgency score comes directly from thread (already 0-100), don't normalize it
      // Goal alignment is now in points (not percentage), so normalize to 0-100 for display
      // Typical max goal alignment contribution is ~40 points, so normalize: 40 points = 100%
      const maxGoalPoints = 40;
      dimensions.goalAlignment.score = Math.max(0, Math.min(100, Math.round((dimensions.goalAlignment.score / maxGoalPoints) * 100)));
      // VIP contact: binary factor, score is already in points (0 = not VIP, 25+ = VIP)
      // Normalize to 0-100: 25 points = 100%
      dimensions.vipContact.score = Math.max(0, Math.min(100, Math.round((dimensions.vipContact.score / 25) * 100)));

      const endComputation = perf.startSpan("explanation-computation", 1000);
      const explanation = {
        score: finalScore,
        dimensions,
        breakdown,
      };
      endComputation();

      // Save the explanation for future use (non-blocking)
      const endSave = perf.startSpan("save-explanation", 500);
      this.emailRepository
        .update({ id: emailId }, { priorityExplanation: explanation })
        .catch((err) =>
          this.logger.warn(
            `Failed to save priority explanation for email ${emailId}:`,
            err,
          ),
        );
      endSave();

      endTotal();
      perf.finish();
      return explanation;
    } catch (error) {
      endTotal();
      perf.finish();
      throw error;
    }
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

    return 0.5;
  }

  /**
   * Search emails using the email provider's search functionality
   */
  /**
   * Convert natural language query to Gmail search syntax using AI
   */
  /**
   * Generate query variations starting with most terms, then progressively broadening
   * Common stop words are excluded from the initial query
   */
  private generateQueryVariations(query: string): string[] {
    // Common stop words to exclude from initial query
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
      "of", "with", "by", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "should",
      "could", "may", "might", "must", "can", "this", "that", "these", "those",
      "i", "you", "he", "she", "it", "we", "they", "what", "which", "who",
      "when", "where", "why", "how", "if", "then", "than", "so", "as",
    ]);

    // Check if query already has Gmail syntax
    const gmailOperators = [
      "from:", "to:", "subject:", "has:", "before:", "after:", "is:", "in:", "label:", "-",
    ];
    const hasGmailSyntax = gmailOperators.some((op) =>
      query.toLowerCase().includes(op),
    );

    if (hasGmailSyntax) {
      // If it's already Gmail syntax, return as-is (single variation)
      return [query];
    }

    // Split into words and filter out stop words
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => w.replace(/[^\w]/g, "")) // Remove punctuation
      .filter((w) => w.length > 0);

    const importantWords = words.filter((w) => !stopWords.has(w));
    const allWords = words;

    const variations: string[] = [];

    // Variation 1: All important words (excluding stop words)
    if (importantWords.length > 0) {
      variations.push(importantWords.join(" "));
    }

    // Variation 2: All words (including stop words if they're meaningful)
    if (allWords.length > 0 && allWords.join(" ") !== variations[0]) {
      variations.push(allWords.join(" "));
    }

    // Variation 3: If we have multiple important words, try with fewer
    if (importantWords.length > 2) {
      // Try with first 2/3 of important words
      const partialWords = importantWords.slice(0, Math.ceil(importantWords.length * 0.67));
      if (partialWords.length > 0 && partialWords.join(" ") !== variations[0]) {
        variations.push(partialWords.join(" "));
      }
    }

    // Variation 4: If we still have multiple words, try just the first few
    if (importantWords.length > 1) {
      const firstFew = importantWords.slice(0, Math.min(2, importantWords.length));
      if (firstFew.length > 0 && firstFew.join(" ") !== variations[0] && firstFew.join(" ") !== variations[variations.length - 1]) {
        variations.push(firstFew.join(" "));
      }
    }

    // Variation 5: Single most important word (usually a name or key term)
    if (importantWords.length > 0) {
      const singleWord = importantWords[0];
      if (variations.every((v) => !v.includes(singleWord) || v !== singleWord)) {
        variations.push(singleWord);
      }
    }

    // Remove duplicates and empty strings
    return Array.from(new Set(variations.filter((v) => v.length > 0)));
  }

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
        .replace(/^["']|["']$/g, "") // Remove surrounding quotes
        .replace(/^Gmail search query:?\s*/i, "") // Remove prefix
        .trim();

      this.logger.debug(
        `Converted query "${query}" to Gmail syntax: "${cleaned}"`,
      );
      return cleaned || query; // Fallback to original if conversion fails
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

  async searchEmails(
    userId: string,
    query: string,
    maxResults: number = 50,
    onProgress?: (step: string, message: string) => void,
  ): Promise<
    Array<
      Email & {
        searchExplanation?: string;
        relevanceScore?: number;
        debugInfo?: any;
      }
    >
  > {
    // Use the injected EmailProviderManager
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error("No email provider connected");
    }

    const originalQuery = query;
    const queriesTried: Array<{ query: string; resultCount: number }> = [];

    // Step 1: Generate query variations and try them in order
    onProgress?.("converting", "Crafting search query for Gmail...");
    
    // Generate natural language variations first
    const naturalVariations = this.generateQueryVariations(query);
    this.logger.debug(
      `Generated ${naturalVariations.length} natural language variations: ${naturalVariations.join(", ")}`,
    );

    // Convert each variation to Gmail syntax
    const gmailQueries: string[] = [];
    for (const naturalVar of naturalVariations) {
      try {
        const gmailQuery = await this.convertQueryToGmailSearch(userId, naturalVar);
        if (gmailQuery && !gmailQueries.includes(gmailQuery)) {
          gmailQueries.push(gmailQuery);
        }
      } catch (error) {
        this.logger.warn(`Failed to convert variation "${naturalVar}"`, error);
      }
    }

    // If no variations were generated, use the original conversion
    if (gmailQueries.length === 0) {
      const gmailQuery = await this.convertQueryToGmailSearch(userId, query);
      gmailQueries.push(gmailQuery);
    }

    this.logger.debug(
      `Search: original="${originalQuery}", will try ${gmailQueries.length} Gmail queries: ${gmailQueries.join(", ")}`,
    );

    // Step 2: Try each query variation until we get results
    onProgress?.("searching", "Searching for emails in Gmail...");
    const initialMaxResults = 50;
    let rawEmails: any[] = [];
    let successfulQuery: string | null = null;

    for (let i = 0; i < gmailQueries.length; i++) {
      const gmailQuery = gmailQueries[i];
      this.logger.debug(`Trying query ${i + 1}/${gmailQueries.length}: "${gmailQuery}"`);
      
      try {
        const results = await provider.searchEmails(
          userId,
          gmailQuery,
          initialMaxResults,
        );
        
        queriesTried.push({ query: gmailQuery, resultCount: results.length });
        this.logger.debug(`Query "${gmailQuery}" returned ${results.length} results`);

        if (results.length > 0) {
          rawEmails = results;
          successfulQuery = gmailQuery;
          break; // Stop trying once we get results
        }
      } catch (error) {
        this.logger.warn(`Query "${gmailQuery}" failed:`, error);
        queriesTried.push({ query: gmailQuery, resultCount: 0 });
      }
    }

    if (rawEmails.length === 0) {
      onProgress?.("complete", "No emails found");
      // Log for debugging
      this.logger.debug(`No results found. Queries tried: ${JSON.stringify(queriesTried)}`);
      // Return a special marker object with queriesTried info for the UI
      const noResultsMarker = {
        id: "no-results",
        subject: "",
        from: "",
        body: "",
        receivedAt: new Date().toISOString(),
        debugInfo: {
          originalQuery,
          queriesTried: queriesTried.length > 0 ? queriesTried : [],
          message: "No emails found with any of the attempted queries",
        },
      };
      this.logger.debug(`Returning no-results marker: ${JSON.stringify(noResultsMarker)}`);
      return [noResultsMarker as any];
    }

    // Deduplicate by threadId immediately - keep only the most recent email per thread
    // This ensures we only score and process one email per thread
    const threadDedupMap = new Map<string, (typeof rawEmails)[0]>();
    rawEmails.forEach((email) => {
      const threadId = email.threadId;
      if (!threadId) {
        // If no threadId, keep the email (shouldn't happen, but handle it)
        threadDedupMap.set(
          email.messageId || `no-thread-${Math.random()}`,
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
    rawEmails = Array.from(threadDedupMap.values());
    this.logger.debug(
      `After initial thread deduplication: ${rawEmails.length} unique threads from ${threadDedupMap.size} emails`,
    );

    // Step 3: Filter and rank with AI
    onProgress?.(
      "filtering",
      `Filtering ${rawEmails.length} emails with AI...`,
    );

    // Score ALL raw emails first (for debug info)
    const now = new Date();
    // Find the most recent email to calculate daysSinceLastEmail
    const mostRecentDate = Math.max(
      ...rawEmails.map((e) => new Date(e.receivedAt).getTime()),
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
        snippet: email.body?.substring(0, 200) || "",
        receivedAt: email.receivedAt,
        daysAgo,
        isRecent: daysAgo <= 7,
      };
    });

    // Use AI to filter and rank results if we have multiple results
    let filteredEmails = rawEmails;
    const allScores: Map<number, number> = new Map(); // Track scores for all emails (for debug)
    const scoreBreakdowns: Map<number, {
      baseRelevanceScore: number;
      recencyAdjustment: number;
      finalScore: number;
      rejectionReason: string;
    }> = new Map(); // Track score breakdowns for all emails

    // Always score emails, even if we don't need to filter
    if (rawEmails.length > 0) {
      try {
        // Use AI to rank ALL emails by relevance to the ORIGINAL query (prioritizing newer emails) with scores
        const rankingPrompt = `You are an email search assistant. Rank these ${emailSummaries.length} emails by relevance to the search query: "${originalQuery}"

IMPORTANT CONTEXT:
- The most recent email in this set was received ${daysSinceLastEmail} days ago (daysSinceLastEmail: ${daysSinceLastEmail})
- Prioritize RECENT emails heavily - if two emails are equally relevant, the more recent one should rank much higher

CRITICAL RELEVANCE RULES:
1. If the query asks about a specific person (e.g., "Is Jay coming?"), emails MUST be from that person or mention them prominently to be relevant
2. Emails that don't mention the person at all should get a score of 0-20 (not relevant)
3. Emails from automated services (like "Fireflies.ai", "noreply", etc.) that don't mention the person should get very low scores (0-15)
4. Only emails that directly relate to the query should score above 50

CRITICAL RECENCY RULES (apply these bonuses/penalties):
- Emails from TODAY (0 days ago) should get a +30 bonus (STRONG priority for today's emails)
- Emails from the last 24 hours (0-1 days ago) should get a +25 bonus
- Emails from the last 7 days should get a +20 bonus
- Emails from 8-30 days ago should get a +5 bonus
- Emails older than 30 days should get a -20 penalty (STRONG penalty for old emails)
- Emails older than 60 days should get a -30 penalty (VERY STRONG penalty)

RELEVANCE SCORING (base score before recency adjustment):
- 100 = Perfect match, directly answers the question (e.g., email from Jay about the meeting)
- 80-99 = Very relevant, strong connection to query
- 60-79 = Moderately relevant, some connection
- 40-59 = Somewhat relevant, weak connection
- 20-39 = Barely relevant, minimal connection
- 0-19 = Not relevant at all (e.g., automated emails that don't mention the person)

Then apply the recency bonus/penalty above. Final score = base score + recency adjustment (capped at 0-100).

STRICT FILTERING: Only include emails with final score >= 40 in the top results. Emails scoring below 40 should be excluded even if they're recent.

For EACH email, return:
- baseRelevanceScore: The relevance score (0-100) before recency adjustment
- recencyAdjustment: The bonus/penalty applied based on age (+30, +25, +20, +5, -20, -30)
- finalScore: The final score after adjustment (capped at 0-100)
- rejectionReason: A brief explanation of why the email was rejected (if finalScore < 40) or why it was included (if finalScore >= 40)

Return a JSON array of objects with index, baseRelevanceScore, recencyAdjustment, finalScore, and rejectionReason for ALL ${emailSummaries.length} emails, sorted by finalScore (highest first).

Format: [{"index": 2, "baseRelevanceScore": 65, "recencyAdjustment": 30, "finalScore": 95, "rejectionReason": "Highly relevant email from today"}, {"index": 5, "baseRelevanceScore": 15, "recencyAdjustment": -30, "finalScore": 0, "rejectionReason": "Not relevant to query and very old"}, ...]

Emails:
${emailSummaries
  .map((e, i) => {
    const recencyLabel =
      e.daysAgo === 0
        ? " (TODAY!)"
        : e.daysAgo <= 1
          ? " (LAST 24 HOURS!)"
          : e.isRecent
            ? " (RECENT)"
            : "";
    return `${i}. From: ${e.from}, Subject: ${e.subject}, Received: ${e.daysAgo} days ago${recencyLabel}, Preview: ${e.snippet.substring(0, 150)}...`;
  })
  .join("\n")}

Return ONLY a JSON array of objects.`;

        const rankingResponse = await this.llmService.generateText(
          {
            prompt: rankingPrompt,
            systemPrompt:
              "You are a helpful email search assistant. Return only valid JSON arrays.",
            temperature: 0.3,
            maxTokens: 500,
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
              // Create maps for all emails (both included and rejected)
              rankedResults.forEach((item: any) => {
                if (item.index !== undefined) {
                  // Support both old format (relevanceScore) and new format (finalScore)
                  const finalScore = item.finalScore !== undefined 
                    ? item.finalScore 
                    : item.relevanceScore !== undefined 
                      ? item.relevanceScore 
                      : 0;
                  
                  allScores.set(item.index, finalScore);
                  
                  // Store score breakdown if available
                  if (item.baseRelevanceScore !== undefined || item.relevanceScore !== undefined) {
                    const baseScore = item.baseRelevanceScore !== undefined 
                      ? item.baseRelevanceScore 
                      : item.relevanceScore || 0;
                    const recencyAdj = item.recencyAdjustment !== undefined 
                      ? item.recencyAdjustment 
                      : 0;
                    const rejectionReason = item.rejectionReason || 
                      (finalScore < 40 ? `Score ${finalScore} below threshold of 40` : `Included with score ${finalScore}`);
                    
                    scoreBreakdowns.set(item.index, {
                      baseRelevanceScore: baseScore,
                      recencyAdjustment: recencyAdj,
                      finalScore: finalScore,
                      rejectionReason: rejectionReason,
                    });
                  }
                }
              });

              // Sort by final score (descending) and filter out low-scoring emails
              const sorted = rankedResults
                .filter((item: any) => {
                  const score = item.finalScore !== undefined ? item.finalScore : (item.relevanceScore || 0);
                  return score >= 40; // Only include emails with score >= 40
                })
                .sort(
                  (a: any, b: any) => {
                    const scoreA = a.finalScore !== undefined ? a.finalScore : (a.relevanceScore || 0);
                    const scoreB = b.finalScore !== undefined ? b.finalScore : (b.relevanceScore || 0);
                    return scoreB - scoreA;
                  }
                )
                .slice(0, maxResults);

              // Get emails in ranked order with scores
              const scoredEmails = sorted
                .map((item: any) => {
                  const email = rawEmails[item.index];
                  if (email) {
                    const finalScore = item.finalScore !== undefined ? item.finalScore : (item.relevanceScore || 0);
                    (email as any).relevanceScore = finalScore;
                    // Store score breakdown on email for later use
                    const breakdown = scoreBreakdowns.get(item.index);
                    if (breakdown) {
                      (email as any).scoreBreakdown = breakdown;
                    }
                  }
                  return email;
                })
                .filter(Boolean);

              // Deduplicate by threadId - keep only the highest-scoring email per thread
              const threadMap = new Map<
                string,
                (typeof rawEmails)[0] & { relevanceScore: number }
              >();
              scoredEmails.forEach((email: any) => {
                const threadId = email.threadId;
                if (!threadId) {
                  // If no threadId, use messageId as fallback (treat as unique)
                  this.logger.warn(
                    `Email ${email.messageId?.substring(0, 8)} has no threadId, using messageId for deduplication`,
                  );
                  threadMap.set(
                    email.messageId || `no-thread-${Math.random()}`,
                    email,
                  );
                  return;
                }
                const existing = threadMap.get(threadId);
                if (
                  !existing ||
                  (email.relevanceScore || 0) > (existing.relevanceScore || 0)
                ) {
                  threadMap.set(threadId, email);
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
                `AI ranking complete: ${filteredEmails.length} emails with scores. Top score: ${filteredEmails[0] ? (filteredEmails[0] as any).relevanceScore : "N/A"}`,
              );
            }
          }
        } catch (parseError) {
          this.logger.warn(
            "Failed to parse AI ranking, using first results",
            parseError,
          );
          // Deduplicate by thread even in fallback case
          const threadMap = new Map<string, (typeof rawEmails)[0]>();
          rawEmails.slice(0, maxResults * 2).forEach((email) => {
            const threadId = email.threadId;
            if (!threadId) {
              // If no threadId, use messageId as fallback
              threadMap.set(
                email.messageId || `no-thread-${Math.random()}`,
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
            `Fallback deduplication: ${filteredEmails.length} unique threads from ${rawEmails.length} emails`,
          );
        }
      } catch (error) {
        // If AI filtering fails, just take first maxResults and deduplicate by thread
        this.logger.warn("AI filtering failed, using first results", error);
        const threadMap = new Map<string, (typeof rawEmails)[0]>();
        rawEmails.slice(0, maxResults * 2).forEach((email) => {
          const threadId = email.threadId;
          if (!threadId) {
            // If no threadId, use messageId as fallback
            threadMap.set(
              email.messageId || `no-thread-${Math.random()}`,
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

    // Use batch generation with performance tracking (3 second budget for ALL explanations)
    const perf = new PerformanceTracker("search-relevance-explanations");
    const endTotal = perf.startSpan("total", 3000); // 3 second budget for all explanations

    let emailsWithExplanations: Array<{
      rawEmail: (typeof filteredEmails)[0];
      explanation: string;
    }>;

    try {
      if (filteredEmails.length === 0) {
        emailsWithExplanations = [];
      } else {
        // Prepare emails for batch processing
        const now = new Date();
        const emailsForBatch = filteredEmails.map((rawEmail, index) => {
          const receivedDate = new Date(rawEmail.receivedAt);
          const daysAgo = Math.floor(
            (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          const receivedAtText =
            daysAgo === 0
              ? "today"
              : daysAgo === 1
                ? "yesterday"
                : `${daysAgo} days ago`;
          const isRecent = daysAgo <= 7;

          return {
            index,
            from: rawEmail.fromName || rawEmail.from,
            subject: rawEmail.subject || "",
            body: rawEmail.body || "",
            receivedAt:
              typeof rawEmail.receivedAt === "string"
                ? rawEmail.receivedAt
                : rawEmail.receivedAt.toISOString(),
          };
        });

        const endBatchGeneration = perf.startSpan("batch-llm-call", 2500);

        // DEBUG: Log what we're sending to batch method
        this.logger.debug(
          `[SEARCH-EXPLANATION] Calling batch method with ${emailsForBatch.length} emails`,
        );
        this.logger.debug(`[SEARCH-EXPLANATION] Query: "${originalQuery}"`);
        this.logger.debug(
          `[SEARCH-EXPLANATION] Email indices: ${emailsForBatch.map((e) => e.index).join(", ")}`,
        );
        this.logger.debug(
          `[SEARCH-EXPLANATION] First email sample: index=${emailsForBatch[0]?.index}, from=${emailsForBatch[0]?.from?.substring(0, 30)}, subject=${emailsForBatch[0]?.subject?.substring(0, 30)}`,
        );

        // Use batch method for faster generation
        const explanationsMap =
          await this.llmService.generateSearchRelevanceExplanationsBatch(
            originalQuery,
            emailsForBatch,
            userId,
            undefined,
          );
        endBatchGeneration();

        // DEBUG: Log what we got back
        this.logger.debug(
          `[SEARCH-EXPLANATION] Batch method returned Map with ${explanationsMap.size} entries`,
        );
        this.logger.debug(
          `[SEARCH-EXPLANATION] Map keys: ${Array.from(explanationsMap.keys()).join(", ")}`,
        );
        this.logger.debug(
          `[SEARCH-EXPLANATION] Expected indices: ${emailsForBatch.map((e) => e.index).join(", ")}`,
        );

        // Check each email to see if we got an explanation
        emailsForBatch.forEach((email, idx) => {
          const hasExplanation = explanationsMap.has(email.index);
          const explanation = explanationsMap.get(email.index);
          this.logger.debug(
            `[SEARCH-EXPLANATION] Email index ${email.index}: hasExplanation=${hasExplanation}, explanation="${explanation?.substring(0, 50) || "NONE"}"`,
          );
        });

        // Map explanations back to emails
        emailsWithExplanations = filteredEmails.map((rawEmail, index) => {
          const explanation =
            explanationsMap.get(index) ||
            `Relevant to "${originalQuery}" based on sender, subject, or content.`;

          // DEBUG: Log if we're using fallback
          if (!explanationsMap.has(index)) {
            this.logger.warn(
              `[SEARCH-EXPLANATION] Using FALLBACK explanation for index ${index}. Map has keys: ${Array.from(explanationsMap.keys()).join(", ")}`,
            );
          }

          return { rawEmail, explanation };
        });

        this.logger.debug(
          `[SEARCH-EXPLANATION] Final result: ${emailsWithExplanations.length} emails with explanations`,
        );
        emailsWithExplanations.forEach((item, idx) => {
          this.logger.debug(
            `[SEARCH-EXPLANATION] Final[${idx}]: explanation="${item.explanation.substring(0, 80)}"`,
          );
        });
      }
    } catch (error) {
      this.logger.warn(
        "Batch explanation generation failed, using fallback",
        error,
      );
      // Fallback: create simple explanations
      emailsWithExplanations = filteredEmails.map((rawEmail) => {
        const from = rawEmail.fromName || rawEmail.from;
        const subject = rawEmail.subject || "";
        return {
          rawEmail,
          explanation: `From ${from}${subject ? `: ${subject.substring(0, 50)}` : ""}`,
        };
      });
    } finally {
      endTotal();
      perf.finish();
    }

    // Step 5: Save emails to database
    onProgress?.("saving", "Saving emails to database...");

    // Convert raw emails to database entities and save/fetch them
    // Process in parallel for better performance
    const emailPromises = emailsWithExplanations.map(
      async ({ rawEmail, explanation }) => {
        // Check if email already exists in DB
        let email = await this.getEmailByMessageId(userId, rawEmail.messageId);

        if (!email) {
          // Check if thread is archived by checking Gmail labels
          const isArchived = !(rawEmail.labelIds || []).includes("INBOX");
          const starCount = (rawEmail as any).starCount || 0;

          // Get or create thread with correct archived status
          const thread = await this.getOrCreateEmailThread(
            userId,
            rawEmail.threadId,
            starCount,
            isArchived,
          );

          email = this.emailRepository.create({
            userId,
            messageId: rawEmail.messageId,
            threadId: rawEmail.threadId,
            emailThreadId: thread.id,
            subject: rawEmail.subject,
            from: rawEmail.from,
            fromName: rawEmail.fromName,
            body: rawEmail.body,
            htmlBody: rawEmail.htmlBody,
            receivedAt: rawEmail.receivedAt,
            priorityScore: 50, // Default score for search results
            isRead: rawEmail.isRead || false,
            isBatched: false,
            labels: rawEmail.labelIds || [],
          });
          email = await this.emailRepository.save(email);
        } else {
          // Update thread archived status if email exists (defer to batch update)
          // We'll batch these updates at the end for better performance
        }

        // Add explanation and relevance score to email object (not stored in DB, just for this search result)
        const emailWithMetadata = email as any;
        // Always include explanation - use generated one or create a simple one
        emailWithMetadata.searchExplanation =
          explanation || `Relevant to "${originalQuery}"`;
        emailWithMetadata.relevanceScore =
          (rawEmail as any).relevanceScore ?? undefined;
        // Include score breakdown if available
        emailWithMetadata.scoreBreakdown = (rawEmail as any).scoreBreakdown ?? undefined;
        emailWithMetadata._needsThreadUpdate = email.emailThreadId
          ? {
              threadId: email.threadId,
              isArchived: !(rawEmail.labelIds || []).includes("INBOX"),
            }
          : null;

        return emailWithMetadata;
      },
    );

    const emails = await Promise.all(emailPromises);

    // Batch update thread archived statuses (more efficient than individual updates)
    const threadUpdates = emails
      .filter((e) => e._needsThreadUpdate)
      .map((e) => {
        const update = e._needsThreadUpdate;
        delete e._needsThreadUpdate; // Clean up temporary property
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

    // Identify rejected emails (those with scores < 40 or not in filteredEmails)
    const rejectedEmails = rawEmails
      .map((rawEmail, index) => {
        const score = allScores.get(index);
        const breakdown = scoreBreakdowns.get(index);
        const isIncluded = filteredEmails.some(
          (fe) => fe.threadId === rawEmail.threadId || fe.messageId === rawEmail.messageId
        );
        
        if (isIncluded || (score !== undefined && score >= 40)) {
          return null; // Not rejected
        }
        
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
          aiScore: score ?? null,
          scoreBreakdown: breakdown || null,
          rejectionReason: breakdown?.rejectionReason || 
            (score !== undefined ? `Score ${score} below threshold of 40` : 'Not scored'),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // Build debug info with all raw emails and their scores
    const debugInfo = {
      originalQuery,
      gmailQuery: successfulQuery || gmailQueries[0] || query,
      queriesTried,
      totalRawEmails: rawEmails.length,
      maxResultsRequested: maxResults,
      filteredCount: filteredEmails.length,
      rejectedCount: rejectedEmails.length,
      allRawEmails: rawEmails.map((rawEmail, index) => {
        const receivedDate = new Date(rawEmail.receivedAt);
        const daysAgo = Math.floor(
          (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        const breakdown = scoreBreakdowns.get(index);
        return {
          index,
          from: rawEmail.fromName || rawEmail.from,
          subject: rawEmail.subject,
          receivedAt: rawEmail.receivedAt,
          daysAgo,
          aiScore: allScores.get(index) ?? null,
          scoreBreakdown: breakdown || null,
          includedInResults: filteredEmails.some(
            (fe) => fe.threadId === rawEmail.threadId || fe.messageId === rawEmail.messageId
          ),
        };
      }),
      rejectedEmails,
    };

    // Sort results by relevance score (highest first) before returning
    emails.sort((a, b) => {
      const scoreA = (a as any).relevanceScore ?? 0;
      const scoreB = (b as any).relevanceScore ?? 0;
      return scoreB - scoreA; // Descending order
    });

    // Return emails with metadata (explanations and relevance scores)
    // Convert to plain objects to ensure custom properties are serialized
    const result = emails.map((email) => {
      const plain: any = { ...email };
      // Explicitly include searchExplanation, relevanceScore, and debugInfo
      // Use Object.assign to ensure properties are copied
      plain.searchExplanation = (email as any).searchExplanation;
      plain.relevanceScore = (email as any).relevanceScore;
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
        debugInfo?: any;
      }
    >;
  }

  /**
   * Debug endpoint to find missing starred threads
   * Compares Gmail starred emails with what's in our DB
   */
  /**
   * Get the last sync time for a user by querying pg-boss for the last completed sync-emails job
   * Checks both the active job table and the archive table (completed jobs may be archived after 1 hour)
   */
  async getLastSyncTime(userId: string): Promise<Date | null> {
    try {
      // Query pg-boss for the last completed sync-emails job for this user
      // Check archive table first (completed jobs are archived after 1 hour), then active jobs
      // Use a simpler query structure without nested subqueries
      const result = await (this.boss as any).db.executeSql(
        `SELECT completedon 
         FROM (
           SELECT completedon 
           FROM pgboss.archive 
           WHERE name = 'sync-emails' 
           AND state = 'completed' 
           AND data->>'userId' = $1
           UNION ALL
           SELECT completedon 
           FROM pgboss.job 
           WHERE name = 'sync-emails' 
           AND state = 'completed' 
           AND data->>'userId' = $1
         ) AS all_syncs
         ORDER BY completedon DESC 
         LIMIT 1`,
        [userId],
      );

      if (result && result.rows && result.rows.length > 0 && result.rows[0].completedon) {
        return new Date(result.rows[0].completedon);
      }
      return null;
    } catch (error) {
      this.logger.warn(`Failed to get last sync time for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get sync status including last sync time and next batch delivery time
   */
  async getSyncStatus(userId: string): Promise<{
    lastSyncTime: string | null;
    nextBatchDeliveryTime: string | null;
    deliverySchedule: {
      deliveryDays: number[];
      deliveryTimes: string[];
      timezone: string;
    } | null;
  }> {
    const lastSyncTime = await this.getLastSyncTime(userId);
    
    // Get batch schedule to determine next delivery time
    const schedule = await this.batchScheduleService.getSchedule(userId);
    let nextBatchDeliveryTime: Date | null = null;
    let deliverySchedule: {
      deliveryDays: number[];
      deliveryTimes: string[];
      timezone: string;
    } | null = null;

    if (schedule) {
      // Get next batch release time (for a non-urgent email)
      nextBatchDeliveryTime = this.batchScheduleService.getNextBatchReleaseTime(
        schedule,
        0, // Use 0 urgency to get normal schedule time
      );
      deliverySchedule = {
        deliveryDays: schedule.deliveryDays,
        deliveryTimes: schedule.deliveryTimes,
        timezone: schedule.timezone,
      };
    } else {
      // Use default schedule if user doesn't have one
      const defaultSchedule = this.batchScheduleService.getDefaultSchedule();
      const tempSchedule = {
        ...defaultSchedule,
        userId,
        id: "temp",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;
      nextBatchDeliveryTime = this.batchScheduleService.getNextBatchReleaseTime(
        tempSchedule,
        0,
      );
      deliverySchedule = {
        deliveryDays: defaultSchedule.deliveryDays || [],
        deliveryTimes: defaultSchedule.deliveryTimes || [],
        timezone: defaultSchedule.timezone || "UTC",
      };
    }

    return {
      lastSyncTime: lastSyncTime ? lastSyncTime.toISOString() : null,
      nextBatchDeliveryTime: nextBatchDeliveryTime
        ? nextBatchDeliveryTime.toISOString()
        : null,
      deliverySchedule,
    };
  }

  async debugStarredThreads(userId: string): Promise<{
    lastSyncTime: string | null;
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
      lastCheckedAt: string | null;
    }>;
    missingFromProcessTab: Array<{
      threadId: string;
      reason: string;
      details: any;
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
    } catch (error) {
      gmailError = error.message || "Failed to search Gmail";
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
          threadId: `${thread.threadId.substring(0, 12)}...`,
          starCount: thread.starCount,
          isArchived: thread.isArchived,
          isSnoozed: allSnoozed,
          emailCount: threadEmails.length,
          latestSubject: latestEmail?.subject?.substring(0, 50) || "N/A",
          latestFrom: latestEmail?.fromName || latestEmail?.from || "N/A",
          issues,
          inGmail,
          lastCheckedAt: thread.lastCheckedAt ? thread.lastCheckedAt.toISOString() : null,
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

    // 8. Get last sync time
    const lastSyncTime = await this.getLastSyncTime(userId);

    return {
      lastSyncTime: lastSyncTime ? lastSyncTime.toISOString() : null,
      gmail: {
        starredThreadCount: gmailStarredThreadIds.length,
        starredThreadIds: gmailStarredThreadIds.map(
          (id) => `${id.substring(0, 12)}...`,
        ),
        error: gmailError,
      },
      database: {
        starredThreadCount: allStarredThreads.length,
        starredEmailCount: emailsInStarredThreads.length,
      },
      actionTabResults: actionTabEmails.length,
      comparison: {
        inGmailNotInDb: inGmailNotInDb.map((id) => `${id.substring(0, 12)}...`),
        inDbNotInGmail: inDbNotInGmail.map((id) => `${id.substring(0, 12)}...`),
        inDbButArchived: inDbButArchived.map(
          (id) => `${id.substring(0, 12)}...`,
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
      take: 50, // Limit to 50 for performance
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
        id: `${t.id.substring(0, 12)}...`,
        threadId: `${t.threadId.substring(0, 12)}...`,
        starCount: t.starCount,
        isArchived: t.isArchived,
      }));

    return {
      totalEmailsInDb,
      emailsWithThreadId,
      orphanEmails: totalEmailsInDb - emailsWithThreadId,
      orphanEmailDetails: orphanEmailsList.map((e) => ({
        id: `${e.id.substring(0, 12)}...`,
        threadId: `${e.threadId?.substring(0, 12)}...` || "N/A",
        emailThreadId: `${e.emailThreadId?.substring(0, 12)}...` || null,
        subject: e.subject?.substring(0, 50) || "N/A",
        from: e.from?.substring(0, 30) || "N/A",
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
        const errorMsg = `Failed to fix email ${email.id}: ${err.message}`;
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

    // Find emails that have been in "calculating" state for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const stuckEmails = await this.emailRepository.find({
      where: {
        userId,
        isProcessingPriority: true,
      },
      select: ["id", "receivedAt", "priorityScore"],
    });

    // Filter to only those that are actually stuck (older than 10 minutes or have default score)
    const actuallyStuck = stuckEmails.filter((email) => {
      const emailAge = Date.now() - new Date(email.receivedAt).getTime();
      return emailAge > 10 * 60 * 1000 || email.priorityScore === 50;
    });

    this.logger.log(
      `Found ${actuallyStuck.length} stuck calculating threads (out of ${stuckEmails.length} total)`,
    );

    let fixed = 0;
    let requeued = 0;
    const errors: string[] = [];

    for (const email of actuallyStuck) {
      try {
        // Check if there's an active job for this email
        // PgBoss doesn't have a direct API to check by data, so we'll just re-queue
        // The singleton key will prevent duplicates if a job already exists

        // Reset the flag first
        await this.emailRepository.update(
          { id: email.id },
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
              `Failed to re-queue priority job for email ${email.id}:`,
              err,
            );
            return null;
          });

        if (jobId) {
          requeued++;
          this.logger.debug(
            `Re-queued priority job ${jobId} for stuck email ${email.id}`,
          );
        } else {
          fixed++; // Just reset the flag, couldn't queue
        }
      } catch (err: any) {
        const errorMsg = `Failed to fix stuck email ${email.id}: ${err.message}`;
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
      return; // GitHub module not available
    }

    try {
      // Check if user has GitHub token
      const user = await this.usersService.findOne(userId);
      if (!user || !user.githubToken) {
        return; // No GitHub token configured
      }

      // Parse GitHub links from email body
      const links = this.githubService.parseGitHubLinks(
        email.body || "",
        email.htmlBody || undefined,
      );

      if (links.length === 0) {
        return; // No GitHub links found
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

      // Update thread with GitHub metadata (not email)
      if (email.emailThreadId) {
        const thread = await this.emailThreadRepository.findOne({
          where: { id: email.emailThreadId, userId: email.userId },
        });
        if (thread) {
          thread.githubMetadata = {
            links: metadataLinks,
          };
          await this.emailThreadRepository.save(thread);
          this.logger.debug(
            `Updated GitHub metadata for thread ${thread.id} with ${metadataLinks.length} links`,
          );
        }
      }
    } catch (error: any) {
      // Log but don't throw - this is a background operation
      this.logger.warn(
        `Failed to detect/fetch GitHub links for email ${email.id}: ${error.message}`,
      );
    }
  }
}
