import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import type { PgBoss } from "pg-boss";
import { In, Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { ENV_BOOLEAN_STRING } from "../constants/service-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { DebugService } from "../debug/debug.service";
import { PriorityAnalysisService } from "../llm/priority-analysis.service";
import { LocalModelInferenceService } from "../local-model/local-model-inference.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { EmailsService } from "./emails.service";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";
import { LocalModelPromotionService } from "./local-model-promotion.service";
import { PriorityAnalysisFinalizerService } from "./priority-analysis-finalizer.service";
import { PriorityBatchAnalysisRunner } from "./priority-batch-analysis-runner";
import { PRIORITY_BATCH_MESSAGE_VERSION } from "./priority-batch-lambda-message";
import { shouldSkipPriorityRecalculation } from "./priority-recalc-skip.helper";
import { PrioritySqsDispatchService } from "./priority-sqs-dispatch.service";
import { StaleRuleCategoryService } from "./stale-rule-category.service";

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
    private readonly staleRuleCategoryService: StaleRuleCategoryService,
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
  ) {
    this.analysisRunner = new PriorityBatchAnalysisRunner({
      boss,
      emailRepository,
      emailThreadRepository,
      protoCategoriesService,
      priorityAnalysisService,
      priorityCacheService,
      priorityResultService,
      summaryProcessorService,
      debugService,
      priorityRulesService,
      categoryRulesService,
      localModelInferenceService,
      logger: this.logger,
    });
  }

  /** The slow half of the batch (summaries, analysis, apply), shared with the Lambda. */
  private readonly analysisRunner: PriorityBatchAnalysisRunner;

  async applyBatchResults(
    ...args: Parameters<PriorityBatchAnalysisRunner["applyBatchResults"]>
  ): Promise<void> {
    return this.analysisRunner.applyBatchResults(...args);
  }

  buildUserContext(
    ...args: Parameters<PriorityBatchAnalysisRunner["buildUserContext"]>
  ): ReturnType<PriorityBatchAnalysisRunner["buildUserContext"]> {
    return this.analysisRunner.buildUserContext(...args);
  }

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
    /** Emails whose thread's stale rule label was released — they skip triage. */
    staleRuleReleasedEmailIds: Set<string>;
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
    const staleRuleReleasedEmailIds = new Set<string>();

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
            const released = await this.staleRuleCategoryService.release({
              userId,
              email,
              thread,
              workerId,
              preloadedRules: preload?.categoryRules,
            });
            if (released) staleRuleReleasedEmailIds.add(email.id);
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
      staleRuleReleasedEmailIds,
    };
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
    const {
      emailsToProcess,
      contexts,
      protoCategories,
      staleRuleReleasedEmailIds,
    } = await this.prepareBatchEmails(userId, emailIds, workerId);

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

    const dispatched =
      useLambda &&
      (await this.dispatchToLambda(
        workerId,
        userId,
        emailsNeedingFullAnalysis,
        staleRuleReleasedEmailIds,
      ));
    if (!dispatched) {
      await this.analysisRunner.analyseAndApply(
        workerId,
        userId,
        emailsNeedingFullAnalysis,
        {
          contexts,
          protoCategories,
          tracker,
          forceFullAnalysisEmailIds: staleRuleReleasedEmailIds,
        },
      );
    }

    this.logger.log(
      `[Worker ${workerId}] Batch priority refinement complete: ${emailsNeedingFullAnalysis.length}/${emailsToProcess.length} emails needed full LLM analysis (path: ${dispatched ? "lambda" : "worker"})`,
    );
    tracker.finish();
    return threadIdsToLock;
  }

  /**
   * Hand the slow half of the batch (summaries, analysis, apply) to the
   * prioritisation Lambda when USE_LAMBDA_PRIORITISATION=true. The run record
   * lets PriorityAnalysisFinalizerService unlock the threads if the Lambda
   * never completes. Returns false when the message couldn't be sent, so the
   * caller processes the batch here instead of leaving its threads locked.
   */
  private async dispatchToLambda(
    workerId: string,
    userId: string,
    emails: Email[],
    forceFullAnalysisEmailIds: ReadonlySet<string>,
  ): Promise<boolean> {
    const analysisId = randomUUID();
    const threadIds = [
      ...new Set(emails.map((email) => email.emailThreadId).filter(Boolean)),
    ] as string[];
    await this.priorityAnalysisFinalizerService.createRun({
      analysisId,
      userId,
      totalBatches: 1,
      threadIds,
    });
    const emailIds = emails.map((email) => email.id);
    const forceFullIds = emailIds.filter((id) =>
      forceFullAnalysisEmailIds.has(id),
    );
    const messageId = await this.prioritySqsDispatchService.dispatchBatch({
      version: PRIORITY_BATCH_MESSAGE_VERSION,
      userId,
      analysisId,
      emailIds,
      ...(forceFullIds.length > 0
        ? { forceFullAnalysisEmailIds: forceFullIds }
        : {}),
    });
    if (!messageId) return false;
    this.logger.log(
      `[Worker ${workerId}] Dispatched ${emails.length} email(s) to the prioritisation Lambda (analysis ${analysisId}, message ${messageId})`,
    );
    return true;
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
}
