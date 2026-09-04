import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS, SECONDS } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { ContextKey } from "../database/entities/user-context.entity";
import type { DiscoveryThreadStub } from "../llm/llm-discover-user-context";
import { getJobPriority } from "../queue/job-priorities";
import { getErrorMessage } from "../types/common";
import { UsersService } from "../users/users.service";
import { parseCategoryName } from "../utils/category-name.util";
import { writeAnalysisLog } from "./context-analysis-logger";
import { ContextCrudService } from "./context-crud.service";
import { ContextEnqueueService } from "./context-enqueue.service";
import { classifyContextAnalysisError } from "./context-error-handler";
import { ContextGmailDataService } from "./context-gmail-data.service";

type AnalysisStats = {
  totalThreads: number;
  outboundEmails: number;
  threadsNeverOpened: number;
  threadsReadButNotReplied: number;
  vipContactsEvaluated: number;
};

const EMPTY_ANALYSIS_STATS: AnalysisStats = {
  totalThreads: 0,
  outboundEmails: 0,
  threadsNeverOpened: 0,
  threadsReadButNotReplied: 0,
  vipContactsEvaluated: 0,
};

const FETCHING_THREADS_STATUS = "Fetching recent threads...";
// The finalizer re-queues itself while batches are still running, so a short
// initial delay beats always waiting for the slowest batch.
const FINALIZATION_DELAY_MS = 5 * MILLISECONDS.SECOND;

/**
 * Slim context discovery — the single path behind onboarding's AI-training
 * step and the manual "Analyze" action. Samples the user's recent received
 * threads, fans them out as cheap Nova discovery batches (categories + VIPs
 * only) and queues finalization. Everything else the retired mega prompt used
 * to do inline — priority habits, writing style, Q&A — now comes from the
 * per-email pipeline or low-priority background jobs.
 */
@Injectable()
export class ContextAnalysisOrchestratorService {
  private readonly logger = new Logger(ContextAnalysisOrchestratorService.name);

  constructor(
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
    private usersService: UsersService,
    private gmailDataService: ContextGmailDataService,
    private crudService: ContextCrudService,
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private contextEnqueueService: ContextEnqueueService,
  ) {}

  async analyzeAndLearnFromEmails(
    userId: string,
    analysisId?: string,
  ): Promise<void> {
    const logSuffix = analysisId ? ` with analysis ID ${analysisId}` : "";
    this.logger.log(
      `[CONTEXT-DISCOVERY] ===== Starting context discovery for user ${userId}${logSuffix} =====`,
    );
    writeAnalysisLog(
      `===== Starting context discovery for user ${userId}${logSuffix} =====`,
      "log",
    );

    const analysisRecord = await this.initializeAnalysisRecord(
      userId,
      analysisId,
    );

    try {
      await this.runDiscoveryPipeline(userId, analysisRecord);
    } catch (pipelineError) {
      await this.handleAnalysisError(userId, analysisRecord, pipelineError);
      throw pipelineError;
    }
  }

  private async initializeAnalysisRecord(
    userId: string,
    analysisId?: string,
  ): Promise<ContextAnalysis> {
    if (analysisId) {
      const record = await this.contextAnalysisRepository.findOne({
        where: { id: analysisId, userId },
      });
      if (!record) {
        throw new Error(
          `Analysis record ${analysisId} not found for user ${userId}`,
        );
      }
      return record;
    }

    const existing = await this.contextAnalysisRepository.findOne({
      where: { userId, status: "running" },
      order: { createdAt: "DESC" },
    });
    if (existing) {
      return existing;
    }

    const record = this.contextAnalysisRepository.create({
      userId,
      status: "running",
      progress: 0,
      total: 100,
      stats: { ...EMPTY_ANALYSIS_STATS },
    });
    return this.contextAnalysisRepository.save(record);
  }

