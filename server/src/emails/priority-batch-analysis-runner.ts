import type { Logger } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import { In, Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { CategoryRuleMatch } from "../category-rules/category-rules.types";
import { JOB_NAMES } from "../constants/job-names";
import { PRIORITY_BATCH_LLM_CONCURRENCY } from "../constants/llm-constants";
import { MAX_PRIORITY_RETRIES } from "../constants/priority-constants";
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
  buildEmailCategoryInputs,
  buildProtoCategoryInputs,
} from "../llm/category-context-input.helper";
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
import { parseCategoryValue } from "../utils/category-name.util";
import { mapWithConcurrency } from "../utils/concurrency.util";
import { buildBatchEmailPayloads } from "./batch-email-payloads.helper";
import { applyCategoryRuleToResult } from "./category-rule-apply.helper";
import { groupEmailsByThread } from "./group-emails-by-thread.helper";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";
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

/** Runs `work` while holding a per-user lock (see PriorityBatchAnalysisRunnerDeps). */
export type ApplySerialiser = <Result>(
  userId: string,
  work: () => Promise<Result>,
) => Promise<Result>;

export interface PriorityBatchAnalysisRunnerDeps {
  boss: Pick<PgBoss, "send">;
  emailRepository: Repository<Email>;
  emailThreadRepository: Repository<EmailThread>;
  protoCategoriesService: Pick<ProtoCategoriesService, "findActiveByUser">;
  priorityAnalysisService: PriorityAnalysisService;
  priorityCacheService: PriorityCacheService;
  priorityResultService: LLMPriorityResultService;
  summaryProcessorService: LLMSummaryProcessorService;
  debugService: DebugService;
  priorityRulesService: PriorityRulesService;
  categoryRulesService: CategoryRulesService;
  localModelInferenceService?: LocalModelInferenceService;
  logger: Logger;
  /**
   * Serialises the apply step per user. Proto-category find-or-create and
   * promotion are read-then-write (and their unique index is on ciphertext, so
   * it can't catch duplicates), so concurrent batches for one user must not
   * apply at the same time. The Lambda fans one user's batches out across
   * invocations and passes a Postgres advisory lock; omitted, apply runs as-is.
   */
  serialiseApply?: ApplySerialiser;
}

/**
 * The slow half of a refine-priority batch: refresh thread summaries, run the
 * categorise + prioritise analysis, and apply the results (category rules,
 * priority/category persistence, proto categories, follow-up jobs). It runs in
 * the worker (via LLMPriorityBatchService) and, built by hand without NestJS
 * DI, in the prioritisation Lambda, so the two can never diverge.
 */
export class PriorityBatchAnalysisRunner {
  private readonly boss: Pick<PgBoss, "send">;
  private readonly emailRepository: Repository<Email>;
  private readonly emailThreadRepository: Repository<EmailThread>;
  private readonly protoCategoriesService: Pick<
    ProtoCategoriesService,
    "findActiveByUser"
  >;
  private readonly priorityAnalysisService: PriorityAnalysisService;
  private readonly priorityCacheService: PriorityCacheService;
  private readonly priorityResultService: LLMPriorityResultService;
  private readonly summaryProcessorService: LLMSummaryProcessorService;
  private readonly debugService: DebugService;
  private readonly priorityRulesService: PriorityRulesService;
  private readonly categoryRulesService: CategoryRulesService;
  private readonly localModelInferenceService?: LocalModelInferenceService;
  private readonly logger: Logger;
  private readonly serialiseApply: ApplySerialiser;

  constructor(deps: PriorityBatchAnalysisRunnerDeps) {
    this.boss = deps.boss;
    this.emailRepository = deps.emailRepository;
    this.emailThreadRepository = deps.emailThreadRepository;
    this.protoCategoriesService = deps.protoCategoriesService;
    this.priorityAnalysisService = deps.priorityAnalysisService;
    this.priorityCacheService = deps.priorityCacheService;
    this.priorityResultService = deps.priorityResultService;
    this.summaryProcessorService = deps.summaryProcessorService;
    this.debugService = deps.debugService;
    this.priorityRulesService = deps.priorityRulesService;
    this.categoryRulesService = deps.categoryRulesService;
    this.localModelInferenceService = deps.localModelInferenceService;
    this.logger = deps.logger;
    this.serialiseApply = deps.serialiseApply ?? ((_userId, work) => work());
  }

  /**
   * The Lambda entry point: loads the batch's emails, the user's contexts and
   * active proto categories, then runs {@link analyseAndApply}. Must run inside
   * UserEncryptionService.withUserKey so encrypted columns decrypt.
   */
  async analyseAndApplyByIds(
    workerId: string,
    userId: string,
    emailIds: string[],
    tracker: JobPerformanceTracker,
  ): Promise<void> {
    const [emails, contexts, protoCategories] = await Promise.all([
      this.emailRepository.find({ where: { id: In(emailIds), userId } }),
      this.priorityCacheService.getUserContexts(userId),
      this.protoCategoriesService.findActiveByUser(userId),
    ]);
    if (emails.length === 0) {
      this.logger.warn(
        `[Worker ${workerId}] None of the ${emailIds.length} batch emails exist any more — nothing to analyse`,
      );
      return;
    }
    await this.analyseAndApply(workerId, userId, emails, {
      contexts: contexts as UserContext[],
      protoCategories,
      tracker,
    });
  }

