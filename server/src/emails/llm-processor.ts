import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import * as os from "os";
import PgBoss = require("pg-boss");
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailsService } from "./emails.service";
import { PriorityService } from "../priority/priority.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { SummarizationService } from "../summarization/summarization.service";
import { PriorityAnalysisService } from "../llm/priority-analysis.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { ContextKey } from "../database/entities/user-context.entity";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";

// Constants for LLM processing
const LLM_PROCESSOR_CONSTANTS = {
  EMAIL_HISTORY_LIMIT: 10, // Reduced from 50 to 10 for performance (now using cache)
  SUBSTRING_PREVIEW_LENGTH: 8,
  SUBJECT_PREVIEW_LENGTH: 50,
  BATCH_SIZE: 8,
  SENTIMENT_MULTIPLIER: 30,
  URGENCY_NEUTRAL: 50,
  URGENCY_MULTIPLIER: 0.5, // Max urgency contribution: (100 - 50) * 0.5 = 25
  GOAL_ALIGNMENT_WEIGHT: 0.4,
  OTHER_FACTORS_WEIGHT: 0.3,
  MAX_SCORE: 100,
  THREAD_EMAILS_LIMIT: 15, // Fetch last 15 emails for thread context in priority calculation
} as const;

@Injectable()
export class LLMProcessor implements OnModuleInit {
  private readonly logger = new Logger(LLMProcessor.name);
  private readonly priorityConcurrency: number;
  private readonly summaryConcurrency: number;

