import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, Not, IsNull } from "typeorm";
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
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { CloudWatchService } from "../aws/cloudwatch.service";
import {
  SENTIMENT_THRESHOLDS,
  PRIORITY_SCORES,
  NEWSLETTER_DISCOUNT,
} from "../constants/priority-constants";
import {
  EMAIL_CLASSIFICATION,
  SUGGESTED_REPLIES,
} from "../constants/llm-constants";

// Constants for LLM processing
const LLM_PROCESSOR_CONSTANTS = {
  EMAIL_HISTORY_LIMIT: 10, // Reduced from 50 to 10 for performance (now using cache)
  SUBSTRING_PREVIEW_LENGTH: 8,
  SUBJECT_PREVIEW_LENGTH: 50,
  BATCH_SIZE: 5, // Number of emails to batch in a single LLM call
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
    private protoCategoriesService: ProtoCategoriesService,
    private cloudWatchService: CloudWatchService,
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
        const { userId, emailId, forceRecalculate } = job.data as {
          userId: string;
          emailId: string;
          forceRecalculate?: boolean;
        };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          "refine-priority",
          workerId,
          this.cloudWatchService,
        );
        tracker.setMetadata({ userId, emailId, forceRecalculate });

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
            !forceRecalculate &&
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

          if (forceRecalculate) {
            this.logger.log(
              `[Worker ${workerId}] Force recalculating priority for email ${emailId} (forceRecalculate=true)`,
            );
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
          // Fetch proto categories for matching existing suggestions
          const [contexts, avgTimeToReply, threadEmails, protoCategories] =
            await Promise.all([
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
              // Fetch active proto categories for the user
              this.protoCategoriesService.findActiveByUser(userId),
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
            emailCategories: contexts
              .filter((c) => c.contextKey === ContextKey.EMAIL_CATEGORY)
              .map((c) => {
                const parts = c.contextValue.split(" - ");
                return {
                  name: parts[0].trim(),
                  description:
                    parts.length > 1
                      ? parts.slice(1).join(" - ").trim()
                      : undefined,
                };
              }),
            protoCategories: protoCategories.map((pc) => ({
              name: pc.name,
              description: pc.description || undefined,
            })),
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

          // Check if the email is categorized as a newsletter/mass-email
          const isNewsletterCategory =
            NEWSLETTER_DISCOUNT.CATEGORY_PATTERNS.some((pattern) =>
              (llmResult.category || "").toLowerCase().includes(pattern),
            );

          // Get goal alignment score from LLM (replaces keyword matching)
          const goalAlignmentScore = llmResult.goalAlignmentScore || 0;

          // Get sentiment score from LLM (required, no fallback to old score)
          const sentimentScore = llmResult.sentimentScore ?? 0;
          // Only contribute if sentiment is clearly negative (< NEGATIVE threshold)
          // Positive sentiment should contribute 0 (not negative) - positive emails don't need urgent attention
          // Neutral sentiment (between NEGATIVE and POSITIVE) always contributes 0
          let sentimentContribution = 0;
          if (sentimentScore < SENTIMENT_THRESHOLDS.NEGATIVE) {
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
          let urgencyContribution = Math.round(
            (urgencyScore - LLM_PROCESSOR_CONSTANTS.URGENCY_NEUTRAL) *
              EMAIL_CLASSIFICATION.COST_PER_TOKEN,
          );

          // Calculate total score from components:
          // - Goal alignment: 40% weight (from LLM)
          // - Sentiment: direct contribution (neutral = 0)
          // - Other factors (VIP, job title, etc.): 30% weight
          // - Urgency: additional contribution on top (from LLM)
          let goalAlignmentContribution = Math.round(
            goalAlignmentScore * LLM_PROCESSOR_CONSTANTS.GOAL_ALIGNMENT_WEIGHT,
          );

          // Apply newsletter discount: newsletters are informational, not actionable
          if (isNewsletterCategory) {
            urgencyContribution = Math.round(
              urgencyContribution * NEWSLETTER_DISCOUNT.URGENCY_MULTIPLIER,
            );
            goalAlignmentContribution = Math.round(
              goalAlignmentContribution *
                NEWSLETTER_DISCOUNT.GOAL_ALIGNMENT_MULTIPLIER,
            );
          }

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
          if (sentimentScore < SENTIMENT_THRESHOLDS.NEGATIVE) {
            sentimentDescription = `Negative sentiment (${sentimentScore.toFixed(2)})`;
          } else if (sentimentScore > SENTIMENT_THRESHOLDS.POSITIVE) {
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

          // Read status penalty: lower priority by 15 for emails that are read and not starred
          // This helps prioritize unread emails in triage
          if (email.isRead && thread && thread.starCount === 0) {
            const readPenalty = -15; // PRIORITY_BOOSTS.READ_NOT_STARRED_PENALTY
            breakdown.push({
              factor: "📖 Read Status",
              value: readPenalty,
              description: "Already read and not starred",
            });
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
              score: matchedVip ? SUGGESTED_REPLIES.REPLY_MAX_TOKENS : 0,
              reasons: matchedVip
                ? [`VIP contact: ${matchedVip.contextValue}`]
                : [],
            },
            sentiment: {
              score: sentimentScore,
              type:
                sentimentScore < SENTIMENT_THRESHOLDS.NEGATIVE
                  ? "negative"
                  : sentimentScore > SENTIMENT_THRESHOLDS.POSITIVE
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

              // Handle proto categories for "Other" category
              let finalCategory = llmResult.category || thread.category || null;
              // Preserve existing protoCategoryId if category stays "Other" and no new suggestion
              // Clear it if category changes from "Other" to something else
              let protoCategoryId: string | null =
                finalCategory === "Other" ? thread.protoCategoryId : null;

              if (
                llmResult.category === "Other" &&
                llmResult.protoCategorySuggestion?.name
              ) {
                try {
                  // First, check if there's an existing proto category that matches
                  const existingProtoCategory =
                    await this.protoCategoriesService.findMatchingProtoCategory(
                      userId,
                      llmResult.protoCategorySuggestion.name,
                    );

                  if (existingProtoCategory) {
                    // Assign to existing proto category
                    const updatedProtoCategory =
                      await this.protoCategoriesService.assignThreadToProtoCategory(
                        existingProtoCategory.id,
                        email.emailThreadId!,
                      );

                    // If promoted, update the category
                    if (updatedProtoCategory.isPromoted) {
                      finalCategory = updatedProtoCategory.name;
                      this.logger.log(
                        `[Worker ${workerId}] Proto category "${updatedProtoCategory.name}" was promoted to real category`,
                      );
                    } else {
                      protoCategoryId = updatedProtoCategory.id;
                      this.logger.log(
                        `[Worker ${workerId}] Assigned thread to existing proto category "${updatedProtoCategory.name}" (count: ${updatedProtoCategory.emailCount})`,
                      );
                    }
                  } else {
                    // Create new proto category
                    const newProtoCategory =
                      await this.protoCategoriesService.createAndAssignToThread(
                        userId,
                        llmResult.protoCategorySuggestion.name,
                        llmResult.protoCategorySuggestion.description || null,
                        email.emailThreadId!,
                      );

                    protoCategoryId = newProtoCategory.id;
                    this.logger.log(
                      `[Worker ${workerId}] Created new proto category "${newProtoCategory.name}"`,
                    );
                  }
                } catch (protoCategoryError) {
                  this.logger.warn(
                    `[Worker ${workerId}] Failed to process proto category for email ${emailId}:`,
                    protoCategoryError,
                  );
                  // Continue with normal category assignment
                }
              }

              await this.emailThreadRepository.update(
                { id: email.emailThreadId },
                {
                  urgencyScore: newUrgencyScore,
                  urgencyExplanation:
                    newUrgencyExplanation || thread.urgencyExplanation,
                  priorityExplanation, // Store priority explanation on thread
                  priorityScore, // Store denormalized score for efficient sorting
                  category: finalCategory, // Store email category (may be promoted from proto)
                  categoryExplanation:
                    llmResult.categoryExplanation ||
                    thread.categoryExplanation ||
                    null, // Store category explanation
                  protoCategoryId, // Store proto category ID if applicable
                  isProcessingPriority: false,
                },
              );

              // If priority score >= 75 (HIGH_THRESHOLD), un-batch the email (high priority emails shouldn't be batched)
              // Only truly high-priority emails should bypass batching to avoid false positives
              if (finalScore >= PRIORITY_SCORES.HIGH_THRESHOLD) {
                await this.emailRepository.update(
                  { emailThreadId: email.emailThreadId, userId },
                  {
                    isBatched: false,
                    batchReleaseAt: null,
                    wasDeliveredEarly: true,
                    batchDecisionReason: `Emergency delivery (score ${finalScore})`,
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

    // Worker for summary generation - process multiple threads with parallel LLM calls
    // Uses batchSize to fetch multiple jobs, then fires parallel LLM calls (not blocking)
    // This is more efficient than teamSize because we don't have workers sitting idle
    const parallelCalls = parseInt(
      this.configService.get<string>("LLM_SUMMARY_PARALLEL_CALLS") || "5",
      10,
    );
    this.logger.log(
      `Starting summary generation worker with ${parallelCalls} parallel LLM calls per batch`,
    );
    await this.boss.work(
      "generate-summary",
      {
        batchSize: parallelCalls, // Fetch multiple jobs at once for parallel LLM calls
      },
      async (jobs) => {
        const jobArray = Array.isArray(jobs) ? jobs : [jobs];
        const batchId = `batch-${Date.now()}`;
        const tracker = new JobPerformanceTracker(
          "generate-summary",
          batchId,
          this.cloudWatchService,
        );
        tracker.setMetadata({ batchSize: jobArray.length });

        this.logger.log(
          `[Worker ${batchId}] Processing ${jobArray.length} threads with parallel LLM calls`,
        );

        try {
          tracker.startPhase("dataFetch");

          // Fetch all emails and filter out ones that don't need summarization
          const jobsToProcess: Array<{
            job: (typeof jobArray)[0];
            userId: string;
            emailId: string;
            email: Email;
          }> = [];

          const skipCount = { alreadyHasSummary: 0, notFound: 0 };

          for (const job of jobArray) {
            const { userId, emailId } = job.data as {
              userId: string;
              emailId: string;
            };

            const email = await this.emailsService.getEmailById(
              userId,
              emailId,
            );

            if (!email) {
              this.logger.warn(
                `Email ${emailId} not found for summary generation`,
              );
              skipCount.notFound++;
              continue;
            }

            // Check if thread already has a summary
            if (email.emailThreadId) {
              const emailWithSummary = await this.emailRepository.findOne({
                where: {
                  emailThreadId: email.emailThreadId,
                  summary: Not(IsNull()),
                },
                select: ["id", "summary"],
              });
              if (
                emailWithSummary?.summary &&
                emailWithSummary.summary.trim() !== ""
              ) {
                // Apply existing summary to this email
                if (!email.summary || email.summary.trim() === "") {
                  await this.emailRepository.update(
                    { id: emailId },
                    {
                      summary: emailWithSummary.summary,
                      isProcessingSummary: false,
                    },
                  );
                }
                skipCount.alreadyHasSummary++;
                continue;
              }
            }

            // Skip if this specific email already has a summary
            if (
              email.summary &&
              email.summary.trim() !== "" &&
              !email.isProcessingSummary
            ) {
              skipCount.alreadyHasSummary++;
              continue;
            }

            jobsToProcess.push({ job, userId, emailId, email });
          }

          tracker.endPhase("dataFetch");

          if (jobsToProcess.length === 0) {
            this.logger.log(
              `[Worker ${batchId}] No threads need summarization (skipped: ${skipCount.alreadyHasSummary} already have summaries, ${skipCount.notFound} not found)`,
            );
            tracker.finish();
            return;
          }

          // Pre-fetch summarization rules for all unique users in this batch
          // This avoids redundant rule fetching for each email
          const uniqueUserIds = [
            ...new Set(jobsToProcess.map((j) => j.userId)),
          ];
          const rulesMap = new Map<
            string,
            Awaited<
              ReturnType<typeof this.summarizationService.getSummarizationRules>
            >
          >();
          await Promise.all(
            uniqueUserIds.map(async (uid) => {
              const rules =
                await this.summarizationService.getSummarizationRules(uid);
              rulesMap.set(uid, rules);
            }),
          );

          this.logger.log(
            `[Worker ${batchId}] Firing ${jobsToProcess.length} parallel LLM calls (skipped ${skipCount.alreadyHasSummary + skipCount.notFound})`,
          );

          tracker.startPhase("llmCall");

          // Fire ALL LLM calls in parallel - don't wait for each one sequentially
          // This is the key optimization: we're not blocking on each call
          // Uses summarizeEmailWithAutoRule to apply user's custom summarization rules
          // Pre-fetched email and rules are passed to avoid redundant database queries
          const summaryPromises = jobsToProcess.map(
            async ({ userId, emailId, email }) => {
              try {
                const userRules = rulesMap.get(userId) || [];
                const summary =
                  await this.summarizationService.summarizeEmailWithAutoRule(
                    userId,
                    emailId,
                    email,
                    userRules,
                  );
                return { emailId, email, summary, error: null };
              } catch (error) {
                this.logger.error(
                  `[Worker ${batchId}] LLM call failed for email ${emailId}`,
                  error,
                );
                return { emailId, email, summary: null, error };
              }
            },
          );

          // Wait for ALL parallel calls to complete
          const results = await Promise.all(summaryPromises);

          tracker.endPhase("llmCall");
          tracker.startPhase("dbUpdate");

          // Process results and update DB
          let successCount = 0;
          let failCount = 0;

          for (const { emailId, email, summary, error } of results) {
            if (summary && !error) {
              try {
                // Find the job to get userId
                const jobData = jobsToProcess.find(
                  (j) => j.emailId === emailId,
                );
                if (!jobData) continue;

                // Update all emails in the thread with the same summary
                const threadEmails = await this.emailsService.getThreadEmails(
                  jobData.userId,
                  email.threadId,
                  { limit: 50 },
                );
                const threadEmailIds = threadEmails.map((e) => e.id);

                await this.emailRepository.update(
                  { id: In(threadEmailIds) },
                  {
                    summary,
                    isProcessingSummary: false,
                  },
                );

                this.logger.debug(
                  `[Worker ${batchId}] Updated thread ${email.threadId?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}... (${threadEmailIds.length} emails)`,
                );
                successCount++;
              } catch (dbError) {
                this.logger.error(
                  `[Worker ${batchId}] Failed to update summary for email ${emailId}`,
                  dbError,
                );
                await this.emailRepository.update(
                  { id: emailId },
                  { isProcessingSummary: false },
                );
                failCount++;
              }
            } else {
              // LLM call failed - mark as not processing
              await this.emailRepository.update(
                { id: emailId },
                { isProcessingSummary: false },
              );
              failCount++;
            }
          }

          tracker.endPhase("dbUpdate");

          this.logger.log(
            `[Worker ${batchId}] Completed: ${successCount} succeeded, ${failCount} failed, ${skipCount.alreadyHasSummary + skipCount.notFound} skipped`,
          );
          tracker.finish();
        } catch (error) {
          this.logger.error(
            `[Worker ${batchId}] Batch processing failed`,
            error,
          );

          // Mark all emails as not processing on error
          for (const job of jobArray) {
            const { emailId } = job.data as { emailId: string };
            try {
              await this.emailRepository.update(
                { id: emailId },
                { isProcessingSummary: false },
              );
            } catch (updateError) {
              // Ignore
            }
          }

          tracker.finish(error as Error);
          throw error;
        }
      },
    );

    // Worker for batch priority refinement - processes multiple emails in a single LLM call
    // This is much faster than individual calls: ~2-4s for a batch vs ~2min per email
    this.logger.log("Starting batch priority refinement worker");
    await this.boss.work(
      "refine-priority-batch",
      { teamSize: Math.max(2, Math.floor(this.priorityConcurrency / 2)) },
      // eslint-disable-next-line max-lines-per-function, max-statements
      async (job) => {
        const { userId, emailIds } = job.data as {
          userId: string;
          emailIds: string[];
        };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          "refine-priority-batch",
          workerId,
          this.cloudWatchService,
        );
        tracker.setMetadata({ userId, emailId: emailIds.join(",") });

        this.logger.log(
          `[Worker ${workerId}] Starting BATCH priority refinement for ${emailIds.length} emails`,
        );

        try {
          tracker.startPhase("dataFetch");

          // Fetch all emails, user context, and proto categories in parallel
          const [emailResults, contexts, protoCategories] = await Promise.all([
            Promise.all(
              emailIds.map((emailId) =>
                this.emailsService.getEmailById(userId, emailId),
              ),
            ),
            this.priorityCacheService.getUserContexts(userId),
            this.protoCategoriesService.findActiveByUser(userId),
          ]);

          // Filter out nulls and emails that already have valid priority
          const emailsToProcess = emailResults.filter(
            (email): email is NonNullable<typeof email> => {
              if (!email) return false;
              return true;
            },
          );

          if (emailsToProcess.length === 0) {
            this.logger.log(
              `[Worker ${workerId}] No emails to process in batch`,
            );
            tracker.finish();
            return;
          }

          tracker.endPhase("dataFetch");
          tracker.startPhase("processing");

          // Format user context for batch LLM call
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
            emailCategories: contexts
              .filter((c) => c.contextKey === ContextKey.EMAIL_CATEGORY)
              .map((c) => {
                const parts = c.contextValue.split(" - ");
                return {
                  name: parts[0].trim(),
                  description:
                    parts.length > 1
                      ? parts.slice(1).join(" - ").trim()
                      : undefined,
                };
              }),
            protoCategories: protoCategories.map((pc) => ({
              name: pc.name,
              description: pc.description || undefined,
            })),
          };

          // Prepare batch emails for LLM
          const batchEmails = emailsToProcess.map((email) => ({
            emailKey: email.id,
            from: email.from || "",
            fromName: email.fromName,
            senderJobTitle: email.senderJobTitle,
            subject: email.subject || "",
            body: cleanEmailContent(email.body, email.htmlBody, 1000),
          }));

          tracker.endPhase("processing");
          tracker.startPhase("llmCall");

          // Single batch LLM call for all emails
          const batchResults =
            await this.priorityAnalysisService.analyzePriorityBatch(
              batchEmails,
              userContext,
              undefined,
              userId,
            );

          tracker.endPhase("llmCall");
          tracker.startPhase("dbUpdate");

          // Process results and update DB for each email
          for (const email of emailsToProcess) {
            const llmResult = batchResults.get(email.id);
            if (!llmResult) continue;

            try {
              await this.applyPriorityResult(
                email,
                llmResult,
                contexts,
                userId,
                workerId,
              );
            } catch (updateError) {
              this.logger.error(
                `[Worker ${workerId}] Failed to update priority for email ${email.id}:`,
                updateError,
              );
            }
          }

          tracker.endPhase("dbUpdate");
          this.logger.log(
            `[Worker ${workerId}] Batch priority refinement complete: ${emailsToProcess.length} emails processed`,
          );
          tracker.finish();
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed batch priority refinement`,
            error,
          );
          // Reset processing flags
          for (const emailId of emailIds) {
            try {
              const email = await this.emailsService.getEmailById(
                userId,
                emailId,
              );
              if (email?.emailThreadId) {
                await this.emailThreadRepository.update(
                  { id: email.emailThreadId },
                  { isProcessingPriority: false },
                );
              }
            } catch {
              // Ignore cleanup errors
            }
          }
          tracker.finish(error as Error);
          throw error;
        }
      },
    );
  }

  /**
   * Apply LLM priority result to an email and its thread.
   * Shared between single and batch processing.
   */
  // eslint-disable-next-line max-lines-per-function, max-statements, max-params
  private async applyPriorityResult(
    email: Email,
    llmResult: {
      urgencyScore: number;
      urgencyExplanation: string;
      sentimentScore: number;
      goalAlignmentScore: number;
      goalAlignmentExplanation: string;
      category: string;
      categoryExplanation: string;
      protoCategorySuggestion?: {
        name: string;
        description: string;
      };
    },
    contexts: Array<{ contextKey: string; contextValue: string }>,
    userId: string,
    workerId: string,
  ): Promise<void> {
    const goalAlignmentScore = llmResult.goalAlignmentScore || 0;
    const sentimentScore = llmResult.sentimentScore ?? 0;
    const urgencyScore = llmResult.urgencyScore || 0;

    const isNewsletterCategory = NEWSLETTER_DISCOUNT.CATEGORY_PATTERNS.some(
      (pattern) => (llmResult.category || "").toLowerCase().includes(pattern),
    );

    // Calculate contributions
    let sentimentContribution = 0;
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    if (sentimentScore < -0.3) {
      sentimentContribution = Math.round(
        -sentimentScore * LLM_PROCESSOR_CONSTANTS.SENTIMENT_MULTIPLIER,
      );
    }

    let urgencyContribution = Math.round(
      (urgencyScore - LLM_PROCESSOR_CONSTANTS.URGENCY_NEUTRAL) *
        EMAIL_CLASSIFICATION.COST_PER_TOKEN,
    );

    let goalAlignmentContribution = Math.round(
      goalAlignmentScore * LLM_PROCESSOR_CONSTANTS.GOAL_ALIGNMENT_WEIGHT,
    );

    if (isNewsletterCategory) {
      urgencyContribution = Math.round(
        urgencyContribution * NEWSLETTER_DISCOUNT.URGENCY_MULTIPLIER,
      );
      goalAlignmentContribution = Math.round(
        goalAlignmentContribution *
          NEWSLETTER_DISCOUNT.GOAL_ALIGNMENT_MULTIPLIER,
      );
    }

    // Build breakdown
    const breakdown: Array<{
      factor: string;
      value: number;
      description: string;
    }> = [
      {
        factor: "🔥 Urgency",
        value: urgencyContribution,
        description: llmResult.urgencyExplanation || "Urgency analysis",
      },
      {
        factor: "🎯 Goal Alignment",
        value: goalAlignmentContribution,
        description:
          llmResult.goalAlignmentExplanation || "Goal alignment analysis",
      },
      {
        factor: "😊 Sentiment",
        value: sentimentContribution,
        description:
          // eslint-disable-next-line @typescript-eslint/no-magic-numbers
          sentimentScore < -0.3
            ? `Negative sentiment (${sentimentScore.toFixed(2)})`
            : // eslint-disable-next-line @typescript-eslint/no-magic-numbers
              sentimentScore > 0.3
              ? `Positive sentiment (${sentimentScore.toFixed(2)})`
              : "Neutral sentiment",
      },
    ];

    // VIP contact check
    const vipContacts = contexts.filter(
      (c) => c.contextKey === ContextKey.VIP_CONTACT,
    );
    const matchedVip = vipContacts.find(
      (vip) =>
        email.from?.toLowerCase().includes(vip.contextValue.toLowerCase()) ||
        email.fromName?.toLowerCase().includes(vip.contextValue.toLowerCase()),
    );
    if (matchedVip) {
      breakdown.push({
        factor: "⭐ VIP Contact",
        value: 25,
        description: `From VIP: ${matchedVip.contextValue}`,
      });
    }

    // Job title boost
    if (email.senderJobTitle) {
      const jobTitleLower = email.senderJobTitle.toLowerCase();
      const highPriorityTitles = [
        "ceo",
        "president",
        "director",
        "manager",
        "lead",
        "head",
      ];
      if (highPriorityTitles.some((title) => jobTitleLower.includes(title))) {
        breakdown.push({
          factor: "⭐ VIP Contact",
          value: 15,
          description: `Sender role: ${email.senderJobTitle}`,
        });
      }
    }

    // Get thread for read status check
    let thread = null;
    if (email.emailThreadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId },
      });
    }

    if (email.isRead && thread && thread.starCount === 0) {
      breakdown.push({
        factor: "📖 Read Status",
        value: -15,
        description: "Already read and not starred",
      });
    }

    const finalScore = breakdown.reduce(
      (sum, item) => sum + (item.value || 0),
      0,
    );

    const dimensions = {
      urgency: {
        score: urgencyScore,
        reasons: [llmResult.urgencyExplanation || "No urgency explanation"],
      },
      goalAlignment: {
        score: goalAlignmentScore,
        reasons: [
          llmResult.goalAlignmentExplanation || "No goal alignment explanation",
        ],
      },
      vipContact: {
        score: matchedVip ? SUGGESTED_REPLIES.REPLY_MAX_TOKENS : 0,
        reasons: matchedVip ? [`VIP contact: ${matchedVip.contextValue}`] : [],
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

    const priorityExplanation = {
      score: finalScore,
      breakdown,
      dimensions,
      calculatedAt: new Date().toISOString(),
    };

    // Update email sentiment
    await this.emailRepository.update(
      { id: email.id },
      {
        sentimentScore:
          llmResult.sentimentScore !== undefined
            ? llmResult.sentimentScore
            : null,
      },
    );

    // Update thread
    if (email.emailThreadId && thread) {
      const newUrgencyScore = Math.max(
        thread.urgencyScore || 0,
        llmResult.urgencyScore || 0,
      );
      const newUrgencyExplanation =
        (llmResult.urgencyScore || 0) > (thread.urgencyScore || 0)
          ? llmResult.urgencyExplanation
          : thread.urgencyExplanation;

      let finalCategory = llmResult.category || thread.category || null;
      let protoCategoryId: string | null =
        finalCategory === "Other" ? (thread.protoCategoryId ?? null) : null;

      if (
        llmResult.category === "Other" &&
        llmResult.protoCategorySuggestion?.name
      ) {
        try {
          const existingProtoCategory =
            await this.protoCategoriesService.findMatchingProtoCategory(
              userId,
              llmResult.protoCategorySuggestion.name,
            );

          if (existingProtoCategory) {
            const updatedProtoCategory =
              await this.protoCategoriesService.assignThreadToProtoCategory(
                existingProtoCategory.id,
                email.emailThreadId,
              );

            if (updatedProtoCategory.isPromoted) {
              finalCategory = updatedProtoCategory.name;
              this.logger.log(
                `[Worker ${workerId}] Proto category "${updatedProtoCategory.name}" was promoted to real category`,
              );
            } else {
              protoCategoryId = updatedProtoCategory.id;
              this.logger.log(
                `[Worker ${workerId}] Assigned thread to existing proto category "${updatedProtoCategory.name}" (count: ${updatedProtoCategory.emailCount})`,
              );
            }
          } else {
            const newProtoCategory =
              await this.protoCategoriesService.createAndAssignToThread(
                userId,
                llmResult.protoCategorySuggestion.name,
                llmResult.protoCategorySuggestion.description || null,
                email.emailThreadId,
              );

            protoCategoryId = newProtoCategory.id;
            this.logger.log(
              `[Worker ${workerId}] Created new proto category "${newProtoCategory.name}"`,
            );
          }
        } catch (protoCategoryError) {
          this.logger.warn(
            `[Worker ${workerId}] Failed to process proto category for email ${email.id}:`,
            protoCategoryError,
          );
        }
      }

      await this.emailThreadRepository.update(
        { id: email.emailThreadId },
        {
          urgencyScore: newUrgencyScore,
          urgencyExplanation:
            newUrgencyExplanation || thread.urgencyExplanation,
          priorityExplanation,
          priorityScore: finalScore,
          category: finalCategory,
          categoryExplanation:
            llmResult.categoryExplanation || thread.categoryExplanation || null,
          protoCategoryId,
          isProcessingPriority: false,
        },
      );

      // Emergency delivery for high priority
      if (finalScore >= PRIORITY_SCORES.HIGH_THRESHOLD) {
        await this.emailRepository.update(
          { emailThreadId: email.emailThreadId, userId },
          {
            isBatched: false,
            batchReleaseAt: null,
            wasDeliveredEarly: true,
            batchDecisionReason: `Emergency delivery (score ${finalScore})`,
          },
        );
        this.logger.log(
          `[Worker ${workerId}] Emergency delivery: Un-batched email ${email.id} due to high priority score: ${finalScore}`,
        );
      }

      this.logger.log(
        `[Worker ${workerId}] Updated thread ${email.emailThreadId.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}... priorityScore: ${finalScore}`,
      );
    }
  }
}