  async analyseAndApply(
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
    await this.refreshThreadSummaries(
      emailsNeedingFullAnalysis,
      userId,
      workerId,
    );
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
   * Refresh each thread's FULL summary to include the latest message BEFORE
   * building the batch payloads (which embed the summary for the shortlist +
   * categoriser), so categorisation reflects the newest message. No-op when
   * already fresh; the later background-summary job then skips.
   *
   * Threads run concurrently, but a thread's own emails stay sequential and in
   * batch order: each refresh overwrites the summary on every email of the
   * thread, so racing them would make the surviving summary nondeterministic.
   * ensureThreadSummaryFresh never throws, so one failure can't stop the rest.
   */
  private async refreshThreadSummaries(
    emails: Email[],
    userId: string,
    workerId: string,
  ): Promise<void> {
    await mapWithConcurrency(
      groupEmailsByThread(emails),
      PRIORITY_BATCH_LLM_CONCURRENCY,
      async (threadEmails) => {
        for (const email of threadEmails) {
          await this.summaryProcessorService.ensureThreadSummaryFresh(
            email,
            userId,
            workerId,
          );
        }
      },
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
    await this.serialiseApply(userId, () =>
      this.applyBatchResults(
        workerId,
        userId,
        emailsNeedingFullAnalysis,
        batchResults,
        contexts,
      ),
    );
    tracker.endPhase("dbUpdate");

    await this.requeueFallbackEmails(
      workerId,
      userId,
      emailsNeedingFullAnalysis,
      batchResults,
    );
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
        // Bring the (dominant) batch path to parity with the single-email path:
        // when the LLM was HIGH-confident and no deterministic rule already
        // matched, enqueue a low-priority job to author a composite category
        // rule so future emails skip the LLM category step. Rule generation is
        // deliberately NOT run inline here — it stays off the batch hot path.
        await this.enqueueCategoryRuleGeneration(
          workerId,
          userId,
          email,
          llmResult,
          categoryRuleMatch,
        );
      } catch (updateError) {
        this.logger.error(
          `[Worker ${workerId}] Failed to update priority for email ${email.id}:`,
          updateError,
        );
      }
    }
  }

  /**
   * Mirror the single-email path's rule-generation gate for a batch-scored
   * email: when no deterministic rule matched but the LLM was HIGH-confident
   * about its category, enqueue a low-priority `generate-category-rule` job so
   * a composite rule is authored off the batch hot path. Logs one line per
   * email — either the enqueue, or (when no rule matched and confidence wasn't
   * HIGH) why generation was skipped — so "why no new rules" is answerable from
   * batch logs too. A rule match is the quiet, expected case and is not logged.
   */
  private async enqueueCategoryRuleGeneration(
    workerId: string,
    userId: string,
    email: Email,
    llmResult: BatchPriorityResult,
    categoryRuleMatch: CategoryRuleMatch | null,
  ): Promise<void> {
    if (!categoryRuleMatch && llmResult.categoryConfidence === "HIGH") {
      await this.boss.send(
        JOB_NAMES.GENERATE_CATEGORY_RULE,
        { userId, emailId: email.id, categoryName: llmResult.category },
        {
          priority: getJobPriority(JOB_NAMES.GENERATE_CATEGORY_RULE, false),
          singletonKey: `generate-category-rule-${email.id}`,
        },
      );
      this.logger.log(
        `[Worker ${workerId}] Enqueued generate-category-rule for email ${email.id} (category="${llmResult.category}", confidence=HIGH)`,
      );
      return;
    }
    if (!categoryRuleMatch) {
      this.logger.log(
        `[Worker ${workerId}] Not attempting category-rule generation for email ${email.id} — ` +
          `LLM category confidence=${llmResult.categoryConfidence ?? "n/a"} (need HIGH), category="${llmResult.category}"`,
      );
    }
  }

  /** Load a thread map for the given emails so callers can access existing urgency scores. */
  async loadThreadMapForEmails(
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
      emailCategories: buildEmailCategoryInputs(contexts),
      protoCategories: buildProtoCategoryInputs(protoCategories),
    };
  }

  /** categoryId → display name for the user's real (non-proto) categories. */
  buildCategoryIdNameMap(contexts: UserContext[]): Map<string, string> {
    return new Map(
      contexts
        .filter((ctx) => ctx.contextKey === ContextKey.EMAIL_CATEGORY)
        .map((ctx) => {
          const { name } = parseCategoryValue(ctx.contextValue);
          return [ctx.contextId, name] as const;
        }),
    );
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