  // eslint-disable-next-line max-params
  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    private emailsService: EmailsService,
    private priorityService: PriorityService,
    private priorityCacheService: PriorityCacheService,
    private summarizationService: SummarizationService,
    private priorityAnalysisService: PriorityAnalysisService,
    private configService: ConfigService,
  ) {
    // Get CPU cores for optimal concurrency
    const cpuCores = os.cpus().length;
    // For LLM jobs (I/O bound), we can use more workers than CPU cores
    // Default to 2x CPU cores, but allow override via env vars
    const defaultConcurrency = Math.max(4, cpuCores * 2);

    this.priorityConcurrency = parseInt(
      this.configService.get<string>("LLM_PRIORITY_CONCURRENCY") ||
        String(defaultConcurrency),
      10,
    );
    this.summaryConcurrency = parseInt(
      this.configService.get<string>("LLM_SUMMARY_CONCURRENCY") ||
        String(defaultConcurrency),
      10,
    );

    this.logger.log(
      `CPU cores: ${cpuCores}, LLM worker concurrency: priority=${this.priorityConcurrency}, summary=${this.summaryConcurrency}`,
    );
  }

  // eslint-disable-next-line max-lines-per-function
  async onModuleInit() {
    // Worker for LLM priority refinement - process multiple jobs in parallel
    // teamSize determines how many concurrent workers process jobs from this queue
    this.logger.log(
      `Starting priority refinement worker with concurrency: ${this.priorityConcurrency}`,
    );
    await this.boss.work(
      "refine-priority",
      { teamSize: this.priorityConcurrency },
      // eslint-disable-next-line max-lines-per-function, max-statements, complexity
      async (job) => {
        const { userId, emailId } = job.data as {
          userId: string;
          emailId: string;
        };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker("refine-priority", workerId);
        tracker.setMetadata({ userId, emailId });

        this.logger.log(
          `[Worker ${workerId}] Starting LLM priority refinement for email ${emailId}`,
        );

        try {
          tracker.startPhase("dataFetch");
          const email = await this.emailsService.getEmailById(userId, emailId);
          if (!email) {
            this.logger.warn(`Email ${emailId} not found`);
            return;
          }

          // Get the thread to check for existing priority explanation
          let thread = null;
          if (email.emailThreadId) {
            thread = await this.emailThreadRepository.findOne({
              where: { id: email.emailThreadId },
            });
          }

          // Skip if priority explanation already exists with new structure and is not processing
          // Check if it's the old structure (has "Base Score" or "AI Analysis") - if so, recalculate
          // Also recalculate if breakdown is empty or all values are 0 (incomplete calculation)
          const threadPriorityExplanation = thread?.priorityExplanation;
          const hasOldStructure =
            threadPriorityExplanation?.breakdown?.some(
              (item) =>
                item.factor === "Base Score" ||
                item.factor === "🤖 AI Analysis" ||
                item.factor === "AI Analysis",
            ) ?? false;

          const existingBreakdown = threadPriorityExplanation?.breakdown || [];
          const hasValidBreakdown =
            existingBreakdown.length > 0 &&
            existingBreakdown.some(
              (item) => item.value !== 0 && item.value !== undefined,
            );

          // Check if breakdown has "Calculating..." items (incomplete calculation)
          const hasCalculatingItems = existingBreakdown.some(
            (item) =>
              item.description === "Calculating..." ||
              item.description?.includes("Calculating..."),
          );

          // Check if thread has new emails since last calculation
          // Improved detection: query the most recent email in the thread and compare with current email
          let hasNewEmails = false;
          if (thread && email.receivedAt && email.emailThreadId) {
            // Query the most recent email in the thread by receivedAt
            const mostRecentEmail = await this.emailRepository.findOne({
              where: { emailThreadId: email.emailThreadId },
              order: { receivedAt: "DESC" },
              select: ["id", "receivedAt"],
            });

            if (mostRecentEmail) {
              // Get the timestamp when priority was last calculated (if available)
              const priorityCalculatedAt =
                threadPriorityExplanation?.calculatedAt
                  ? new Date(threadPriorityExplanation.calculatedAt)
                  : null;

              // Use calculatedAt if available, otherwise fall back to thread.updatedAt
              const lastCalculationTime =
                priorityCalculatedAt || thread.updatedAt || thread.createdAt;

              // Check if the current email being processed is the most recent email in the thread
              // This indicates a new email arrived that should trigger recalculation
              if (mostRecentEmail.id === email.id) {
                // Current email is the most recent - check if it's newer than when priority was last calculated
                if (email.receivedAt > lastCalculationTime) {
                  hasNewEmails = true;
                }
              } else if (mostRecentEmail.receivedAt) {
                // There's a more recent email than the one being processed
                // Check if the most recent email is newer than when priority was last calculated
                if (mostRecentEmail.receivedAt > lastCalculationTime) {
                  hasNewEmails = true;
                }
              }
            }
          }

          if (
            threadPriorityExplanation?.breakdown &&
            existingBreakdown.length > 0 &&
            hasValidBreakdown &&
            !hasCalculatingItems &&
            !thread?.isProcessingPriority &&
            !hasOldStructure &&
            !hasNewEmails
          ) {
            const existingScore = existingBreakdown.reduce(
              (sum, item) => sum + (item.value || 0),
              0,
            );
            this.logger.log(
              `[Worker ${workerId}] Skipping priority refinement for email ${emailId} (thread: ${email.threadId?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}...) - already has priority breakdown with score: ${existingScore}`,
            );
            return;
          }

          if (hasNewEmails) {
            this.logger.log(
              `[Worker ${workerId}] Forcing priority recalculation for thread ${email.emailThreadId} due to new emails`,
            );
          }

          if (hasOldStructure || !hasValidBreakdown || hasCalculatingItems) {
            const reason = hasOldStructure
              ? "old"
              : hasCalculatingItems
                ? "calculating items"
                : "incomplete";
            this.logger.log(
              `[Worker ${workerId}] Detected ${reason} priority structure for thread ${email.emailThreadId}, recalculating with new format`,
            );
          }

          // Mark thread as processing priority
          if (email.emailThreadId && thread) {
            await this.emailThreadRepository.update(
              { id: email.emailThreadId },
              { isProcessingPriority: true },
            );
          }

          // OPTIMIZED: Use cache service and limit data fetching
          // Fetch user contexts and avgTimeToReply from cache (much faster)
          // Fetch last 15 thread emails for context (chronological order for LLM)
          const [contexts, avgTimeToReply, threadEmails] = await Promise.all([
            // Fetch user contexts from cache (TTL: 5 minutes)
            this.priorityCacheService.getUserContexts(userId),
            // Fetch avgTimeToReply from cache (TTL: 1 hour, uses last 10 emails)
            this.priorityCacheService.getAvgTimeToReply(userId),
            // Fetch last 15 thread emails (ASC order for chronological context in LLM)
            email.threadId
              ? this.emailsService.getThreadEmails(userId, email.threadId, {
                  limit: LLM_PROCESSOR_CONSTANTS.THREAD_EMAILS_LIMIT,
                  order: "ASC",
                })
              : Promise.resolve([]),
          ]);
          tracker.endPhase("dataFetch");
          tracker.startPhase("processing");

          // Calculate basic score (synchronous, fast) - for other factors like VIP
          // Note: basicScore is used for VIP contact matching below
          this.priorityService.calculateBasicPriorityScore(email, contexts);

          // Determine if user should reply and days since last reply
          // threadEmails are in ASC order (oldest first) for chronological context
          let userShouldReply = false;
          let daysSinceLastReply: number | undefined;
          let lastReplyFrom: string | undefined;
          if (threadEmails.length > 0 && email.receivedAt) {
            // Last email is the most recent (ASC order)
            const lastEmail = threadEmails[threadEmails.length - 1];
            // Check if last email is from the same sender as current email
            if (
              lastEmail.from &&
              email.from &&
              lastEmail.from.toLowerCase() === email.from.toLowerCase()
            ) {
              userShouldReply = true;
              // Find user's last email in thread (if any) - search backwards from end
              const userLastEmail = [...threadEmails]
                .reverse()
                .find(
                  (e) =>
                    e.from && e.from.toLowerCase() !== email.from.toLowerCase(),
                );
              if (userLastEmail && userLastEmail.receivedAt) {
                const daysDiff =
                  (email.receivedAt.getTime() -
                    userLastEmail.receivedAt.getTime()) /
                  (1000 * 60 * 60 * 24);
                daysSinceLastReply = Math.max(
                  0,
                  Math.round(daysDiff * 10) / 10,
                );
                lastReplyFrom = userLastEmail.from || undefined;
              }
            }
          }

          // Format user context for LLM
          const userContext = {
            urgentItems: contexts
              .filter((c) => c.contextKey === ContextKey.URGENT)
              .map((c) => ({
                value: c.contextValue,
                explanation: c.explanation || undefined,
              })),
            notUrgentItems: contexts
              .filter((c) => c.contextKey === ContextKey.NOT_IMPORTANT)
              .map((c) => ({
                value: c.contextValue,
                explanation: c.explanation || undefined,
              })),
            goals: contexts
              .filter((c) => c.contextKey === ContextKey.MY_GOALS)
              .map((c) => ({
                value: c.contextValue,
                priority: c.priority || undefined,
              })),
            workingOn: contexts
              .filter((c) => c.contextKey === ContextKey.WORKING_ON)
              .map((c) => ({
                value: c.contextValue,
                priority: c.priority || undefined,
              })),
            dontCare: contexts
              .filter((c) => c.contextKey === ContextKey.DONT_CARE)
              .map((c) => ({ value: c.contextValue })),
          };

          this.logger.log(
            `[Worker ${workerId}] Analyzing priority for email ${emailId} (thread: ${email.threadId?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}..., subject: ${email.subject?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBJECT_PREVIEW_LENGTH)}...)`,
          );

          // Clean email body: strip HTML, remove signatures, limit to 1000 chars
          const cleanedBody = cleanEmailContent(
            email.body,
            email.htmlBody,
            1000,
          );

          tracker.endPhase("processing");
          tracker.startPhase("llmCall");

          // Format thread emails for LLM (exclude current email, already in chronological order)
          const threadEmailsForLLM = threadEmails
            .filter((e) => e.id !== email.id) // Exclude current email
            .map((e) => ({
              from: e.from || "",
              fromName: e.fromName,
              subject: e.subject || "",
              body: e.body || "",
              receivedAt: e.receivedAt || new Date(),
            }));

          // LLM call - analyze priority (includes sentiment, urgency, and goal alignment analysis)
          // The teamSize concurrency setting allows multiple workers to process different emails in parallel
          const llmResult = await this.priorityAnalysisService.analyzePriority(
            {
              from: email.from || "",
              fromName: email.fromName,
              senderJobTitle: email.senderJobTitle,
              subject: email.subject || "",
              body: cleanedBody,
            },
            {
              averageTimeToReply: avgTimeToReply,
            },
            undefined,
            // provider - use default
            userId,
            // pass userId to use user's API key if available
            userContext,
            {
              daysSinceLastReply,
              userShouldReply,
              lastReplyFrom,
            },
            threadEmailsForLLM.length > 0 ? threadEmailsForLLM : undefined,
          );

          // Get goal alignment score from LLM (replaces keyword matching)
          const goalAlignmentScore = llmResult.goalAlignmentScore || 0;

          // Get sentiment score from LLM (required, no fallback to old score)
          const sentimentScore = llmResult.sentimentScore ?? 0;
          // Only contribute if sentiment is clearly negative (< -0.3)
          // Positive sentiment should contribute 0 (not negative) - positive emails don't need urgent attention
          // Neutral sentiment (between -0.3 and 0.3) always contributes 0
          let sentimentContribution = 0;
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          if (sentimentScore < -0.3) {
            // Negative/upset sentiment: increase priority
            // Map -1 to contribution: -1 (very negative) = +30 contribution
            sentimentContribution = Math.round(
              -sentimentScore * LLM_PROCESSOR_CONSTANTS.SENTIMENT_MULTIPLIER,
            );
          }
          // Positive sentiment (> 0.3): contribute 0 (don't penalize positive emails)
          // Neutral sentiment (between -0.3 and 0.3): contribute 0

          // Get urgency score from LLM (replaces keyword matching)
          const urgencyScore = llmResult.urgencyScore || 0;
          // Convert urgency (0-100) to contribution: urgency of 50 is neutral (0 contribution)
          // Use a less harsh formula for low urgency: meetings a few days away should be -5, not -15
          // Formula: (urgencyScore - 50) * 0.17 gives -5 for urgency 20 (a few days away)
          // This makes low urgency less negative while keeping high urgency impactful
          const urgencyContribution = Math.round(
            (urgencyScore - LLM_PROCESSOR_CONSTANTS.URGENCY_NEUTRAL) * 0.17,
          );

          // Calculate total score from components:
          // - Goal alignment: 40% weight (from LLM)
          // - Sentiment: direct contribution (neutral = 0)
          // - Other factors (VIP, job title, etc.): 30% weight
          // - Urgency: additional contribution on top (from LLM)
          const goalAlignmentContribution = Math.round(
            goalAlignmentScore * LLM_PROCESSOR_CONSTANTS.GOAL_ALIGNMENT_WEIGHT,
          );

          // Build breakdown from LLM results and other factors
          const breakdown: Array<{
            factor: string;
            value: number;
            description: string;
          }> = [];

          // Urgency from LLM (replaces keyword matching) - always show
          breakdown.push({
            factor: "🔥 Urgency",
            value: urgencyContribution,
            description: llmResult.urgencyExplanation || "Urgency analysis",
          });

          // Goal Alignment from LLM (replaces keyword matching) - always show
          breakdown.push({
            factor: "🎯 Goal Alignment",
            value: goalAlignmentContribution,
            description:
              llmResult.goalAlignmentExplanation || "Goal alignment analysis",
          });

          // Sentiment from LLM - always show
          let sentimentDescription = "Neutral sentiment";
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          if (sentimentScore < -0.3) {
            sentimentDescription = `Negative sentiment (${sentimentScore.toFixed(2)})`;
            // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          } else if (sentimentScore > 0.3) {
            sentimentDescription = `Positive sentiment (${sentimentScore.toFixed(2)})`;
          }
          breakdown.push({
            factor: "😊 Sentiment",
            value: sentimentContribution,
            description: sentimentDescription,
          });

          // Other factors (VIP, job title, etc.) - from basic score calculation
          // Extract VIP and other factors from basic score
          const vipContacts = contexts.filter(
            (c) => c.contextKey === ContextKey.VIP_CONTACT,
          );
          const matchedVip = vipContacts.find(
            (vip) =>
              email.from
                ?.toLowerCase()
                .includes(vip.contextValue.toLowerCase()) ||
              email.fromName
                ?.toLowerCase()
                .includes(vip.contextValue.toLowerCase()),
          );
          if (matchedVip) {
            const vipBoost = 25; // PRIORITY_BOOSTS.URGENT_KEYWORD
            breakdown.push({
              factor: "⭐ VIP Contact",
              value: vipBoost,
              description: `From VIP: ${matchedVip.contextValue}`,
            });
          }

          // Job title boost
          if (email.senderJobTitle) {
            // Simple job title scoring (can be enhanced)
            const jobTitleLower = email.senderJobTitle.toLowerCase();
            const highPriorityTitles = [
              "ceo",
              "president",
              "director",
              "manager",
              "lead",
              "head",
            ];
            const hasHighPriorityTitle = highPriorityTitles.some((title) =>
              jobTitleLower.includes(title),
            );
            if (hasHighPriorityTitle) {
              const titleBoost = 15; // PRIORITY_BOOSTS.GOAL_ALIGNMENT
              breakdown.push({
                factor: "⭐ VIP Contact",
                value: titleBoost,
                description: `Sender role: ${email.senderJobTitle}`,
              });
            }
          }

          // Calculate final score from breakdown
          // Don't clamp to 0-100 - allow negative scores as breakdown can legitimately be negative
          // The breakdown items can have negative values (e.g., low urgency = -12)
          const finalScore = breakdown.reduce(
            (sum, item) => sum + (item.value || 0),
            0,
          );

          // Build dimensions for compatibility
          const dimensions = {
            urgency: {
              score: urgencyScore,
              reasons: [
                llmResult.urgencyExplanation || "No urgency explanation",
              ],
            },
            goalAlignment: {
              score: goalAlignmentScore,
              reasons: [
                llmResult.goalAlignmentExplanation ||
                  "No goal alignment explanation",
              ],
            },
            vipContact: {
              score: matchedVip ? 25 : 0,
              reasons: matchedVip
                ? [`VIP contact: ${matchedVip.contextValue}`]
                : [],
            },
            sentiment: {
              score: sentimentScore,
              type:
                // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                sentimentScore < -0.3
                  ? "negative"
                  : // eslint-disable-next-line @typescript-eslint/no-magic-numbers
                    sentimentScore > 0.3
                    ? "positive"
                    : "neutral",
              reasons: [],
            },
          };

          tracker.endPhase("llmCall");
          tracker.startPhase("dbUpdate");

          // Build priority explanation with timestamp
          const priorityExplanation = {
            score: finalScore,
            breakdown,
            dimensions,
            calculatedAt: new Date().toISOString(), // Track when priority was calculated
          };

          // Update email with sentiment (priority explanation is now thread-level)
          await this.emailRepository.update(
            { id: emailId },
            {
              sentimentScore:
                llmResult.sentimentScore !== undefined
                  ? llmResult.sentimentScore
                  : null,
              // Store sentiment score (-1 to 1) from priority analysis
            },
          );

          // Update EmailThread with priority explanation, urgency score, and explanation
          // Priority is thread-level, so store it on the thread
          if (email.emailThreadId) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const threadEmails = await this.emailRepository.find({
              where: { emailThreadId: email.emailThreadId },
              select: ["id"],
            });

            // Get all urgency scores from LLM results for this thread (we'll use current email's score for now)
            // In a more sophisticated implementation, we could track all emails' urgency scores
            const thread = await this.emailThreadRepository.findOne({
              where: { id: email.emailThreadId },
            });

            if (thread) {
              // Use the maximum urgency score between existing thread score and new email's score
              const newUrgencyScore = Math.max(
                thread.urgencyScore || 0,
                llmResult.urgencyScore || 0,
              );

              // Update urgency explanation if this email has a higher urgency score
              const newUrgencyExplanation =
                (llmResult.urgencyScore || 0) > (thread.urgencyScore || 0)
                  ? llmResult.urgencyExplanation
                  : thread.urgencyExplanation;

              // Calculate priorityScore from breakdown for efficient SQL sorting
              const priorityScore = priorityExplanation?.breakdown
                ? priorityExplanation.breakdown.reduce(
                    (sum, item) => sum + (item.value || 0),
                    0,
                  )
                : finalScore;

              await this.emailThreadRepository.update(
                { id: email.emailThreadId },
                {
                  urgencyScore: newUrgencyScore,
                  urgencyExplanation:
                    newUrgencyExplanation || thread.urgencyExplanation,
                  priorityExplanation, // Store priority explanation on thread
                  priorityScore, // Store denormalized score for efficient sorting
                  isProcessingPriority: false,
                },
              );

              // If priority score > 50, un-batch the email (high priority emails shouldn't be batched)
              // Priority score > 50 indicates important emails that should be shown immediately
              if (finalScore > 50) {
                await this.emailRepository.update(
                  { emailThreadId: email.emailThreadId, userId },
                  {
                    isBatched: false,
                    batchReleaseAt: null,
                    wasDeliveredEarly: true,
                  },
                );
                this.logger.log(
                  `[Worker ${workerId}] Emergency delivery: Un-batched email ${emailId} due to high priority score: ${finalScore}`,
                );
              }

              this.logger.log(
                `[Worker ${workerId}] Updated thread ${email.emailThreadId.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}... urgencyScore: ${newUrgencyScore}, priorityScore: ${finalScore}`,
              );
            }
          }

          tracker.endPhase("dbUpdate");

          this.logger.log(
            `[Worker ${workerId}] Refined priority for email ${emailId} (thread: ${email.threadId?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}...): ${finalScore}`,
          );
          tracker.finish();
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to refine priority for email ${emailId}`,
            error,
          );
          // Mark thread as not processing so it can be retried
          const email = await this.emailsService.getEmailById(userId, emailId);
          if (email?.emailThreadId) {
            await this.emailThreadRepository.update(
              { id: email.emailThreadId },
              { isProcessingPriority: false },
            );
          }
          tracker.finish(error as Error);
          throw error;
        }
      },
    );

    // Worker for summary generation - process multiple jobs in parallel
    this.logger.log(
      `Starting summary generation worker with concurrency: ${this.summaryConcurrency}`,
    );
    await this.boss.work(
      "generate-summary",
      { teamSize: this.summaryConcurrency },
      async (job) => {
        const { userId, emailId } = job.data as {
          userId: string;
          emailId: string;
        };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker("generate-summary", workerId);
        tracker.setMetadata({ userId, emailId });

        this.logger.log(
          `[Worker ${workerId}] Starting summary generation for email ${emailId}`,
        );

        try {
          tracker.startPhase("dataFetch");
          const email = await this.emailsService.getEmailById(userId, emailId);
          if (!email) {
            this.logger.warn(
              `Email ${emailId} not found for summary generation`,
            );
            return;
          }

          // Skip if summary already exists
          if (
            email.summary &&
            email.summary.trim() !== "" &&
            !email.isProcessingSummary
          ) {
            this.logger.log(
              `[Worker ${workerId}] Skipping summary generation for email ${emailId} (thread: ${email.threadId?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}...) - already has summary`,
            );
            return;
          }

          this.logger.log(
            `[Worker ${workerId}] Generating thread summary for email ${emailId} (thread: ${email.threadId?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}..., subject: ${email.subject?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBJECT_PREVIEW_LENGTH)}...)`,
          );

          tracker.endPhase("dataFetch");
          tracker.startPhase("llmCall");

          // Generate thread summary (uses last 3 messages)
          const summary = await this.summarizationService.summarizeEmail(
            userId,
            emailId,
            { type: "tldr" },
          );

          tracker.endPhase("llmCall");
          tracker.startPhase("dbUpdate");

          // Update all emails in the thread with the same summary (thread-level summary)
          // Limit to 50 emails per thread to avoid fetching too many for very long threads
          const threadEmails = await this.emailsService.getThreadEmails(
            userId,
            email.threadId,
            { limit: 50 }, // Reasonable limit for thread updates
          );
          const emailIds = threadEmails.map((e) => e.id);

          await this.emailRepository.update(
            { id: In(emailIds) },
            // Update all emails in thread
            {
              summary,
              isProcessingSummary: false,
            },
          );

          tracker.endPhase("dbUpdate");

          this.logger.log(
            `[Worker ${workerId}] Generated thread summary for thread ${email.threadId?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}... (${threadEmails.length} emails updated)`,
          );
          tracker.finish();
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to generate summary for email ${emailId}`,
            error,
          );
          // Mark as not processing
          await this.emailRepository.update(
            { id: emailId },
            { isProcessingSummary: false },
          );
          tracker.finish(error as Error);
          throw error;
        }
      },
    );
  }
}
