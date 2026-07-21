import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as os from "os";
import type { Job, PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { CategoryRulesService } from "../category-rules/category-rules.service";
import {
  CategoryRuleMatch,
  CategoryRuleTraceSnapshot,
} from "../category-rules/category-rules.types";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { DebugService } from "../debug/debug.service";
import { DEBUG_FEATURES } from "../debug/debug-feature-names";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { PriorityAnalysisService } from "../llm/priority-analysis.service";
import { LocalModelInferenceService } from "../local-model/local-model-inference.service";
import { PriorityService } from "../priority/priority.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { registerWorker } from "../queue/register-worker";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { shouldBypassSummaryForPriority } from "./batch-email-payloads.helper";
import type { CategoryDecisionAnalyzedEmail } from "./category-decision-trace.types";
import { applyCategoryRuleToResult } from "./category-rule-apply.helper";
import { EmailsService } from "./emails.service";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";
import { LLMPriorityBatchService } from "./llm-priority-batch.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";
import { LocalModelPromotionService } from "./local-model-promotion.service";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

// Preview length constants for log messages
const ORCHESTRATOR_CONSTANTS = {
  SUBSTRING_PREVIEW_LENGTH: 8,
  SUBJECT_PREVIEW_LENGTH: 50,
  THREAD_EMAILS_LIMIT: 15,
} as const;

/**
 * Thin orchestrator for LLM email processing jobs (priority refinement + summarization).
 * Delegates domain logic to focused sub-services (Phase 7b, issue #939).
 *
 * Sub-services:
 * - LLMPriorityResultService: apply/compute priority results, category resolution
 * - LLMPriorityBatchService: batch email priority processing
 * - LLMSummaryProcessorService: summary job processing + incremental analysis
 */
@Injectable()
export class LLMProcessor implements OnModuleInit {
  private readonly logger = new Logger(LLMProcessor.name);
  private readonly priorityConcurrency: number;
  private readonly summaryConcurrency: number;

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    private emailsService: EmailsService,
    private priorityService: PriorityService,
    private priorityCacheService: PriorityCacheService,
    private priorityAnalysisService: PriorityAnalysisService,
    private cloudWatchService: CloudWatchService,
    private protoCategoriesService: ProtoCategoriesService,
    private priorityResultService: LLMPriorityResultService,
    private deterministicPriorityService: LLMDeterministicPriorityService,
    private priorityBatchService: LLMPriorityBatchService,
    private summaryProcessorService: LLMSummaryProcessorService,
    private debugService: DebugService,
    private categoryRulesService: CategoryRulesService,
    private priorityRulesService: PriorityRulesService,
    private readonly userEncryptionService: UserEncryptionService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    // Optional: shadow-compares the local model vs the LLM. No-op unless
    // LOCAL_MODEL_SHADOW_ENABLED is set; never throws.
    @Optional()
    private readonly localModelInferenceService?: LocalModelInferenceService,
    // Optional: confident local-model predictions skip the LLM. No-op unless
    // LOCAL_MODEL_LIVE_ENABLED is set; never throws.
    @Optional()
    private readonly localModelPromotionService?: LocalModelPromotionService,
  ) {
    const cpuCores = os.cpus().length;
    const defaultConcurrency = Math.max(4, cpuCores * 2);

    this.priorityConcurrency = parseInt(
      process.env.LLM_PRIORITY_CONCURRENCY || String(defaultConcurrency),
      10,
    );
    this.summaryConcurrency = parseInt(
      process.env.LLM_SUMMARY_CONCURRENCY || String(defaultConcurrency),
      10,
    );

    this.logger.log(
      `CPU cores: ${cpuCores}, LLM worker concurrency: priority=${this.priorityConcurrency}, summary=${this.summaryConcurrency}`,
    );
  }

  async onModuleInit() {
    this.logger.log(
      `Starting priority refinement worker with concurrency: ${this.priorityConcurrency}`,
    );
    await registerWorker(
      this.boss,
      JOB_NAMES.REFINE_PRIORITY,
      { teamSize: this.priorityConcurrency },
      async (job) => this.handleRefinePriorityJob(job as Job),
    );

    const parallelCalls = parseInt(
      process.env.LLM_SUMMARY_PARALLEL_CALLS || "5",
      10,
    );
    this.logger.log(
      `Starting summary generation worker with ${parallelCalls} parallel LLM calls per batch`,
    );
    // Genuine batch worker: v10 delivers a Job[] of up to `batchSize`, which
    // this handler processes together via processSummaryJobBatch. Calls
    // boss.work directly rather than the single-job registerWorker adapter.
    await this.boss.work(
      JOB_NAMES.GENERATE_SUMMARY,
      { batchSize: parallelCalls },
      async (jobs) => {
        const jobArray = Array.isArray(jobs) ? jobs : [jobs];
        const batchId = `batch-${Date.now()}`;
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.GENERATE_SUMMARY,
          batchId,
          this.cloudWatchService,
        );
        tracker.setMetadata({ batchSize: jobArray.length });
        this.logger.log(
          `[Worker ${batchId}] Processing ${jobArray.length} threads with parallel LLM calls`,
        );
        await this.summaryProcessorService.processSummaryJobBatch(
          jobArray,
          batchId,
          tracker,
        );
      },
    );

    this.logger.log("Starting batch priority refinement worker");
    await registerWorker(
      this.boss,
      JOB_NAMES.REFINE_PRIORITY_BATCH,
      { teamSize: Math.max(2, Math.floor(this.priorityConcurrency / 2)) },
      async (job) => this.handleRefinePriorityBatchJob(job as Job),
    );
  }

  private async fetchEmailForPriority(
    userId: string,
    emailId: string,
    forceRecalculate: boolean | undefined,
    workerId: string,
    tracker: JobPerformanceTracker,
  ): Promise<{ email: Email; thread: EmailThread | null } | null> {
    tracker.startPhase("dataFetch");
    const email = await this.emailsService.getEmailById(userId, emailId);
    if (!email) {
      this.logger.warn(`Email ${emailId} not found`);
      return null;
    }
    let thread: EmailThread | null = null;
    if (email.emailThreadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId },
      });
    }
    const shouldSkip =
      await this.priorityBatchService.shouldSkipPriorityRecalculation(
        thread,
        forceRecalculate,
        email,
        workerId,
        emailId,
      );
    if (shouldSkip) return null;
    return { email, thread };
  }

  private async resolveCategoryHint(
    userId: string,
    emailId: string,
    email: Email,
    workerId: string,
    bodyForPriority: string,
  ): Promise<{
    categoryRuleMatch: CategoryRuleMatch | null;
    bodyWithCategoryHint: string;
    ruleTraceSnapshot: CategoryRuleTraceSnapshot;
  }> {
    const emailMetadata = buildRuleEmailMetadata(email);
    const { match: categoryRuleMatch, snapshot: ruleTraceSnapshot } =
      await this.categoryRulesService.findMatchingRuleWithTrace(
        userId,
        emailMetadata,
      );
    if (categoryRuleMatch) {
      const kindOrType =
        categoryRuleMatch.ruleType ?? categoryRuleMatch.ruleKind;
      this.logger.log(
        `[Worker ${workerId}] Category rule ${categoryRuleMatch.ruleId} matched (${kindOrType}) → category="${categoryRuleMatch.categoryName}" for email ${emailId}`,
      );
    }
    const bodyWithCategoryHint = categoryRuleMatch
      ? `[Category pre-assigned by deterministic rule: "${categoryRuleMatch.categoryName}". Focus on urgency and goal-alignment scoring only.]\n\n${bodyForPriority}`
      : bodyForPriority;
    return { categoryRuleMatch, bodyWithCategoryHint, ruleTraceSnapshot };
  }

  /**
   * After a HIGH-confidence LLM categorisation (with no prior rule match), attempt to
   * persist a deterministic rule so future emails skip the LLM category step.
   * Errors are swallowed — rule generation must never block email processing.
   */
  private async tryGenerateCategoryRule(
    userId: string,
    emailId: string,
    email: Email,
    categoryName: string,
    workerId: string,
  ): Promise<void> {
    const emailMetadata = buildRuleEmailMetadata(email);
    try {
      await this.categoryRulesService.generateCompositeRuleFromEmail(
        userId,
        emailMetadata,
        categoryName,
      );
    } catch (ruleError) {
      this.logger.error(
        `[Worker ${workerId}] Failed to generate category rule for email ${emailId}`,
        ruleError,
      );
    }
  }

  /** Fetch all data needed for priority refinement in parallel. */
  private async fetchPriorityData(
    userId: string,
    email: Email,
  ): Promise<{
    contexts: Awaited<ReturnType<PriorityCacheService["getUserContexts"]>>;
    avgTimeToReply: Awaited<
      ReturnType<PriorityCacheService["getAvgTimeToReply"]>
    >;
    threadEmails: Email[];
    protoCategories: Awaited<
      ReturnType<ProtoCategoriesService["findActiveByUser"]>
    >;
  }> {
    const [contexts, avgTimeToReply, threadEmails, protoCategories] =
      await Promise.all([
        this.priorityCacheService.getUserContexts(userId),
        this.priorityCacheService.getAvgTimeToReply(userId),
        email.threadId
          ? this.emailsService.getThreadEmails(userId, email.threadId, {
              limit: ORCHESTRATOR_CONSTANTS.THREAD_EMAILS_LIMIT,
              order: "ASC",
            })
          : Promise.resolve([] as Email[]),
        this.protoCategoriesService.findActiveByUser(userId),
      ]);
    return { contexts, avgTimeToReply, threadEmails, protoCategories };
  }

  /** Run the LLM call, apply category override, persist result, and attempt rule generation. */
  /** Shadow-compare the local category/priority model against the LLM result.
   * No-op unless wired and enabled; never throws. */
  private async shadowCompareLocalModel(
    userId: string,
    email: Email,
    llmResult: { category?: string },
    finalScore: number,
  ): Promise<void> {
    if (!this.localModelInferenceService) {
      return;
    }
    await this.localModelInferenceService.shadowCompareEmail(
      userId,
      email,
      llmResult.category ?? null,
      finalScore,
    );
  }

  private async runLlmAndPersist(options: {
    userId: string;
    emailId: string;
    email: Email;
    workerId: string;
    tracker: JobPerformanceTracker;
    avgTimeToReply: number;
    threadEmails: Email[];
    contexts: Awaited<ReturnType<PriorityCacheService["getUserContexts"]>>;
    userContext: ReturnType<LLMPriorityBatchService["buildUserContext"]>;
    replyStatus: ReturnType<LLMProcessor["determineThreadReplyStatus"]>;
    bodyForPriority: string;
    bodyForPrioritySource: CategoryDecisionAnalyzedEmail["contentSource"];
  }): Promise<void> {
    const {
      userId,
      emailId,
      email,
      workerId,
      tracker,
      avgTimeToReply,
      threadEmails,
      contexts,
      userContext,
      replyStatus,
      bodyForPriority,
      bodyForPrioritySource,
    } = options;
    const { categoryRuleMatch, bodyWithCategoryHint, ruleTraceSnapshot } =
      await this.resolveCategoryHint(
        userId,
        emailId,
        email,
        workerId,
        bodyForPriority,
      );
    const userTimezone =
      await this.priorityCacheService.getUserTimezone(userId);
    const llmResult = await this.priorityAnalysisService.analyzePriority({
      email: {
        from: email.from || "",
        fromName: email.fromName,
        senderJobTitle: email.senderJobTitle,
        subject: email.subject || "",
        body: bodyWithCategoryHint,
        receivedAt: email.receivedAt ?? undefined,
      },
      userHistory: { averageTimeToReply: avgTimeToReply },
      userId,
      userContext,
      threadInfo: replyStatus,
      preComputedSentimentScore: email.sentimentScore ?? undefined,
      userTimezone,
      // A rule match pins the category (applied below, overriding the LLM), so the
      // prompt can skip the category list + shortlist entirely for these emails.
      categoryPreAssigned: !!categoryRuleMatch,
    });
    // Apply the rule match (overriding the LLM category) and attach the trace
    // snapshot so the category-debug view can show the ORIGINAL outcome (rule
    // matched / no rule matched / matched-but-disabled) instead of only a live
    // re-run. Shared with the batch path so both behave identically.
    applyCategoryRuleToResult(llmResult, categoryRuleMatch, ruleTraceSnapshot);
    llmResult.analyzedContentSource = bodyForPrioritySource;
    tracker.endPhase("llmCall");
    tracker.startPhase("dbUpdate");
    const finalScore = await this.priorityResultService.applyPriorityResult(
      email,
      llmResult,
      contexts,
      userId,
      workerId,
    );
    await this.shadowCompareLocalModel(userId, email, llmResult, finalScore);
    // Shadow-compare any deterministic priority rule against the LLM's score
    // and mine/refresh a rule for this sender. Never skips the LLM yet and never
    // throws (issue: deterministic priority rules, Phase 1).
    await this.priorityRulesService.shadowAndMine(
      userId,
      email,
      finalScore,
      workerId,
    );
    tracker.endPhase("dbUpdate");
    if (!categoryRuleMatch && llmResult.categoryConfidence === "HIGH") {
      // Issue #1671: generate proper 3-condition composite rules (sender + subject + body) instead of legacy single-signal rules.
      await this.tryGenerateCategoryRule(
        userId,
        emailId,
        email,
        llmResult.category,
        workerId,
      );
    }
    this.logger.log(
      `[Worker ${workerId}] Refined priority for email ${emailId} (thread: ${email.threadId?.substring(0, ORCHESTRATOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}...)`,
    );
    await this.debugService.log(
      DEBUG_FEATURES.PRIORITY_ANALYSIS_TRACKING,
      userId,
      {
        threadId: email.threadId ?? null,
        emailCount: threadEmails.length,
        caller: "runFullPriorityRefinement",
        callerFile: "llm-processor.ts",
        emailId,
        jobType: "REFINE_PRIORITY",
      },
    );
  }

  private async runFullPriorityRefinement(options: {
    userId: string;
    emailId: string;
    email: Email;
    thread: EmailThread | null;
    workerId: string;
    tracker: JobPerformanceTracker;
  }): Promise<void> {
    const { userId, emailId, email, thread, workerId, tracker } = options;
    if (email.emailThreadId && thread) {
      await this.emailThreadRepository.update(
        { id: email.emailThreadId },
        { isProcessingPriority: true },
      );
    }

    const { contexts, avgTimeToReply, threadEmails, protoCategories } =
      await this.fetchPriorityData(userId, email);
    tracker.endPhase("dataFetch");
    tracker.startPhase("processing");

    this.priorityService.calculateBasicPriorityScore(email, contexts);
    const replyStatus = this.determineThreadReplyStatus(threadEmails, email);
    const userContext = this.priorityBatchService.buildUserContext(
      contexts,
      protoCategories,
    );
    this.logger.log(
      `[Worker ${workerId}] Analyzing priority for email ${emailId} (thread: ${email.threadId?.substring(0, ORCHESTRATOR_CONSTANTS.SUBSTRING_PREVIEW_LENGTH)}..., subject: ${email.subject?.substring(0, ORCHESTRATOR_CONSTANTS.SUBJECT_PREVIEW_LENGTH)}...)`,
    );

    // QA-related and time-critical emails always use the raw body so the LLM
    // sees the actual verdict / event date — summaries may strip them.
    const useSummary =
      !shouldBypassSummaryForPriority(email.subject, email.body) &&
      Boolean(email.summary?.trim());
    const bodyForPriority = useSummary
      ? (email.summary as string)
      : cleanEmailContent(
          email.body,
          email.htmlBody,
          BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
        );
    const bodyForPrioritySource: CategoryDecisionAnalyzedEmail["contentSource"] =
      useSummary ? "ai-summary" : "cleaned-body";

    tracker.endPhase("processing");
    tracker.startPhase("llmCall");

    await this.runLlmAndPersist({
      userId,
      emailId,
      email,
      workerId,
      tracker,
      avgTimeToReply,
      threadEmails,
      contexts,
      userContext,
      replyStatus,
      bodyForPriority,
      bodyForPrioritySource,
    });
  }

  /**
   * AI-capacity gate for the refine-priority job: once the user's org has
   * exhausted its plan volume (free tier after trial expiry, or the paid cap),
   * skip the refinement entirely so bulk fan-outs (recategorise-triage,
   * accelerate, generate-from-other reclassification, stuck-priority retries)
   * cannot run up LLM spend. Clears the thread's isProcessingPriority flag so
   * the UI doesn't show a stuck "Calculating..." state. Returns true when the
   * job should be skipped.
   */
  private async gateOnAiCapacity(
    userId: string,
    email: Email,
    workerId: string,
  ): Promise<boolean> {
    const capacity = await this.subscriptionsService.checkAiCapacity(userId);
    if (capacity.allowed) return false;
    this.logger.warn(
      `[Worker ${workerId}] Skipping priority refinement for email ${email.id}: AI volume limit reached for user ${userId} (${capacity.percentUsed}% used)`,
    );
    if (email.emailThreadId) {
      await this.emailThreadRepository.update(
        { id: email.emailThreadId },
        { isProcessingPriority: false },
      );
    }
    return true;
  }

  private async handleRefinePriorityJob(job: Job): Promise<void> {
    const { userId, emailId, forceRecalculate } = job.data as {
      userId: string;
      emailId: string;
      forceRecalculate?: boolean;
    };
    const workerId = job.id || "unknown";
    const tracker = new JobPerformanceTracker(
      JOB_NAMES.REFINE_PRIORITY,
      workerId,
      this.cloudWatchService,
    );
    tracker.setMetadata({ userId, emailId, forceRecalculate });
    this.logger.log(
      `[Worker ${workerId}] Starting LLM priority refinement for email ${emailId}`,
    );

    await this.userEncryptionService.withUserKey(userId, async () => {
      try {
        const fetchResult = await this.fetchEmailForPriority(
          userId,
          emailId,
          forceRecalculate,
          workerId,
          tracker,
        );
        if (!fetchResult) return;
        const { email, thread } = fetchResult;

        const blocked = await this.gateOnAiCapacity(userId, email, workerId);
        if (blocked) {
          tracker.finish();
          return;
        }

        const skipped = await this.deterministicPriorityService.tryHandle(
          userId,
          email,
          thread,
          workerId,
        );
        if (skipped) {
          tracker.finish();
          return;
        }

        // No mined rule matched — try the local model. A confident prediction
        // sets category + priority and skips the LLM; otherwise (low confidence)
        // we fall through to the LLM, which is the monitored holdout.
        const skippedByLocalModel = this.localModelPromotionService
          ? await this.localModelPromotionService.tryHandle(
              userId,
              email,
              thread,
              workerId,
            )
          : false;
        if (skippedByLocalModel) {
          tracker.finish();
          return;
        }

        const incrementalResult =
          await this.summaryProcessorService.tryIncrementalAnalysis({
            thread,
            email,
            forceRecalculate,
            userId,
            workerId,
            tracker,
          });
        if (incrementalResult.handled) return;

        await this.runFullPriorityRefinement({
          userId,
          emailId,
          email,
          thread,
          workerId,
          tracker,
        });
        tracker.finish();
      } catch (error) {
        this.logger.error(
          `[Worker ${workerId}] Failed to refine priority for email ${emailId}`,
          error,
        );
        const emailForCleanup = await this.emailsService.getEmailById(
          userId,
          emailId,
        );
        if (emailForCleanup?.emailThreadId) {
          await this.emailThreadRepository.update(
            { id: emailForCleanup.emailThreadId },
            { isProcessingPriority: false },
          );
        }
        tracker.finish(error as Error);
        throw error;
      }
    });
  }

  private async handleRefinePriorityBatchJob(job: Job): Promise<void> {
    const { userId, emailIds } = job.data as {
      userId: string;
      emailIds: string[];
    };
    const workerId = job.id || "unknown";
    const tracker = new JobPerformanceTracker(
      JOB_NAMES.REFINE_PRIORITY_BATCH,
      workerId,
      this.cloudWatchService,
    );
    tracker.setMetadata({ userId, emailId: emailIds.join(",") });
    this.logger.log(
      `[Worker ${workerId}] Starting BATCH priority refinement for ${emailIds.length} emails`,
    );

    await this.userEncryptionService.withUserKey(userId, async () => {
      let threadIdsToLock: string[] = [];
      try {
        threadIdsToLock = await this.priorityBatchService.runBatchRefinement(
          userId,
          emailIds,
          workerId,
          tracker,
        );
      } catch (error) {
        this.logger.error(
          `[Worker ${workerId}] Failed batch priority refinement`,
          error,
        );
        await this.priorityBatchService.cleanupBatchOnError(
          userId,
          emailIds,
          threadIdsToLock,
        );
        tracker.finish(error as Error);
        throw error;
      }
    });
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
            (emailEntry) =>
              emailEntry.from &&
              emailEntry.from.toLowerCase() !== email.from!.toLowerCase(),
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
}
