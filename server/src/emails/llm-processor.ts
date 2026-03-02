import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, Not, IsNull } from "typeorm";
import * as os from "os";
import PgBoss from "pg-boss";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  Contact,
  DEFAULT_CONTACT_TYPES,
} from "../database/entities/contact.entity";
import { EmailsService } from "./emails.service";
import { PriorityService } from "../priority/priority.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { SummarizationService } from "../summarization/summarization.service";
import { PriorityAnalysisService } from "../llm/priority-analysis.service";
import { IncrementalAnalysisService } from "../llm/incremental-analysis.service";
import { ContactTypeClassifierService } from "../crm/contact-type-classifier.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { ContextKey } from "../database/entities/user-context.entity";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { CloudWatchService } from "../aws/cloudwatch.service";
import { SearchIndexHelper } from "../contacts/search-index.helper";
import {
  SENTIMENT_THRESHOLDS,
  PRIORITY_SCORES,
  NEWSLETTER_DISCOUNT,
} from "../constants/priority-constants";
import {
  EMAIL_CLASSIFICATION,
  SUGGESTED_REPLIES,
  BODY_PREVIEW_LENGTHS,
} from "../constants/llm-constants";
import { MILLISECONDS } from "../constants/time-constants";

type SummaryJobEntry = {
  job: PgBoss.Job<unknown>;
  userId: string;
  emailId: string;
  email: Email;
};

type SummaryLlmCallResult = {
  emailId: string;
  email: Email;
  summary: string | null;
  error: unknown;
};

type PriorityLlmResult = {
  urgencyScore: number;
  urgencyExplanation: string;
  sentimentScore: number;
  goalAlignmentScore: number;
  goalAlignmentExplanation: string;
  category: string;
  categoryExplanation: string;
  protoCategorySuggestion?: { name: string; description: string };
};

type PriorityBreakdownItem = {
  factor: string;
  value: number;
  description: string;
};

type PriorityDimensions = {
  urgency: { score: number; reasons: string[] };
  goalAlignment: { score: number; reasons: string[] };
  vipContact: { score: number; reasons: string[] };
  sentiment: { score: number; type: string; reasons: string[] };
};