  private async runDiscoveryPipeline(
    userId: string,
    analysisRecord: ContextAnalysis,
  ): Promise<void> {
    await this.usersService.update(userId, { scanProgress: 0, scanTotal: 100 });

    const user = await this.usersService.findOne(userId);
    const userEmail = user?.email ? user.email.toLowerCase() : null;

    const threadIds = await this.sampleRecentThreadIds(userId, analysisRecord);
    if (threadIds.length === 0) {
      await this.completeWithNoThreads(userId, analysisRecord);
      return;
    }

    await this.resetStatsForAnalysis(analysisRecord, threadIds.length);
    const { existingCategories, existingVipContacts } =
      await this.loadExistingContextNames(userId);

    const { batches, jobResults, enqueueErrors } =
      await this.contextEnqueueService.buildAndQueueDiscoveryBatches({
        userId,
        analysisRecordId: analysisRecord.id,
        threadIds,
        userEmail,
        existingCategories,
        existingVipContacts,
        batchSize: QUERY_LIMITS.DISCOVERY_BATCH_SIZE,
      });
    if (enqueueErrors.length > 0) {
      this.logger.error(
        `[CONTEXT-DISCOVERY] Enqueue errors: ${JSON.stringify(enqueueErrors)}`,
      );
    }

    const successfulEnqueues = jobResults.filter(
      (result) => result.jobId !== null,
    ).length;
    if (batches.length === 0 || successfulEnqueues === 0) {
      await this.failAnalysis(
        analysisRecord,
        "No discovery batches could be enqueued. Analysis cannot proceed.",
      );
    }

    await this.persistBatchState(analysisRecord, jobResults, batches);
    await this.queueBackgroundLearning(userId);
    await this.queueFinalizationJob(userId, analysisRecord, {
      totalBatches: batches.length,
      totalThreads: threadIds.length,
      userEmail,
    });

    this.logger.log(
      `[CONTEXT-DISCOVERY] Dispatched ${successfulEnqueues}/${batches.length} batches over ${threadIds.length} threads for user ${userId}`,
    );
  }

  /**
   * The most recent received threads, capped at the discovery sample size.
   * Threads the user started are dropped later when stubs are built.
   */
  private async sampleRecentThreadIds(
    userId: string,
    analysisRecord: ContextAnalysis,
  ): Promise<string[]> {
    analysisRecord.fetchingStatus = FETCHING_THREADS_STATUS;
    analysisRecord.fetchedGeneralCount = 0;
    analysisRecord.fetchedSentCount = 0;
    await this.contextAnalysisRepository.save(analysisRecord);

    const now = new Date();
    const lookbackStart = new Date(
      now.getTime() - QUERY_LIMITS.DISCOVERY_LOOKBACK_DAYS * MILLISECONDS.DAY,
    );
    const threadIds = await this.gmailDataService.getThreadIdsFromProvider(
      userId,
      lookbackStart,
      now,
      QUERY_LIMITS.DISCOVERY_SAMPLE_THREADS,
    );

    analysisRecord.fetchingStatus = null;
    analysisRecord.fetchedGeneralCount = threadIds.length;
    analysisRecord.stats = {
      ...(analysisRecord.stats || { ...EMPTY_ANALYSIS_STATS }),
      uniqueThreads: threadIds.length,
    };
    await this.contextAnalysisRepository.save(analysisRecord);

    this.logger.log(
      `[CONTEXT-DISCOVERY] Sampled ${threadIds.length} recent threads (last ${QUERY_LIMITS.DISCOVERY_LOOKBACK_DAYS} days) for user ${userId}`,
    );
    return threadIds;
  }

  private async loadExistingContextNames(userId: string): Promise<{
    existingCategories: string[];
    existingVipContacts: string[];
  }> {
    const existingContext = await this.crudService.getUserContext(userId);
    return {
      existingCategories: existingContext
        .filter((ctx) => ctx.contextKey === ContextKey.EMAIL_CATEGORY)
        .map((ctx) => parseCategoryName(ctx.contextValue)),
      existingVipContacts: existingContext
        .filter((ctx) => ctx.contextKey === ContextKey.VIP_CONTACT)
        .map((ctx) => ctx.contextValue),
    };
  }

  private async persistBatchState(
    analysisRecord: ContextAnalysis,
    jobResults: Array<{ jobId: string | null; batchNum: number }>,
    batches: DiscoveryThreadStub[][],
  ): Promise<void> {
    const batchJobIds: Record<number, string | null> = {};
    for (const result of jobResults) {
      batchJobIds[result.batchNum] = result.jobId;
    }
    // Stubs are a few KB per batch, so keeping them lets the progress check
    // re-queue a batch that never ran instead of stranding the analysis.
    const batchPayloadsForRetry: Record<number, DiscoveryThreadStub[]> = {};
    for (const [batchNum, threads] of batches.entries()) {
      batchPayloadsForRetry[batchNum] = threads;
    }

    analysisRecord.stats = {
      ...(analysisRecord.stats || { ...EMPTY_ANALYSIS_STATS }),
      totalBatches: batches.length,
      batchJobIds,
      batchPayloadsForRetry,
    };
    await this.contextAnalysisRepository.save(analysisRecord);
    writeAnalysisLog(
      `Saved analysis stats: totalBatches=${batches.length}`,
      "log",
    );
  }

