import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import type { PgBoss } from "pg-boss";
import { In, Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { MAX_PRIORITY_RETRIES } from "../constants/priority-constants";
import { ENV_BOOLEAN_STRING } from "../constants/service-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { DebugService } from "../debug/debug.service";
import { DEBUG_FEATURES } from "../debug/debug-feature-names";
import {
  BatchPriorityResult,
  PriorityAnalysisService,
} from "../llm/priority-analysis.service";
import { LocalModelInferenceService } from "../local-model/local-model-inference.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { getJobPriority } from "../queue/job-priorities";
import { protoCategoryKey } from "../utils/category-key.util";
import { parseCategoryValue } from "../utils/category-name.util";
import { buildBatchEmailPayloads } from "./batch-email-payloads.helper";
import { applyCategoryRuleToResult } from "./category-rule-apply.helper";
import { EmailsService } from "./emails.service";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";
import { LocalModelPromotionService } from "./local-model-promotion.service";
import { PriorityAnalysisFinalizerService } from "./priority-analysis-finalizer.service";
import { shouldSkipPriorityRecalculation } from "./priority-recalc-skip.helper";
import { PrioritySqsDispatchService } from "./priority-sqs-dispatch.service";
import { buildRuleEmailMetadata } from "./rule-email-metadata.helper";

/** Delay in seconds before re-queuing a fallback email for retry. */
const PRIORITY_RETRY_DELAY_SECONDS = 60;

type UserContextInput = Array<{
  contextKey: string;
  contextValue: string;
  explanation?: string | null;
  priority?: number | null;
  categoryKey?: string | null;
}>;
type ProtoCategoryInput = ProtoCategory[];

/**
 * Domain service for batch email priority processing.
 * Handles prepareBatchEmails, applyBatchResults, runBatchRefinement, etc.
 * Extracted from LLMProcessor (Phase 7b, issue #939).
 */
@Injectable()
export class LLMPriorityBatchService {
  private readonly logger = new Logger(LLMPriorityBatchService.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    private readonly emailsService: EmailsService,
    private readonly priorityAnalysisService: PriorityAnalysisService,
    private readonly priorityCacheService: PriorityCacheService,
    private readonly priorityResultService: LLMPriorityResultService,
    private readonly summaryProcessorService: LLMSummaryProcessorService,
    private readonly protoCategoriesService: ProtoCategoriesService,
    private readonly debugService: DebugService,
    private readonly prioritySqsDispatchService: PrioritySqsDispatchService,
    private readonly priorityAnalysisFinalizerService: PriorityAnalysisFinalizerService,
    private readonly deterministicPriorityService: LLMDeterministicPriorityService,
    private readonly priorityRulesService: PriorityRulesService,
    private readonly categoryRulesService: CategoryRulesService,
    // Optional: confident local-model predictions skip the LLM batch. No-op
    // unless LOCAL_MODEL_LIVE_ENABLED is set; never throws.
    @Optional()
    private readonly localModelPromotionService?: LocalModelPromotionService,
    // Optional: shadow-compare the local model vs the LLM on batch-scored
    // threads too, so the category-debug "Local model" panel is populated for
    // them (the single path already does this; the batch path previously did
    // not — hence "hasn't scored this thread yet"). No-op unless shadow is on.
    @Optional()
    private readonly localModelInferenceService?: LocalModelInferenceService,
  ) {}

  /** See {@link shouldSkipPriorityRecalculation} in priority-recalc-skip.helper. */
  async shouldSkipPriorityRecalculation(
    thread: EmailThread | null,
    forceRecalculate: boolean | undefined,
    email: Email,
    workerId: string,
    emailId: string,
  ): Promise<boolean> {
    return shouldSkipPriorityRecalculation({
      emailRepository: this.emailRepository,
      logger: this.logger,
      thread,
      forceRecalculate,
      email,
      workerId,
      emailId,
    });
  }

  async prepareBatchEmails(
    userId: string,
    emailIds: string[],
    workerId: string,
  ): Promise<{
    emailsToProcess: Email[];
    contexts: UserContext[];
    protoCategories: ProtoCategory[];
  }> {
    const [emailResults, contexts, protoCategories] = await Promise.all([
      Promise.all(
        emailIds.map((emailId) =>
          this.emailsService.getEmailById(userId, emailId),
        ),
      ),
      this.priorityCacheService.getUserContexts(userId),
      this.protoCategoriesService.findActiveByUser(userId),
    ]);

    const uniqueThreadIds = [
      ...new Set(
        emailResults
          .filter(Boolean)
          .map((emailEntry) => emailEntry!.emailThreadId)
          .filter(Boolean) as string[],
      ),
    ];
    const threads =
      uniqueThreadIds.length > 0
        ? await this.emailThreadRepository.find({
            where: { id: In(uniqueThreadIds) },
          })
        : [];
    const threadMap = new Map(threads.map((thread) => [thread.id, thread]));
    const preload = await this.deterministicPriorityService.loadPreload(userId);

    const emailsToProcess = (
      await Promise.all(
        emailResults
          .filter(
            (emailEntry): emailEntry is NonNullable<typeof emailEntry> =>
              !!emailEntry,
          )
          .map(async (email) => {
            const thread = email.emailThreadId
              ? (threadMap.get(email.emailThreadId) ?? null)
              : null;
            const shouldSkip = await this.shouldSkipPriorityRecalculation(
              thread,
              false,
              email,
              workerId,
              email.id,
            );
            if (shouldSkip) return null;
            // Deterministic skip: a sender with a learned priority rule (and a
            // category rule) is scored in code and excluded from the LLM batch.
            const handledByRule =
              await this.deterministicPriorityService.tryHandle(
                userId,
                email,
                thread,
                workerId,
                preload,
              );
            if (handledByRule) return null;
            // Local-model skip: a confident PRIORITY prediction sets the score
            // and is excluded from the LLM batch (the category is applied when
            // it resolves, else the thread lands in "Other" and is re-categorised
            // cheaply from its summary later). Only low PRIORITY confidence, a
            // cold-start user, or an error stays in the batch — the LLM holdout.
            const handledByLocalModel = this.localModelPromotionService
              ? await this.localModelPromotionService.tryHandle(
                  userId,
                  email,
                  thread,
                  workerId,
                )
              : false;
            return handledByLocalModel ? null : email;
          }),
      )
    ).filter(
      (emailEntry): emailEntry is NonNullable<typeof emailEntry> =>
        !!emailEntry,
    );

    return {
      emailsToProcess,
      contexts: contexts as UserContext[],
      protoCategories,
    };
  }

  async applyBatchResults(
    workerId: string,
    userId: string,
    emailsToProcess: Email[],
    batchResults: Map<string, BatchPriorityResult>,
    contexts: Array<{ contextKey: string; contextValue: string }>,
  ): Promise<void> {
    for (const email of emailsToProcess) {
      const llmResult = batchResults.get(email.id);
      if (!llmResult) {
        this.logger.warn(
          `[Worker ${workerId}] No batch LLM result for email ${email.id} — skipping DB write to preserve existing priority`,
        );
        continue;
      }
      if (llmResult.isFallback || llmResult.triagePreserved) {
        this.logger.warn(
          `[Worker ${workerId}] Skipping ${llmResult.triagePreserved ? "triage-preserved" : "fallback"} result for email ${email.id} — preserving existing priority score`,
        );
        continue;
      }
      try {
        // Apply deterministic category rules and capture the rule-trace snapshot
        // here too — the single-email path does this in `resolveCategoryHint`,
        // but the batch path (which handles most inbox emails) previously did
        // neither, so category rules were silently ignored and `categoryRuleTrace`
        // was never recorded for batched threads.
        const { match: categoryRuleMatch, snapshot: ruleTraceSnapshot } =
          await this.categoryRulesService.findMatchingRuleWithTrace(
            userId,
            buildRuleEmailMetadata(email),
          );
        applyCategoryRuleToResult(
          llmResult,
          categoryRuleMatch,
          ruleTraceSnapshot,
        );
        const finalScore = await this.priorityResultService.applyPriorityResult(
          email,
          llmResult as Parameters<
            LLMPriorityResultService["applyPriorityResult"]
          >[1],
          contexts,
          userId,
          workerId,
        );
        // Feed batch-scored emails into shadow comparison + rule mining, same
        // as the single refine path.
        await this.priorityRulesService.shadowAndMine(
          userId,
          email,
          finalScore,
          workerId,
        );
        // Record the local-model snapshot for batch-scored threads too (was
        // single-path only → "hasn't scored this thread yet"). Never throws.
        await this.localModelInferenceService?.shadowCompareEmail(
          userId,
          email,
          llmResult.category ?? null,
          finalScore,
        );
      } catch (updateError) {
        this.logger.error(
          `[Worker ${workerId}] Failed to update priority for email ${email.id}:`,
          updateError,
        );
      }
    }
  }

  /** Load a thread map for the given emails so callers can access existing urgency scores. */
  private async loadThreadMapForEmails(
    emails: Email[],
  ): Promise<Map<string, EmailThread>> {
    const threadIds = [
      ...new Set(
        emails.map((email) => email.emailThreadId).filter(Boolean) as string[],
      ),
    ];
    const threads =
      threadIds.length > 0
        ? await this.emailThreadRepository.find({
            where: { id: In(threadIds) },
          })
        : [];
    return new Map(threads.map((thread) => [thread.id, thread]));
  }

  async cleanupBatchOnError(
    userId: string,
    emailIds: string[],
    threadIdsToLock: string[],
  ): Promise<void> {
    if (threadIdsToLock.length > 0) {
      try {
        await this.emailThreadRepository.update(
          { id: In(threadIdsToLock) },
          { isProcessingPriority: false },
        );
      } catch {
        /* Ignore cleanup errors */
      }
      return;
    }
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
        /* Ignore cleanup errors */
      }
    }
  }

  async filterEmailsHandledIncrementally(
    emailsToProcess: Email[],
    userId: string,
    workerId: string,
    tracker: JobPerformanceTracker,
  ): Promise<Email[]> {
    const uniqueThreadIds = [
      ...new Set(
        emailsToProcess.map((email) => email.emailThreadId).filter(Boolean),
      ),
    ] as string[];
    const threads: EmailThread[] =
      uniqueThreadIds.length > 0
        ? await this.emailThreadRepository.find({
            where: { id: In(uniqueThreadIds) },
          })
        : [];
    const threadMap = new Map<string, EmailThread>(
      threads.map((thread) => [thread.id, thread]),
    );

    const needsFullAnalysis: Email[] = [];
    for (const email of emailsToProcess) {
      const thread = email.emailThreadId
        ? (threadMap.get(email.emailThreadId) ?? null)
        : null;
      try {
        const incrementalResult =
          await this.summaryProcessorService.tryIncrementalAnalysis({
            thread,
            email,
            forceRecalculate: false,
            userId,
            workerId,
            tracker,
          });
        if (!incrementalResult.handled) {
          needsFullAnalysis.push(email);
        }
      } catch (error) {
        this.logger.error(
          `[Worker ${workerId}] Incremental analysis failed for email ${email.id}, falling back to full analysis`,
          error,
        );
        needsFullAnalysis.push(email);
      }
    }
    return needsFullAnalysis;
  }

  buildUserContext(
    contexts: UserContextInput,
    protoCategories: ProtoCategoryInput,
  ) {
    return {
      urgentItems: contexts
        .filter((item) => item.contextKey === ContextKey.URGENT)
        .map((item) => ({
          value: item.contextValue,
          explanation: item.explanation || undefined,
        })),
      notUrgentItems: contexts
        .filter((item) => item.contextKey === ContextKey.NOT_IMPORTANT)
        .map((item) => ({
          value: item.contextValue,
          explanation: item.explanation || undefined,
        })),
      goals: contexts
        .filter((item) => item.contextKey === ContextKey.MY_GOALS)
        .map((item) => ({
          value: item.contextValue,
          priority: item.priority || undefined,
        })),
      workingOn: contexts
        .filter((item) => item.contextKey === ContextKey.WORKING_ON)
        .map((item) => ({
          value: item.contextValue,
          priority: item.priority || undefined,
        })),
      dontCare: contexts
        .filter((category) => category.contextKey === ContextKey.DONT_CARE)
        .map((category) => ({ value: category.contextValue })),
      emailCategories: contexts
        .filter((category) => category.contextKey === ContextKey.EMAIL_CATEGORY)
        .map((category) => {
          const { name, description } = parseCategoryValue(
            category.contextValue,
          );
          return {
            name,
            description: description ?? undefined,
            categoryKey: category.categoryKey ?? undefined,
          };
        }),
      protoCategories: protoCategories.map((pc) => ({
        name: pc.name,
        description: pc.description || undefined,
        categoryKey: protoCategoryKey(pc.id),
      })),
    };
  }

  private extractThreadIds(emails: Email[]): string[] {
    return [
      ...new Set(emails.map((email) => email.emailThreadId).filter(Boolean)),
    ] as string[];
  }

  private async unlockIncrementallyHandledThreads(
    workerId: string,
    allEmails: Email[],
    emailsNeedingFullAnalysis: Email[],
  ): Promise<void> {
    const allThreadIds = new Set(
      allEmails.map((email) => email.emailThreadId).filter(Boolean),
    ) as Set<string>;
    const fullAnalysisThreadIds = new Set(
      emailsNeedingFullAnalysis
        .map((email) => email.emailThreadId)
        .filter(Boolean),
    ) as Set<string>;
    const fullyHandledThreadIds = [...allThreadIds].filter(
      (threadId) => !fullAnalysisThreadIds.has(threadId),
    );
    if (fullyHandledThreadIds.length > 0) {
      await this.emailThreadRepository.update(
        { id: In(fullyHandledThreadIds) },
        { isProcessingPriority: false },
      );
      this.logger.log(
        `[Worker ${workerId}] Unlocked ${fullyHandledThreadIds.length} incrementally-handled threads`,
      );
    }
  }

  async runBatchRefinement(
    userId: string,
    emailIds: string[],
    workerId: string,
    tracker: JobPerformanceTracker,
  ): Promise<string[]> {
    tracker.startPhase("dataFetch");
    const { emailsToProcess, contexts, protoCategories } =
      await this.prepareBatchEmails(userId, emailIds, workerId);

    if (emailsToProcess.length === 0) {
      this.logger.log(`[Worker ${workerId}] No emails to process in batch`);
      tracker.finish();
      return [];
    }

    const threadIdsToLock = this.extractThreadIds(emailsToProcess);
    await this.lockThreadsForProcessing(threadIdsToLock);
    tracker.endPhase("dataFetch");
    tracker.startPhase("processing");

    const emailsNeedingFullAnalysis =
      await this.filterEmailsHandledIncrementally(
        emailsToProcess,
        userId,
        workerId,
        tracker,
      );

    await this.unlockIncrementallyHandledThreads(
      workerId,
      emailsToProcess,
      emailsNeedingFullAnalysis,
    );

    if (emailsNeedingFullAnalysis.length === 0) {
      this.logger.log(
        `[Worker ${workerId}] All ${emailsToProcess.length} batch emails handled incrementally`,
      );
      tracker.finish();
      return threadIdsToLock;
    }

    const useLambda =
      process.env.USE_LAMBDA_PRIORITISATION === ENV_BOOLEAN_STRING.TRUE;

    if (useLambda) {
      await this.dispatchViaSqs(workerId, userId, emailsNeedingFullAnalysis, {
        contexts,
        protoCategories,
      });
    } else {
      await this.runLlmAnalysisAndApply(
        workerId,
        userId,
        emailsNeedingFullAnalysis,
        {
          contexts,
          protoCategories,
          tracker,
        },
      );
    }

    this.logger.log(
      `[Worker ${workerId}] Batch priority refinement complete: ${emailsNeedingFullAnalysis.length}/${emailsToProcess.length} emails needed full LLM analysis (path: ${useLambda ? "lambda" : "pgboss"})`,
    );
    tracker.finish();
    return threadIdsToLock;
  }

  /**
   * Dispatch the batch to the Lambda via SQS when USE_LAMBDA_PRIORITISATION=true.
   *
   * All emails in the batch are sent as a single SQS message (totalBatches=1).
   * A PriorityAnalysisRun record is created so PriorityAnalysisFinalizerService
   * can detect and recover from stalled Lambda invocations.
   */
  private async dispatchViaSqs(
    workerId: string,
    userId: string,
    emails: Email[],
    opts: { contexts: UserContext[]; protoCategories: ProtoCategory[] },
  ): Promise<void> {
    const { contexts, protoCategories } = opts;
    const analysisId = randomUUID();

    const threadMap = await this.loadThreadMapForEmails(emails);
    const emailPayloads = buildBatchEmailPayloads(
      emails,
      threadMap,
      this.buildCategoryIdNameMap(contexts),
    );
    const userContext = this.buildUserContext(contexts, protoCategories);
    const userTimezone =
      await this.priorityCacheService.getUserTimezone(userId);
    const enqueueErrors: Array<{ batchNum: number; error: string }> = [];

    await this.prioritySqsDispatchService.enqueueAllBatchesViaSqs(
      [{ batchNum: 0, batchPayload: emailPayloads }],
      {
        userId,
        analysisId,
        emails: emailPayloads,
        userContext,
        totalBatches: 1,
        userTimezone,
      },
      enqueueErrors,
    );

    const threadIds = [
      ...new Set(emails.map((email) => email.emailThreadId).filter(Boolean)),
    ] as string[];

    await this.priorityAnalysisFinalizerService.createRun({
      analysisId,
      userId,
      totalBatches: 1,
      threadIds,
    });

    if (enqueueErrors.length > 0) {
      this.logger.warn(
        `[Worker ${workerId}] ${enqueueErrors.length} SQS enqueue error(s) for analysis ${analysisId}`,
      );
    } else {
      this.logger.log(
        `[Worker ${workerId}] Dispatched ${emails.length} email(s) to Lambda (analysis ${analysisId})`,
      );
    }
  }

  /** categoryId → display name for the user's real (non-proto) categories. */
  private buildCategoryIdNameMap(contexts: UserContext[]): Map<string, string> {
    return new Map(
      contexts
        .filter((ctx) => ctx.contextKey === ContextKey.EMAIL_CATEGORY)
        .map((ctx) => {
          const { name } = parseCategoryValue(ctx.contextValue);
          return [ctx.contextId, name] as const;
        }),
    );
  }

  private async runLlmAnalysisAndApply(
    workerId: string,
    userId: string,
    emailsNeedingFullAnalysis: Email[],
    opts: {
      contexts: UserContext[];
      protoCategories: ProtoCategoryInput;
      tracker: JobPerformanceTracker;
    },
  ): Promise<void> {
    const { contexts, protoCategories, tracker } = opts;
    const threadMapForPayload = await this.loadThreadMapForEmails(
      emailsNeedingFullAnalysis,
    );
    const batchEmails = buildBatchEmailPayloads(
      emailsNeedingFullAnalysis,
      threadMapForPayload,
      this.buildCategoryIdNameMap(contexts),
    );
    tracker.endPhase("processing");
    tracker.startPhase("llmCall");

    const userTimezone =
      await this.priorityCacheService.getUserTimezone(userId);
    const batchResults: Map<string, BatchPriorityResult> =
      await this.priorityAnalysisService.analyzePriorityBatch(
        batchEmails,
        this.buildUserContext(contexts, protoCategories),
        undefined,
        userId,
        userTimezone,
      );
    tracker.endPhase("llmCall");

    await this.applyResultsRequeueAndLog(
      workerId,
      userId,
      emailsNeedingFullAnalysis,
      batchResults,
      { contexts, tracker },
    );

    // Instrument each batch email for redundancy tracking (issue #1595)
    await this.debugService.logBatch(
      DEBUG_FEATURES.PRIORITY_ANALYSIS_TRACKING,
      userId,
      this.buildPriorityDebugPayloads(emailsNeedingFullAnalysis),
    );
  }

  /**
   * Apply batch results, re-queue fallbacks, and log debug entries.
   * Extracted to keep runBatchRefinement within the max-statements limit.
   */
  private async applyResultsRequeueAndLog(
    workerId: string,
    userId: string,
    emailsNeedingFullAnalysis: Email[],
    batchResults: Map<string, BatchPriorityResult>,
    options: { contexts: UserContext[]; tracker: JobPerformanceTracker },
  ): Promise<void> {
    const { contexts, tracker } = options;
    tracker.startPhase("dbUpdate");
    await this.applyBatchResults(
      workerId,
      userId,
      emailsNeedingFullAnalysis,
      batchResults,
      contexts,
    );
    tracker.endPhase("dbUpdate");

    await this.requeueFallbackEmails(
      workerId,
      userId,
      emailsNeedingFullAnalysis,
      batchResults,
    );
  }

  private async lockThreadsForProcessing(
    threadIdsToLock: string[],
  ): Promise<void> {
    if (threadIdsToLock.length > 0) {
      await this.emailThreadRepository.update(
        { id: In(threadIdsToLock) },
        { isProcessingPriority: true },
      );
    }
  }

  private buildPriorityDebugPayloads(emails: Email[]): Array<{
    threadId: string | null;
    emailCount: number;
    caller: string;
    callerFile: string;
    emailId: string;
    jobType: string;
  }> {
    const threadEmailCountMap = new Map<string, number>();
    for (const email of emails) {
      if (email.threadId) {
        threadEmailCountMap.set(
          email.threadId,
          (threadEmailCountMap.get(email.threadId) ?? 0) + 1,
        );
      }
    }
    return emails.map((email) => ({
      threadId: email.threadId ?? null,
      emailCount: email.threadId
        ? (threadEmailCountMap.get(email.threadId) ?? 1)
        : 1,
      caller: "runBatchRefinement",
      callerFile: "llm-priority-batch.service.ts",
      emailId: email.id,
      jobType: "REFINE_PRIORITY_BATCH",
    }));
  }

  /**
   * Re-queue individual refine-priority jobs for any emails that received a
   * fallback (isFallback=true) result during batch analysis.  This prevents
   * emails from getting permanently stuck at score=0 when an LLM batch call
   * fails.  Each email is allowed at most MAX_PRIORITY_RETRIES attempts before
   * we give up (tracked via `priorityRetryCount` on the thread).
   */
  private async requeueFallbackEmails(
    workerId: string,
    userId: string,
    emailsNeedingFullAnalysis: Email[],
    batchResults: Map<string, BatchPriorityResult>,
  ): Promise<void> {
    const fallbackEmails = emailsNeedingFullAnalysis.filter((email) => {
      const result = batchResults.get(email.id);
      return !result || result.isFallback;
    });

    if (fallbackEmails.length === 0) return;

    this.logger.warn(
      `[Worker ${workerId}] ${fallbackEmails.length} email(s) received fallback results — scheduling individual retries`,
    );

    // Batch-load all threads upfront to avoid N+1 queries
    const threadIds = [
      ...new Set(
        fallbackEmails
          .map((email) => email.emailThreadId)
          .filter((id): id is string => !!id),
      ),
    ];
    const threads = await this.emailThreadRepository.find({
      where: { id: In(threadIds) },
      select: {
        id: true,
        priorityRetryCount: true,
      },
    });
    const threadMap = new Map(threads.map((thread) => [thread.id, thread]));

    for (const email of fallbackEmails) {
      try {
        // Check retry count on the thread to avoid infinite loops
        if (email.emailThreadId) {
          const thread = threadMap.get(email.emailThreadId);

          if (thread && thread.priorityRetryCount >= MAX_PRIORITY_RETRIES) {
            this.logger.warn(
              `[Worker ${workerId}] Email ${email.id} (thread ${email.emailThreadId}) has reached MAX_PRIORITY_RETRIES (${MAX_PRIORITY_RETRIES}) — giving up`,
            );
            continue;
          }
        }

        // Send job first; only increment retry count after successful enqueue
        await this.boss.send(
          JOB_NAMES.REFINE_PRIORITY,
          { userId, emailId: email.id, isRetry: true },
          {
            priority: getJobPriority(
              JOB_NAMES.REFINE_PRIORITY_BACKGROUND,
              false,
            ),
            singletonKey: `refine-priority-retry-${email.id}`,
            startAfter: new Date(
              Date.now() + PRIORITY_RETRY_DELAY_SECONDS * MILLISECONDS.SECOND,
            ),
          },
        );

        // Increment retry count only after successful boss.send()
        if (email.emailThreadId) {
          await this.emailThreadRepository.increment(
            { id: email.emailThreadId },
            "priorityRetryCount",
            1,
          );
        }

        this.logger.log(
          `[Worker ${workerId}] Queued retry for email ${email.id} (starts in ${PRIORITY_RETRY_DELAY_SECONDS}s)`,
        );
      } catch (err) {
        this.logger.error(
          `[Worker ${workerId}] Failed to queue retry for email ${email.id}:`,
          err,
        );
      }
    }
  }
}