// Constants for LLM processing
const LLM_PROCESSOR_CONSTANTS = {
  // Reduced from 50 to 10 for performance (now using cache)
  EMAIL_HISTORY_LIMIT: 10,
  SUBSTRING_PREVIEW_LENGTH: 8,
  SUBJECT_PREVIEW_LENGTH: 50,
  // Number of emails to batch in a single LLM call
  BATCH_SIZE: 5,
  SENTIMENT_MULTIPLIER: 30,
  URGENCY_NEUTRAL: 50,
  // Max urgency contribution: (100 - 50) * 0.5 = 25
  URGENCY_MULTIPLIER: 0.5,
  GOAL_ALIGNMENT_WEIGHT: 0.4,
  OTHER_FACTORS_WEIGHT: 0.3,
  MAX_SCORE: 100,
  // Fetch last 15 emails for thread context in priority calculation
  THREAD_EMAILS_LIMIT: 15,
  // Minimum confidence for auto-classifying contact type
  CONTACT_TYPE_CONFIDENCE_THRESHOLD: 0.6,
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
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    private emailsService: EmailsService,
    private priorityService: PriorityService,
    private priorityCacheService: PriorityCacheService,
    private summarizationService: SummarizationService,
    private priorityAnalysisService: PriorityAnalysisService,
    private incrementalAnalysisService: IncrementalAnalysisService,
    private contactTypeClassifierService: ContactTypeClassifierService,
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

  async onModuleInit() {
    // Worker for LLM priority refinement - process multiple jobs in parallel
    // teamSize determines how many concurrent workers process jobs from this queue
    this.logger.log(
      `Starting priority refinement worker with concurrency: ${this.priorityConcurrency}`,
    );
    await this.boss.work(
      "refine-priority",
      { teamSize: this.priorityConcurrency },
      async (job) => this.handleRefinePriorityJob(job as PgBoss.Job),
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
        // Fetch multiple jobs at once for parallel LLM calls
        batchSize: parallelCalls,
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

        await this.processSummaryJobBatch(jobArray, batchId, tracker);
      },
    );

    // Worker for batch priority refinement - processes multiple emails in a single LLM call
    // This is much faster than individual calls: ~2-4s for a batch vs ~2min per email
    this.logger.log("Starting batch priority refinement worker");
    await this.boss.work(
      "refine-priority-batch",
      { teamSize: Math.max(2, Math.floor(this.priorityConcurrency / 2)) },
      async (job) => this.handleRefinePriorityBatchJob(job as PgBoss.Job),
    );
  }

  private async handleRefinePriorityJob(job: PgBoss.Job): Promise<void> {
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

      let thread: EmailThread | null = null;
      if (email.emailThreadId) {
        thread = await this.emailThreadRepository.findOne({
          where: { id: email.emailThreadId },
        });
      }

      const shouldSkip = await this.shouldSkipPriorityRecalculation(
        thread,
        forceRecalculate,
        email,
        workerId,
        emailId,
      );
      if (shouldSkip) return;

      // Try incremental analysis for new emails in threads with existing valid data
      const incrementalResult = await this.tryIncrementalAnalysis(
        thread,
        email,
        forceRecalculate,
        userId,
        workerId,
        tracker,
      );
      if (incrementalResult.handled) return;

      if (email.emailThreadId && thread) {
        await this.emailThreadRepository.update(
          { id: email.emailThreadId },
          { isProcessingPriority: true },
        );
      }

      // OPTIMIZED: Use cache service and limit data fetching
      const [contexts, avgTimeToReply, threadEmails, protoCategories] =
        await Promise.all([
          this.priorityCacheService.getUserContexts(userId),
          this.priorityCacheService.getAvgTimeToReply(userId),
          email.threadId
            ? this.emailsService.getThreadEmails(userId, email.threadId, {
                limit: LLM_PROCESSOR_CONSTANTS.THREAD_EMAILS_LIMIT,
                order: "ASC",
              })
            : Promise.resolve([]),
          this.protoCategoriesService.findActiveByUser(userId),
        ]);
      tracker.endPhase("dataFetch");
      tracker.startPhase("processing");

      // Calculate basic score (synchronous, fast) - for other factors like VIP
      this.priorityService.calculateBasicPriorityScore(email, contexts);

      const replyStatus = this.determineThreadReplyStatus(threadEmails, email);
      const userContext = this.buildUserContext(contexts, protoCategories);

      this.logger.log(
        `[Worker ${workerId}] Analyzing priority for email ${emailId} (thread: ${email.threadId?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}..., subject: ${email.subject?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBJECT_PREVIEW_LENGTH)}...)`,
      );

      // Clean email body: strip HTML, remove signatures, limit to 1000 chars
      const cleanedBody = cleanEmailContent(
        email.body,
        email.htmlBody,
        BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
      );

      // Format thread emails for LLM (exclude current email, already in chronological order)
      const threadEmailsForLLM = threadEmails
        .filter((e) => e.id !== email.id)
        .map((e) => ({
          from: e.from || "",
          fromName: e.fromName,
          subject: e.subject || "",
          body: e.body || "",
          receivedAt: e.receivedAt || new Date(),
        }));

      tracker.endPhase("processing");
      tracker.startPhase("llmCall");

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
        userId,
        userContext,
        replyStatus,
        threadEmailsForLLM.length > 0 ? threadEmailsForLLM : undefined,
      );

      tracker.endPhase("llmCall");
      tracker.startPhase("dbUpdate");

      await this.applyPriorityResult(
        email,
        llmResult,
        contexts,
        userId,
        workerId,
      );

      tracker.endPhase("dbUpdate");

      this.logger.log(
        `[Worker ${workerId}] Refined priority for email ${emailId} (thread: ${email.threadId?.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}...)`,
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
  }

  private async handleRefinePriorityBatchJob(job: PgBoss.Job): Promise<void> {
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
        this.logger.log(`[Worker ${workerId}] No emails to process in batch`);
        tracker.finish();
        return;
      }

      tracker.endPhase("dataFetch");
      tracker.startPhase("processing");

      // Format user context for batch LLM call
      const userContext = this.buildUserContext(contexts, protoCategories);

      // Prepare batch emails for LLM
      const batchEmails = emailsToProcess.map((email) => ({
        emailKey: email.id,
        from: email.from || "",
        fromName: email.fromName,
        senderJobTitle: email.senderJobTitle,
        subject: email.subject || "",
        body: cleanEmailContent(
          email.body,
          email.htmlBody,
          BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
        ),
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
          const email = await this.emailsService.getEmailById(userId, emailId);
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
  }

  private buildUserContext(
    contexts: Array<{
      contextKey: string;
      contextValue: string;
      explanation?: string | null;
      priority?: number | null;
    }>,
    protoCategories: Array<{ name: string; description?: string | null }>,
  ) {
    return {
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
              parts.length > 1 ? parts.slice(1).join(" - ").trim() : undefined,
          };
        }),
      protoCategories: protoCategories.map((pc) => ({
        name: pc.name,
        description: pc.description || undefined,
      })),
    };
  }

  private async shouldSkipPriorityRecalculation(
    thread: EmailThread | null,
    forceRecalculate: boolean | undefined,
    email: Email,
    workerId: string,
    emailId: string,
  ): Promise<boolean> {
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

    const hasCalculatingItems = existingBreakdown.some(
      (item) =>
        item.description === "Calculating..." ||
        item.description?.includes("Calculating..."),
    );

    const hasNewEmails = await this.checkHasNewEmails(
      thread,
      email,
      threadPriorityExplanation,
    );

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
      return true;
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
      let reason: string;
      if (hasOldStructure) {
        reason = "old";
      } else if (hasCalculatingItems) {
        reason = "calculating items";
      } else {
        reason = "incomplete";
      }
      this.logger.log(
        `[Worker ${workerId}] Detected ${reason} priority structure for thread ${email.emailThreadId}, recalculating with new format`,
      );
    }

    return false;
  }

  private async checkHasNewEmails(
    thread: EmailThread | null,
    email: Email,
    threadPriorityExplanation: { calculatedAt?: string } | null | undefined,
  ): Promise<boolean> {
    if (!thread || !email.receivedAt || !email.emailThreadId) {
      return false;
    }

    const mostRecentEmail = await this.emailRepository.findOne({
      where: { emailThreadId: email.emailThreadId },
      order: { receivedAt: "DESC" },
      select: ["id", "receivedAt"],
    });

    if (!mostRecentEmail) return false;

    const priorityCalculatedAt = threadPriorityExplanation?.calculatedAt
      ? new Date(threadPriorityExplanation.calculatedAt)
      : null;
    const lastCalculationTime =
      priorityCalculatedAt || thread.updatedAt || thread.createdAt;

    if (mostRecentEmail.id === email.id) {
      return email.receivedAt > lastCalculationTime;
    }
    return Boolean(
      mostRecentEmail.receivedAt &&
      mostRecentEmail.receivedAt > lastCalculationTime,
    );
  }

  private determineThreadReplyStatus(
    threadEmails: Email[],
    email: Email,
  ): {
    daysSinceLastReply: number | undefined;
    userShouldReply: boolean;
    lastReplyFrom: string | undefined;
  } {
    let userShouldReply = false;
    let daysSinceLastReply: number | undefined;
    let lastReplyFrom: string | undefined;

    if (threadEmails.length > 0 && email.receivedAt) {
      const lastEmail = threadEmails[threadEmails.length - 1];
      if (
        lastEmail.from &&
        email.from &&
        lastEmail.from.toLowerCase() === email.from.toLowerCase()
      ) {
        userShouldReply = true;
        const userLastEmail = [...threadEmails]
          .reverse()
          .find(
            (e) => e.from && e.from.toLowerCase() !== email.from!.toLowerCase(),
          );
        if (userLastEmail && userLastEmail.receivedAt) {
          const daysDiff =
            (email.receivedAt.getTime() - userLastEmail.receivedAt.getTime()) /
            MILLISECONDS.DAY;
          daysSinceLastReply = Math.max(0, Math.round(daysDiff * 10) / 10);
          lastReplyFrom = userLastEmail.from || undefined;
        }
      }
    }

    return { daysSinceLastReply, userShouldReply, lastReplyFrom };
  }

  private async processSummaryJobBatch(
    jobArray: PgBoss.Job<unknown>[],
    batchId: string,
    tracker: JobPerformanceTracker,
  ): Promise<void> {
    try {
      const { jobsToProcess, skipCount } =
        await this.collectSummaryJobsToProcess(batchId, jobArray, tracker);

      if (jobsToProcess.length === 0) {
        this.logger.log(
          `[Worker ${batchId}] No threads need summarization (skipped: ${skipCount.alreadyHasSummary} already have summaries, ${skipCount.notFound} not found)`,
        );
        tracker.finish();
        return;
      }

      const rulesMap = await this.fetchSummarizationRulesForJobs(jobsToProcess);

      this.logger.log(
        `[Worker ${batchId}] Firing ${jobsToProcess.length} parallel LLM calls (skipped ${skipCount.alreadyHasSummary + skipCount.notFound})`,
      );

      const results = await this.fireSummaryLlmCalls(
        batchId,
        jobsToProcess,
        rulesMap,
        tracker,
      );
      const { successCount, failCount } = await this.saveSummaryResults(
        batchId,
        results,
        jobsToProcess,
        tracker,
      );

      this.logger.log(
        `[Worker ${batchId}] Completed: ${successCount} succeeded, ${failCount} failed, ${skipCount.alreadyHasSummary + skipCount.notFound} skipped`,
      );
      tracker.finish();
    } catch (error) {
      this.logger.error(`[Worker ${batchId}] Batch processing failed`, error);

      for (const job of jobArray) {
        const { emailId } = job.data as { emailId: string };
        try {
          await this.emailRepository.update(
            { id: emailId },
            { isProcessingSummary: false },
          );
        } catch (_updateError) {
          // Ignore update failure during error recovery
        }
      }

      tracker.finish(error as Error);
      throw error;
    }
  }

  private async collectSummaryJobsToProcess(
    batchId: string,
    jobArray: PgBoss.Job<unknown>[],
    tracker: JobPerformanceTracker,
  ): Promise<{
    jobsToProcess: SummaryJobEntry[];
    skipCount: { alreadyHasSummary: number; notFound: number };
  }> {
    tracker.startPhase("dataFetch");

    const jobsToProcess: SummaryJobEntry[] = [];
    const skipCount = { alreadyHasSummary: 0, notFound: 0 };

    for (const job of jobArray) {
      const { userId, emailId } = job.data as {
        userId: string;
        emailId: string;
      };

      const email = await this.emailsService.getEmailById(userId, emailId);

      if (!email) {
        this.logger.warn(`Email ${emailId} not found for summary generation`);
        skipCount.notFound++;
        continue;
      }

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
          if (!email.summary || email.summary.trim() === "") {
            await this.emailRepository.update(
              { id: emailId },
              { summary: emailWithSummary.summary, isProcessingSummary: false },
            );
          }
          skipCount.alreadyHasSummary++;
          continue;
        }
      }

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
    return { jobsToProcess, skipCount };
  }

  private async fetchSummarizationRulesForJobs(
    jobsToProcess: SummaryJobEntry[],
  ): Promise<
    Map<
      string,
      Awaited<ReturnType<SummarizationService["getSummarizationRules"]>>
    >
  > {
    const uniqueUserIds = [...new Set(jobsToProcess.map((j) => j.userId))];
    const rulesMap = new Map<
      string,
      Awaited<ReturnType<SummarizationService["getSummarizationRules"]>>
    >();
    await Promise.all(
      uniqueUserIds.map(async (uid) => {
        const rules =
          await this.summarizationService.getSummarizationRules(uid);
        rulesMap.set(uid, rules);
      }),
    );
    return rulesMap;
  }

  private async fireSummaryLlmCalls(
    batchId: string,
    jobsToProcess: SummaryJobEntry[],
    rulesMap: Map<
      string,
      Awaited<ReturnType<SummarizationService["getSummarizationRules"]>>
    >,
    tracker: JobPerformanceTracker,
  ): Promise<SummaryLlmCallResult[]> {
    tracker.startPhase("llmCall");

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

    const results = await Promise.all(summaryPromises);
    tracker.endPhase("llmCall");
    return results;
  }

  private async saveSummaryResults(
    batchId: string,
    results: SummaryLlmCallResult[],
    jobsToProcess: SummaryJobEntry[],
    tracker: JobPerformanceTracker,
  ): Promise<{ successCount: number; failCount: number }> {
    tracker.startPhase("dbUpdate");
    let successCount = 0;
    let failCount = 0;

    for (const { emailId, email, summary, error } of results) {
      if (summary && !error) {
        try {
          const jobEntry = jobsToProcess.find((j) => j.emailId === emailId);
          if (!jobEntry) continue;

          const threadEmails = await this.emailsService.getThreadEmails(
            jobEntry.userId,
            email.threadId,
            { limit: 50 },
          );
          const threadEmailIds = threadEmails.map((e) => e.id);

          await this.emailRepository.update(
            { id: In(threadEmailIds) },
            { summary, isProcessingSummary: false },
          );

          // Auto-classify contact type during initial summary generation
          const senderEmail = this.extractEmailAddress(email.from || "");
          if (senderEmail) {
            try {
              await this.contactTypeClassifierService.autoClassifyIfNeeded(
                jobEntry.userId,
                senderEmail,
                {
                  from: email.from || "",
                  fromName: email.fromName || "",
                  subject: email.subject || "",
                  body: email.body || "",
                },
              );
            } catch (classificationError) {
              this.logger.warn(
                `[Worker ${batchId}] Contact type auto-classification failed for ${senderEmail}: ${classificationError}`,
              );
            }
          }

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
        await this.emailRepository.update(
          { id: emailId },
          { isProcessingSummary: false },
        );
        failCount++;
      }
    }

    tracker.endPhase("dbUpdate");
    return { successCount, failCount };
  }

  /**
   * Apply LLM priority result to an email and its thread.
   * Shared between single and batch processing.
   */
  private async applyPriorityResult(
    email: Email,
    llmResult: PriorityLlmResult,
    contexts: Array<{ contextKey: string; contextValue: string }>,
    userId: string,
    workerId: string,
  ): Promise<void> {
    let thread: EmailThread | null = null;
    if (email.emailThreadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId },
      });
    }

    const { breakdown, dimensions, finalScore } =
      this.calculatePriorityBreakdown(email, llmResult, contexts, thread);

    const priorityExplanation = {
      score: finalScore,
      breakdown,
      dimensions,
      calculatedAt: new Date().toISOString(),
    };

    await this.emailRepository.update(
      { id: email.id },
      {
        sentimentScore:
          llmResult.sentimentScore !== undefined
            ? llmResult.sentimentScore
            : null,
      },
    );

    if (email.emailThreadId && thread) {
      const newUrgencyScore = Math.max(
        thread.urgencyScore || 0,
        llmResult.urgencyScore || 0,
      );
      const newUrgencyExplanation =
        (llmResult.urgencyScore || 0) > (thread.urgencyScore || 0)
          ? llmResult.urgencyExplanation
          : thread.urgencyExplanation;

      const { finalCategory, protoCategoryId } =
        await this.resolveCategoryAndProtoCategory(
          email,
          thread,
          llmResult,
          userId,
          workerId,
        );

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

      if (finalScore >= PRIORITY_SCORES.HIGH_THRESHOLD) {
        await this.emailThreadRepository.update(
          { id: email.emailThreadId, userId },
          {
            isBatched: false,
            batchReleaseAt: null,
            wasDeliveredEarly: true,
            batchDecisionReason: `Emergency delivery (score ${finalScore})`,
          },
        );
        this.logger.log(
          `[Worker ${workerId}] Emergency delivery: Un-batched thread ${email.emailThreadId} due to high priority score: ${finalScore}`,
        );
      }

      this.logger.log(
        `[Worker ${workerId}] Updated thread ${email.emailThreadId.substring(0, LLM_PROCESSOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}... priorityScore: ${finalScore}`,
      );
    }
  }

  private calculatePriorityBreakdown(
    email: Email,
    llmResult: PriorityLlmResult,
    contexts: Array<{ contextKey: string; contextValue: string }>,
    thread: EmailThread | null,
  ): {
    breakdown: PriorityBreakdownItem[];
    dimensions: PriorityDimensions;
    finalScore: number;
  } {
    const contributions = this.calculateScoreContributions(llmResult);
    const { urgencyScore, goalAlignmentScore, sentimentScore } = contributions;

    const breakdown: PriorityBreakdownItem[] = [
      {
        factor: "🔥 Urgency",
        value: contributions.urgencyContribution,
        description: llmResult.urgencyExplanation || "Urgency analysis",
      },
      {
        factor: "🎯 Goal Alignment",
        value: contributions.goalAlignmentContribution,
        description:
          llmResult.goalAlignmentExplanation || "Goal alignment analysis",
      },
      {
        factor: "😊 Sentiment",
        value: contributions.sentimentContribution,
        description: this.getSentimentDescription(sentimentScore),
      },
    ];

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

    const dimensions = this.buildPriorityDimensions(
      llmResult,
      matchedVip,
      urgencyScore,
      goalAlignmentScore,
      sentimentScore,
    );

    return { breakdown, dimensions, finalScore };
  }

  private calculateScoreContributions(llmResult: PriorityLlmResult): {
    urgencyScore: number;
    goalAlignmentScore: number;
    sentimentScore: number;
    urgencyContribution: number;
    goalAlignmentContribution: number;
    sentimentContribution: number;
  } {
    const goalAlignmentScore = llmResult.goalAlignmentScore || 0;
    const sentimentScore = llmResult.sentimentScore ?? 0;
    const urgencyScore = llmResult.urgencyScore || 0;

    const isNewsletterCategory = NEWSLETTER_DISCOUNT.CATEGORY_PATTERNS.some(
      (pattern) => (llmResult.category || "").toLowerCase().includes(pattern),
    );

    let sentimentContribution = 0;
    if (sentimentScore < SENTIMENT_THRESHOLDS.NEGATIVE) {
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

    return {
      urgencyScore,
      goalAlignmentScore,
      sentimentScore,
      urgencyContribution,
      goalAlignmentContribution,
      sentimentContribution,
    };
  }

  private buildPriorityDimensions(
    llmResult: PriorityLlmResult,
    matchedVip: { contextValue: string } | undefined,
    urgencyScore: number,
    goalAlignmentScore: number,
    sentimentScore: number,
  ): PriorityDimensions {
    return {
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
        type: this.getSentimentType(sentimentScore),
        reasons: [],
      },
    };
  }

  private async resolveCategoryAndProtoCategory(
    email: Email,
    thread: EmailThread,
    llmResult: PriorityLlmResult,
    userId: string,
    workerId: string,
  ): Promise<{ finalCategory: string | null; protoCategoryId: string | null }> {
    let finalCategory = llmResult.category || thread.category || null;
    let protoCategoryId: string | null =
      finalCategory === "Other" ? (thread.protoCategoryId ?? null) : null;

    // Defensive check: LLM may have returned a proto-category name directly.
    // Re-route through proto-category logic so counts stay accurate.
    if (
      llmResult.category &&
      llmResult.category !== "Other" &&
      email.emailThreadId
    ) {
      try {
        const directProtoMatch =
          await this.protoCategoriesService.findMatchingProtoCategory(
            userId,
            llmResult.category,
          );
        if (directProtoMatch) {
          const updatedProto =
            await this.protoCategoriesService.assignThreadToProtoCategory(
              directProtoMatch.id,
              email.emailThreadId,
            );
          if (updatedProto.isPromoted) {
            finalCategory = updatedProto.name;
          } else {
            finalCategory = "Other";
            protoCategoryId = updatedProto.id;
          }
          this.logger.log(
            `[Worker ${workerId}] Batch: LLM returned proto-category name directly: "${llmResult.category}" — re-routed`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `[Worker ${workerId}] Batch: Failed defensive proto-category check for "${llmResult.category}":`,
          err,
        );
      }
    }

    if (
      llmResult.category === "Other" &&
      llmResult.protoCategorySuggestion?.name
    ) {
      const resolved = await this.applyProtoSuggestion(
        email,
        llmResult,
        userId,
        workerId,
        finalCategory,
        protoCategoryId,
      );
      ({ finalCategory, protoCategoryId } = resolved);
    }

    return { finalCategory, protoCategoryId };
  }

  private async applyProtoSuggestion(
    email: Email,
    llmResult: PriorityLlmResult,
    userId: string,
    workerId: string,
    finalCategory: string | null,
    protoCategoryId: string | null,
  ): Promise<{ finalCategory: string | null; protoCategoryId: string | null }> {
    const suggestionName = llmResult.protoCategorySuggestion!.name;
    try {
      const matchingFullCategory =
        await this.protoCategoriesService.findMatchingFullCategory(
          userId,
          suggestionName,
        );

      if (matchingFullCategory) {
        this.logger.log(
          `[Worker ${workerId}] Proto category suggestion "${suggestionName}" matches existing category "${matchingFullCategory}", assigning directly`,
        );
        return { finalCategory: matchingFullCategory, protoCategoryId: null };
      }

      const existingProtoCategory =
        await this.protoCategoriesService.findMatchingProtoCategory(
          userId,
          suggestionName,
        );

      if (existingProtoCategory) {
        const updatedProtoCategory =
          await this.protoCategoriesService.assignThreadToProtoCategory(
            existingProtoCategory.id,
            email.emailThreadId,
          );

        if (updatedProtoCategory.isPromoted) {
          this.logger.log(
            `[Worker ${workerId}] Proto category "${updatedProtoCategory.name}" was promoted to real category`,
          );
          return {
            finalCategory: updatedProtoCategory.name,
            protoCategoryId: null,
          };
        }
        this.logger.log(
          `[Worker ${workerId}] Assigned thread to existing proto category "${updatedProtoCategory.name}" (count: ${updatedProtoCategory.emailCount})`,
        );
        return { finalCategory, protoCategoryId: updatedProtoCategory.id };
      }

      const newProtoCategory =
        await this.protoCategoriesService.createAndAssignToThread(
          userId,
          suggestionName,
          llmResult.protoCategorySuggestion!.description || null,
          email.emailThreadId,
        );

      this.logger.log(
        `[Worker ${workerId}] Created new proto category "${newProtoCategory.name}"`,
      );
      return { finalCategory, protoCategoryId: newProtoCategory.id };
    } catch (protoCategoryError) {
      this.logger.warn(
        `[Worker ${workerId}] Failed to process proto category for email ${email.id}:`,
        protoCategoryError,
      );
      return { finalCategory, protoCategoryId };
    }
  }

  private getSentimentType(score: number): string {
    if (score < SENTIMENT_THRESHOLDS.NEGATIVE) {
      return "negative";
    }
    if (score > SENTIMENT_THRESHOLDS.POSITIVE) {
      return "positive";
    }
    return "neutral";
  }

  private getSentimentDescription(score: number): string {
    if (score < SENTIMENT_THRESHOLDS.NEGATIVE) {
      return `Negative sentiment (${score.toFixed(2)})`;
    }
    if (score > SENTIMENT_THRESHOLDS.POSITIVE) {
      return `Positive sentiment (${score.toFixed(2)})`;
    }
    return "Neutral sentiment";
  }

  /**
   * Try to handle priority update incrementally for new emails in existing threads.
   * Returns { handled: true } if incremental update was sufficient, false otherwise.
   */
  private async tryIncrementalAnalysis(
    thread: EmailThread | null,
    email: Email,
    forceRecalculate: boolean | undefined,
    userId: string,
    workerId: string,
    tracker: JobPerformanceTracker,
  ): Promise<{ handled: boolean }> {
    if (!thread || forceRecalculate) {
      return { handled: false };
    }

    const threadPriorityExplanation = thread.priorityExplanation;
    const existingBreakdown = threadPriorityExplanation?.breakdown || [];
    const hasValidBreakdown =
      existingBreakdown.length > 0 &&
      existingBreakdown.some(
        (item) => item.value !== 0 && item.value !== undefined,
      );
    const hasOldStructure =
      threadPriorityExplanation?.breakdown?.some(
        (item) =>
          item.factor === "Base Score" ||
          item.factor === "🤖 AI Analysis" ||
          item.factor === "AI Analysis",
      ) ?? false;
    const hasCalculatingItems = existingBreakdown.some(
      (item) =>
        item.description === "Calculating..." ||
        item.description?.includes("Calculating..."),
    );

    const canUseIncremental =
      hasValidBreakdown &&
      !hasOldStructure &&
      !hasCalculatingItems &&
      thread.category &&
      threadPriorityExplanation?.score !== undefined;

    if (!canUseIncremental) {
      return { handled: false };
    }

    const existingSummary = await this.getThreadSummary(email.emailThreadId);
    if (!existingSummary) {
      return { handled: false };
    }

    const existingState = {
      priorityScore: threadPriorityExplanation?.score || 0,
      urgencyScore: thread.urgencyScore || 0,
      category: thread.category || null,
      summary: existingSummary,
    };

    const newEmailData = {
      from: email.from || "",
      fromName: email.fromName,
      subject: email.subject || "",
      body: email.body || "",
      htmlBody: email.htmlBody,
      receivedAt: email.receivedAt || new Date(),
    };

    const recentThreadEmails = await this.emailsService.getThreadEmails(
      userId,
      email.threadId,
      { limit: 3, order: "DESC" },
    );
    const threadContext =
      this.incrementalAnalysisService.formatThreadContextForIncremental(
        recentThreadEmails
          .filter((e) => e.id !== email.id)
          .map((e) => ({
            from: e.from || "",
            fromName: e.fromName,
            subject: e.subject || "",
            body: e.body || "",
            receivedAt: e.receivedAt || new Date(),
          })),
      );

    tracker.startPhase("incrementalCheck");
    const incrementalResult =
      await this.incrementalAnalysisService.checkIfRecalcNeeded(
        existingState,
        newEmailData,
        threadContext,
        undefined,
        userId,
      );
    tracker.endPhase("incrementalCheck");

    if (incrementalResult.needsFullRecalc) {
      this.logger.log(
        `[Worker ${workerId}] Incremental check: full recalc needed for thread ${email.emailThreadId} - ${incrementalResult.reason}`,
      );
      return { handled: false };
    }

    this.logger.log(
      `[Worker ${workerId}] Incremental check: skipping full recalc for thread ${email.emailThreadId} - ${incrementalResult.reason}`,
    );

    if (incrementalResult.suggestedUrgencyDelta !== 0 && email.emailThreadId) {
      const newUrgencyScore = Math.max(
        0,
        Math.min(
          100,
          (thread.urgencyScore || 0) + incrementalResult.suggestedUrgencyDelta,
        ),
      );
      await this.emailThreadRepository.update(
        { id: email.emailThreadId },
        {
          urgencyScore: newUrgencyScore,
          isProcessingPriority: false,
        },
      );
      this.logger.log(
        `[Worker ${workerId}] Applied incremental urgency delta: ${incrementalResult.suggestedUrgencyDelta} (new score: ${newUrgencyScore})`,
      );
    }

    await this.updateSummaryIncrementally(email, existingSummary, userId);
    tracker.finish();
    return { handled: true };
  }

  /**
   * Get the summary for a thread from any email in the thread.
   */
  private async getThreadSummary(
    emailThreadId: string | undefined,
  ): Promise<string | null> {
    if (!emailThreadId) {
      return null;
    }
    const emailWithSummary = await this.emailRepository.findOne({
      where: { emailThreadId, summary: Not(IsNull()) },
      select: ["summary"],
    });
    return emailWithSummary?.summary || null;
  }

  /**
   * Update the thread summary incrementally using the new email.
   * Also guesses contact type if the sender's contact type is not set.
   */
  private async updateSummaryIncrementally(
    email: Email,
    existingSummary: string,
    userId: string,
  ): Promise<void> {
    try {
      // Check if we need to guess contact type for the sender
      const senderEmail = this.extractEmailAddress(email.from || "");
      let needsContactTypeGuess = false;
      let contact: Contact | null = null;

      if (senderEmail) {
        const emailHash = SearchIndexHelper.hashExact(senderEmail);
        contact = await this.contactRepository.findOne({
          where: { userId, emailHash },
          select: ["id", "contactType", "contactTypeAutoDetected"],
        });

        // Only guess if contact exists but has no type set, or was auto-detected previously
        if (
          contact &&
          (!contact.contactType || contact.contactTypeAutoDetected)
        ) {
          needsContactTypeGuess = true;
        }
      }

      const newEmailData = {
        from: email.from || "",
        fromName: email.fromName,
        subject: email.subject || "",
        body: email.body || "",
        htmlBody: email.htmlBody,
        receivedAt: email.receivedAt || new Date(),
      };

      const result =
        await this.incrementalAnalysisService.updateSummaryIncrementally(
          existingSummary,
          newEmailData,
          false,
          undefined,
          userId,
          needsContactTypeGuess,
        );

      // Update summary if changed
      if (result.updatedSummary && result.updatedSummary !== existingSummary) {
        if (email.emailThreadId) {
          const threadEmails = await this.emailRepository.find({
            where: { emailThreadId: email.emailThreadId },
            select: ["id"],
          });
          const threadEmailIds = threadEmails.map((e) => e.id);

          await this.emailRepository.update(
            { id: In(threadEmailIds) },
            { summary: result.updatedSummary, isProcessingSummary: false },
          );

          this.logger.log(
            `Updated summary incrementally for thread ${email.emailThreadId} (${threadEmailIds.length} emails)`,
          );
        }
      }

      // Update contact type if guessed
      if (
        needsContactTypeGuess &&
        contact &&
        result.suggestedContactType &&
        (result.contactTypeConfidence ?? 0) >=
          LLM_PROCESSOR_CONSTANTS.CONTACT_TYPE_CONFIDENCE_THRESHOLD
      ) {
        if (
          DEFAULT_CONTACT_TYPES.includes(
            result.suggestedContactType as (typeof DEFAULT_CONTACT_TYPES)[number],
          )
        ) {
          await this.contactRepository.update(contact.id, {
            contactType: result.suggestedContactType,
            contactTypeAutoDetected: true,
          });
          this.logger.log(
            `Auto-classified contact ${senderEmail} as ${result.suggestedContactType} (confidence: ${result.contactTypeConfidence})`,
          );
        }
      }
    } catch (error) {
      this.logger.warn("Failed to update summary incrementally:", error);
    }
  }

  /**
   * Extract email address from a "from" field.
   * Handles formats like "Name <email@example.com>" or just "email@example.com"
   */
  private extractEmailAddress(from: string): string {
    if (!from) return "";
    const match = from.match(/<([^>]+)>/);
    if (match) return match[1].toLowerCase().trim();
    return from.toLowerCase().trim();
  }
}