  /**
   * Writing style and Q&A are learned from sent mail gradually, off the
   * onboarding critical path. Best-effort: a failed enqueue must not fail the
   * discovery run, and the writing-style cron picks up new sent mail anyway.
   */
  private async queueBackgroundLearning(userId: string): Promise<void> {
    try {
      await this.boss.send(
        JOB_NAMES.LEARN_WRITING_STYLE_FROM_SENT,
        { userId },
        {
          priority: getJobPriority(JOB_NAMES.LEARN_WRITING_STYLE_FROM_SENT),
          singletonKey: `learn-writing-style-${userId}`,
        },
      );
      await this.boss.send(
        JOB_NAMES.LEARN_QA_FROM_SENT,
        { userId },
        {
          priority: getJobPriority(JOB_NAMES.LEARN_QA_FROM_SENT),
          singletonKey: `learn-qa-from-sent-${userId}`,
        },
      );
    } catch (error) {
      this.logger.warn(
        `[CONTEXT-DISCOVERY] Failed to queue background learning for user ${userId} (non-fatal): ${getErrorMessage(error)}`,
      );
    }
  }

  private async queueFinalizationJob(
    userId: string,
    analysisRecord: ContextAnalysis,
    params: {
      totalBatches: number;
      totalThreads: number;
      userEmail: string | null;
    },
  ): Promise<void> {
    const { totalBatches, totalThreads, userEmail } = params;
    await this.boss.send(
      JOB_NAMES.FINALIZE_CONTEXT_ANALYSIS,
      {
        userId,
        analysisRecordId: analysisRecord.id,
        totalBatches,
        threadsInRange: totalThreads,
        sentEmailsData: 0,
        analysisStats: { ...EMPTY_ANALYSIS_STATS, totalThreads },
        userEmail: userEmail || undefined,
      },
      {
        priority: getJobPriority(JOB_NAMES.FINALIZE_CONTEXT_ANALYSIS, false),
        singletonKey: `finalize-context-analysis-${analysisRecord.id}`,
        singletonSeconds: SECONDS.HOUR,
        startAfter: new Date(Date.now() + FINALIZATION_DELAY_MS),
      },
    );
    this.logger.log(
      `[CONTEXT-DISCOVERY] Finalization job queued for analysis ${analysisRecord.id} (${totalBatches} batches)`,
    );
  }

  private async failAnalysis(
    analysisRecord: ContextAnalysis,
    message: string,
  ): Promise<never> {
    analysisRecord.status = "failed";
    analysisRecord.errorMessage = message;
    await this.contextAnalysisRepository.save(analysisRecord);
    throw new Error(message);
  }

  private async handleAnalysisError(
    userId: string,
    analysisRecord: ContextAnalysis | undefined,
    error: unknown,
  ): Promise<void> {
    const errorMessage = getErrorMessage(error);
    this.logger.error(
      `[CONTEXT-DISCOVERY] FAILED for user ${userId}: ${errorMessage}`,
      error instanceof Error ? error.stack : undefined,
    );
    writeAnalysisLog(`FAILED for user ${userId}: ${errorMessage}`, "error");

    try {
      if (analysisRecord) {
        analysisRecord.status = "failed";
        analysisRecord.errorMessage = classifyContextAnalysisError(
          error,
        ).substring(0, QUERY_LIMITS.SUBSTRING_BODY_PREVIEW);
        await this.contextAnalysisRepository.save(analysisRecord);
      }
      await this.usersService.update(userId, {
        scanProgress: -1,
        scanTotal: 100,
      });
      setTimeout(async () => {
        await this.usersService.update(userId, {
          scanProgress: null,
          scanTotal: null,
        });
      }, PERFORMANCE_BUDGETS.CONTEXT_ANALYSIS_TIMEOUT);
    } catch (updateError) {
      this.logger.error(
        `[CONTEXT-DISCOVERY] Failed to update error state for user ${userId}:`,
        updateError,
      );
    }
  }

  private async completeWithNoThreads(
    userId: string,
    analysisRecord: ContextAnalysis,
  ): Promise<void> {
    this.logger.warn(
      `[CONTEXT-DISCOVERY] No threads found for user ${userId}. Completing with empty data.`,
    );
    analysisRecord.status = "completed";
    analysisRecord.progress = 100;
    analysisRecord.total = 100;
    analysisRecord.threadCount = 0;
    analysisRecord.analyzedCount = 0;
    await this.contextAnalysisRepository.save(analysisRecord);
    await this.usersService.update(userId, {
      scanProgress: 100,
      scanTotal: 100,
    });
  }

  private async resetStatsForAnalysis(
    analysisRecord: ContextAnalysis,
    threadCount: number,
  ): Promise<void> {
    analysisRecord.threadCount = threadCount;
    analysisRecord.analyzedCount = 0;
    analysisRecord.stats = {
      ...EMPTY_ANALYSIS_STATS,
      totalThreads: threadCount,
      batchResults: {},
      batchJobIds: {},
      totalBatches: 0,
    };
    await this.contextAnalysisRepository.save(analysisRecord);
  }
}
