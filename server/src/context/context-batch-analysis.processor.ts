import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import * as os from "os";
import type { Job, PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { JOB_NAMES } from "../constants/job-names";
import { PERCENTAGES } from "../constants/percentages";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import { MS_PER_SECOND } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { LLMService } from "../llm/llm.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { getErrorMessage } from "../types/common";
import { UsersService } from "../users/users.service";
import { logError, logWarn } from "../utils/logger";
import { writeAnalysisLog } from "./context-analysis-logger";
import {
  calculateBackoffDelay,
  classifyBatchError,
  mapThreadToAnalysisPayload,
  ThreadPayload,
} from "./context-batch-analysis.helpers";

export { classifyBatchError } from "./context-batch-analysis.helpers";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { registerWorker } from "../queue/register-worker";
import { ContextGmailDataService } from "./context-gmail-data.service";

interface BatchAnalysisJob {
  userId: string;
  batchIndex: number;
  threadIds?: string[];
  batch?: Array<{
    threadId?: string;
    from: string;
    fromName?: string;
    subject: string;
    body: string;
    receivedAt: string;
    isRead?: boolean;
    timeToReply?: number | null;
    readAt?: string | null;
    repliedAt?: string | null;
    starCount?: number;
    isArchived?: boolean;
  }>;
  sentPayload: Array<{
    emailId?: string;
    to: string;
    subject: string;
    body: string;
    sentAt: string;
  }>;
  userEmail?: string;
  currentContextForPrompt: Array<{
    key: string;
    value: string;
    source: string;
  }>;
  analysisRecordId: string;
  totalBatches: number;
  after?: string;
  before?: string;
}

@Injectable()
export class ContextBatchAnalysisProcessor implements OnModuleInit {
  private readonly logger = new Logger(ContextBatchAnalysisProcessor.name);
  private readonly batchConcurrency: number;

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private llmService: LLMService,
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
    private configService: ConfigService,
    private gmailDataService: ContextGmailDataService,
    private usersService: UsersService,
    private cloudWatchService: CloudWatchService,
    private readonly userEncryptionService: UserEncryptionService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {
    const cpuCores = os.cpus().length;
    const defaultConcurrency = Math.max(3, Math.min(cpuCores * 2, 10));
    this.batchConcurrency = parseInt(
      this.configService.get<string>("JOB_BATCH_ANALYSIS_CONCURRENCY") ||
        String(defaultConcurrency),
      10,
    );
    this.logger.log(
      `CPU cores: ${cpuCores}, analyze-context-batch concurrency: ${this.batchConcurrency}`,
    );
  }

  async onModuleInit() {
    this.logger.log(
      `Registering batch-analysis worker with concurrency: ${this.batchConcurrency}`,
    );
    writeAnalysisLog(
      `===== Batch Analysis Worker Registered ===== (concurrency: ${this.batchConcurrency})`,
      "log",
    );
    // TODO: Remove after SQS migration is confirmed stable and no in-flight PgBoss
    // ANALYZE_CONTEXT_BATCH jobs remain. New batches go exclusively via SQS → Lambda.
    await registerWorker(
      this.boss,
      JOB_NAMES.ANALYZE_CONTEXT_BATCH,
      { teamSize: this.batchConcurrency },
      (job) => this.handleBatchAnalysisJob(job as Job<BatchAnalysisJob>),
    );
    this.logger.log("Batch analysis worker registered successfully");
    writeAnalysisLog("Batch analysis worker registered successfully", "log");
  }

  /**
   * Emit a batch performance-budget metric to CloudWatch.
   *
   * Only BudgetName + the fixed "batch" BudgetType are used as dimensions.
   * Per-execution values (WorkerId, UserId, ThreadCount, BatchSize, phase
   * durations) must NEVER be promoted to dimensions: each unique combination
   * creates a separate CloudWatch series (~$0.30/series/month) and makes the
   * metric impossible to aggregate by budget. Those values stay in the log
   * output / the duration metric value for tracing. Mirrors the job-path fix
   * in #2223 (job-performance-tracker.ts).
   */
  private emitBatchBudgetMetric(params: {
    budgetName: string;
    durationMs: number;
    budgetMs: number;
    exceeded: boolean;
  }): void {
    this.cloudWatchService
      .putPerformanceBudgetMetric({
        budgetName: params.budgetName,
        budgetType: "batch",
        durationMs: params.durationMs,
        budgetMs: params.budgetMs,
        exceeded: params.exceeded,
      })
      .catch((err) => {
        this.logger.error("Failed to emit CloudWatch metric:", err);
      });
  }

  /**
   * Fetch threads by ID and process them into analysis payloads.
   * Returns the batch payload along with timing durations.
   */
  private async fetchAndProcessThreads(
    workerId: string,
    userId: string,
    threadIds: string[],
    userEmail: string | undefined,
  ): Promise<{
    batch: ThreadPayload[];
    fetchDuration: number;
    processDuration: number;
  }> {
    this.logger.log(
      `[Worker ${workerId}] 📥 Step 1/4: Fetching ${threadIds.length} threads by ID...`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] 📥 Step 1/4: Fetching ${threadIds.length} threads by ID...`,
      "log",
    );

    const fetchStartTime = Date.now();
    const threads = await this.gmailDataService.fetchThreadsByIds(
      userId,
      threadIds,
    );
    const fetchDuration = Date.now() - fetchStartTime;
    const fetchExceeded =
      fetchDuration > PERFORMANCE_BUDGETS.BATCH_FETCH_THREADS;

    this.emitBatchBudgetMetric({
      budgetName: "BATCH_FETCH_THREADS",
      durationMs: fetchDuration,
      budgetMs: PERFORMANCE_BUDGETS.BATCH_FETCH_THREADS,
      exceeded: fetchExceeded,
    });

    this.logger.log(
      `[Worker ${workerId}] ✅ Fetched ${threads.length} threads in ${Math.round(fetchDuration / MS_PER_SECOND)}s (budget: ${PERFORMANCE_BUDGETS.BATCH_FETCH_THREADS / MS_PER_SECOND}s)${fetchExceeded ? " ⚠️ OVER BUDGET" : ""}`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] ✅ Fetched ${threads.length} threads in ${Math.round(fetchDuration / MS_PER_SECOND)}s`,
      "log",
    );

    this.logger.log(
      `[Worker ${workerId}] 🔄 Step 2/4: Processing ${threads.length} threads into analysis payloads...`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] 🔄 Step 2/4: Processing ${threads.length} threads into analysis payloads...`,
      "log",
    );

    const processStartTime = Date.now();
    const batch = threads
      .map((thread) => mapThreadToAnalysisPayload(thread, userEmail))
      .filter((thread): thread is ThreadPayload => thread !== null);
    const processDuration = Date.now() - processStartTime;
    const processExceeded =
      processDuration > PERFORMANCE_BUDGETS.BATCH_PROCESS_THREADS;

    this.emitBatchBudgetMetric({
      budgetName: "BATCH_PROCESS_THREADS",
      durationMs: processDuration,
      budgetMs: PERFORMANCE_BUDGETS.BATCH_PROCESS_THREADS,
      exceeded: processExceeded,
    });

    this.logger.log(
      `[Worker ${workerId}] ✅ Processed ${batch.length} threads into payloads in ${Math.round(processDuration / MS_PER_SECOND)}s (budget: ${PERFORMANCE_BUDGETS.BATCH_PROCESS_THREADS / MS_PER_SECOND}s)${processExceeded ? " ⚠️ OVER BUDGET" : ""}`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] ✅ Processed ${batch.length} threads into payloads in ${Math.round(processDuration / MS_PER_SECOND)}s`,
      "log",
    );

    return { batch, fetchDuration, processDuration };
  }

  /**
   * Call the LLM to analyze a batch of email patterns.
   * Returns the analysis result and timing.
   */
  private async runLlmAnalysis(options: {
    workerId: string;
    userId: string;
    batch: ThreadPayload[];
    sentPayload: BatchAnalysisJob["sentPayload"];
    userEmail: string | undefined;
    currentContextForPrompt: BatchAnalysisJob["currentContextForPrompt"];
  }) {
    const {
      workerId,
      userId,
      batch,
      sentPayload,
      userEmail,
      currentContextForPrompt,
    } = options;
    this.logger.log(
      `[Worker ${workerId}] 🤖 Step 3/4: Calling LLM to analyze ${batch.length} email patterns...`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] 🤖 Step 3/4: Calling LLM to analyze ${batch.length} email patterns...`,
      "log",
    );

    const llmStartTime = Date.now();
    const batchAnalysis = await this.llmService.analyzeEmailPatterns({
      receivedEmails: batch,
      sentEmails: sentPayload,
      userId,
      userEmail: userEmail || undefined,
      currentContext: currentContextForPrompt,
    });
    const llmDuration = Date.now() - llmStartTime;
    const llmExceeded = llmDuration > PERFORMANCE_BUDGETS.BATCH_LLM_ANALYSIS;

    this.emitBatchBudgetMetric({
      budgetName: "BATCH_LLM_ANALYSIS",
      durationMs: llmDuration,
      budgetMs: PERFORMANCE_BUDGETS.BATCH_LLM_ANALYSIS,
      exceeded: llmExceeded,
    });

    this.logger.log(
      `[Worker ${workerId}] ✅ LLM analysis completed in ${Math.round(llmDuration / MS_PER_SECOND)}s (budget: ${PERFORMANCE_BUDGETS.BATCH_LLM_ANALYSIS / MS_PER_SECOND}s)${llmExceeded ? " ⚠️ OVER BUDGET" : ""}`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] ✅ LLM analysis completed in ${Math.round(llmDuration / MS_PER_SECOND)}s`,
      "log",
    );

    return { batchAnalysis, llmDuration };
  }

  /**
   * Persist batch results to the database.
   * Returns the timing and updated analysis record's batch results.
   */
  /**
   * Persist the batch result to the database, merging with any concurrent updates.
   * Returns the saved analysisRecord.
   */
  private async persistBatchToDatabase(
    analysisRecordId: string,
    batchIndex: number,
    batchResults: Record<string, unknown>,
    analyzedCount: number,
  ): Promise<ContextAnalysis> {
    const latestRecord = await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecordId },
    });
    if (latestRecord && latestRecord.stats) {
      const latestBatchResults =
        (latestRecord.stats.batchResults as Record<string, unknown>) || {};
      latestBatchResults[String(batchIndex)] = batchResults[String(batchIndex)];
      latestRecord.stats.batchResults = latestBatchResults;
      latestRecord.analyzedCount = analyzedCount;
      await this.contextAnalysisRepository.save(latestRecord);
      return latestRecord;
    }
    throw new Error(
      `Analysis record ${analysisRecordId} not found during persist`,
    );
  }

  private async saveBatchResults(options: {
    workerId: string;
    batchIndex: number;
    analysisRecordId: string;
    batch: ThreadPayload[];
    batchAnalysis: { context?: unknown[]; writingStyle?: unknown | null };
  }): Promise<{
    saveDuration: number;
    batchResults: Record<string, unknown>;
    analysisRecord: ContextAnalysis;
  }> {
    const { workerId, batchIndex, analysisRecordId, batch, batchAnalysis } =
      options;
    this.logger.log(
      `[Worker ${workerId}] 💾 Step 4/4: Saving batch results to database...`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] 💾 Step 4/4: Saving batch results to database...`,
      "log",
    );

    const saveStartTime = Date.now();
    const findStartTime = Date.now();
    let analysisRecord = await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecordId },
    });
    const findRecordDuration = Date.now() - findStartTime;

    if (!analysisRecord) {
      throw new Error(
        `Analysis record ${analysisRecordId} not found for batch ${batchIndex}`,
      );
    }

    const stats = analysisRecord.stats || {
      totalThreads: 0,
      outboundEmails: 0,
      threadsNeverOpened: 0,
      threadsReadButNotReplied: 0,
      vipContactsEvaluated: 0,
    };
    const batchResults = (stats.batchResults as Record<string, unknown>) || {};
    const batchWasAlreadyCompleted =
      batchResults[String(batchIndex)] !== undefined;
    const batchThreadIds = batch
      .map((thread: { threadId?: string }) => thread.threadId)
      .filter((id): id is string => !!id);

    batchResults[String(batchIndex)] = {
      context: batchAnalysis.context || [],
      writingStyle: batchAnalysis.writingStyle || null,
      completedAt: new Date().toISOString(),
      threadIds: batchThreadIds,
    };
    stats.batchResults = batchResults;

    const batchSize = batch.length;
    const currentAnalyzedCount = analysisRecord.analyzedCount || 0;
    if (!batchWasAlreadyCompleted) {
      analysisRecord.analyzedCount = currentAnalyzedCount + batchSize;
      this.logger.log(
        `[Worker ${workerId}] ✅ Batch ${batchIndex} completed for the first time. Incrementing analyzedCount by ${batchSize} (was ${currentAnalyzedCount}, now ${analysisRecord.analyzedCount})`,
      );
    } else {
      this.logger.warn(
        `[Worker ${workerId}] ⚠️ Batch ${batchIndex} was already completed (retry detected). Not incrementing analyzedCount to prevent double counting.`,
      );
    }

    analysisRecord = await this.persistBatchToDatabase(
      analysisRecordId,
      batchIndex,
      batchResults,
      analysisRecord.analyzedCount,
    );
    const saveDbDuration = 0;
    const saveDuration = Date.now() - saveStartTime;
    const saveExceeded = saveDuration > PERFORMANCE_BUDGETS.BATCH_SAVE_RESULTS;

    this.emitBatchBudgetMetric({
      budgetName: "BATCH_SAVE_RESULTS",
      durationMs: saveDuration,
      budgetMs: PERFORMANCE_BUDGETS.BATCH_SAVE_RESULTS,
      exceeded: saveExceeded,
    });

    this.logger.log(
      `[Worker ${workerId}] ✅ Saved batch results in ${Math.round(saveDuration / MS_PER_SECOND)}s (find: ${Math.round(findRecordDuration / MS_PER_SECOND)}s, save: ${Math.round(saveDbDuration / MS_PER_SECOND)}s, budget: ${PERFORMANCE_BUDGETS.BATCH_SAVE_RESULTS / MS_PER_SECOND}s)${saveExceeded ? " ⚠️ OVER BUDGET" : ""}`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] ✅ Saved batch results in ${Math.round(saveDuration / MS_PER_SECOND)}s`,
      "log",
    );

    return { saveDuration, batchResults, analysisRecord };
  }

  /**
   * Emit the total performance budget CloudWatch metric.
   */
  private emitTotalBudgetMetric(options: {
    workerId: string;
    fetchDuration: number;
    processDuration: number;
    llmDuration: number;
    saveDuration: number;
  }): void {
    const {
      workerId,
      fetchDuration,
      processDuration,
      llmDuration,
      saveDuration,
    } = options;
    const totalTimeSoFar =
      saveDuration + llmDuration + processDuration + fetchDuration;
    const totalExceeded = totalTimeSoFar > PERFORMANCE_BUDGETS.BATCH_TOTAL;

    this.emitBatchBudgetMetric({
      budgetName: "BATCH_TOTAL",
      durationMs: totalTimeSoFar,
      budgetMs: PERFORMANCE_BUDGETS.BATCH_TOTAL,
      exceeded: totalExceeded,
    });

    if (totalExceeded) {
      this.logger.warn(
        `[Worker ${workerId}] ⚠️ BATCH OVER TOTAL BUDGET: ${Math.round(totalTimeSoFar / MS_PER_SECOND)}s (budget: ${PERFORMANCE_BUDGETS.BATCH_TOTAL / MS_PER_SECOND}s). Breakdown: fetch=${Math.round(fetchDuration / MS_PER_SECOND)}s, process=${Math.round(processDuration / MS_PER_SECOND)}s, llm=${Math.round(llmDuration / MS_PER_SECOND)}s, save=${Math.round(saveDuration / MS_PER_SECOND)}s`,
      );
    }
  }

  /**
   * Update the user's scan progress based on completed batch count.
   */
  private async updateUserProgress(
    workerId: string,
    userId: string,
    batchResults: Record<string, unknown>,
    totalBatches: number,
  ): Promise<void> {
    const completedBatches = Object.keys(batchResults).length;
    const progressPercent =
      PERCENTAGES.THIRTY +
      Math.floor(
        (completedBatches / totalBatches) *
          (PERCENTAGES.SEVENTY - PERCENTAGES.THIRTY),
      );

    try {
      await this.usersService.update(userId, {
        scanProgress: progressPercent,
        scanTotal: 100,
      });
      this.logger.log(
        `[Worker ${workerId}] Updated user progress to ${progressPercent}% (${completedBatches}/${totalBatches} batches completed)`,
      );
    } catch (progressError) {
      this.logger.warn(
        `[Worker ${workerId}] Failed to update user progress: ${getErrorMessage(progressError)}`,
      );
    }
  }

  /**
   * Resolve the batch payload: either fetch from Gmail (threadIds path) or use the legacy pre-processed batch.
   * Returns batch + timing durations as a single object for clean destructuring.
   */
  private async resolveBatch(
    workerId: string,
    userId: string,
    threadIds: string[] | undefined,
    legacyBatch: ThreadPayload[] | undefined,
    userEmail: string | undefined,
  ): Promise<{
    batch: ThreadPayload[];
    fetchDuration: number;
    processDuration: number;
  }> {
    if (threadIds && threadIds.length > 0) {
      return this.fetchAndProcessThreads(
        workerId,
        userId,
        threadIds,
        userEmail,
      );
    }
    if (legacyBatch) {
      this.logger.log(
        `[Worker ${workerId}] ✅ Using pre-processed batch (${legacyBatch.length} threads) - skipping fetch/process steps (0s)`,
      );
      writeAnalysisLog(
        `[Worker ${workerId}] ✅ Using pre-processed batch (${legacyBatch.length} threads) - skipping fetch/process steps`,
        "log",
      );
      return { batch: legacyBatch, fetchDuration: 0, processDuration: 0 };
    }
    throw new Error("No threadIds or batch provided");
  }

  /**
   * Store a batch failure record in the database after max retries are exceeded.
   */
  private async storeBatchFailure(options: {
    workerId: string;
    analysisRecordId: string;
    batchIndex: number;
    errorMessage: string;
    correlationId: string;
    errorType: string;
  }): Promise<void> {
    const {
      workerId,
      analysisRecordId,
      batchIndex,
      errorMessage,
      correlationId,
      errorType,
    } = options;
    try {
      const failRecord = await this.contextAnalysisRepository.findOne({
        where: { id: analysisRecordId },
      });
      if (!failRecord) return;
      const failStats = failRecord.stats || {
        totalThreads: 0,
        outboundEmails: 0,
        threadsNeverOpened: 0,
        threadsReadButNotReplied: 0,
        vipContactsEvaluated: 0,
      };
      const failBatchResults =
        (failStats.batchResults as Record<string, unknown>) || {};
      const failedBatches = (failStats.failedBatches as number[]) || [];
      if (!failedBatches.includes(batchIndex)) failedBatches.push(batchIndex);
      failBatchResults[String(batchIndex)] = {
        error: errorMessage,
        failedAt: new Date().toISOString(),
        correlationId,
        errorType,
      };
      failStats.batchResults = failBatchResults;
      failStats.failedBatches = failedBatches;
      failRecord.stats = failStats;
      await this.contextAnalysisRepository.save(failRecord);
    } catch (saveError) {
      this.logger.error(
        `[Worker ${workerId}] Failed to save batch failure status: ${getErrorMessage(saveError)}`,
      );
    }
  }

  /**
   * Execute one attempt of the batch processing pipeline.
   * Returns on success. Throws on failure so the retry loop can handle it.
   */
  private async runBatchAttempt(options: {
    workerId: string;
    userId: string;
    batchIndex: number;
    totalBatches: number;
    attemptNumber: number;
    jobData: BatchAnalysisJob;
    tracker: JobPerformanceTracker;
  }): Promise<void> {
    const {
      workerId,
      userId,
      batchIndex,
      totalBatches,
      attemptNumber,
      jobData,
      tracker,
    } = options;
    const {
      threadIds,
      batch: legacyBatch,
      sentPayload,
      userEmail,
      currentContextForPrompt,
      analysisRecordId,
    } = jobData;

    const maxRetries = 5;
    const baseDelay = 1000;
    const maxDelay = 60000;

    if (attemptNumber > 0) {
      const backoffDelay = calculateBackoffDelay(
        attemptNumber - 1,
        baseDelay,
        maxDelay,
      );
      this.logger.log(
        `[Worker ${workerId}] Retry attempt ${attemptNumber}/${maxRetries} after ${backoffDelay}ms backoff`,
      );
      writeAnalysisLog(
        `[Worker ${workerId}] Retry attempt ${attemptNumber}/${maxRetries} after ${backoffDelay}ms backoff`,
        "log",
      );
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }

    this.logger.log(
      `[Worker ${workerId}] Processing batch ${batchIndex + 1}/${totalBatches} (attempt ${attemptNumber + 1})`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] Processing batch ${batchIndex + 1}/${totalBatches} (attempt ${attemptNumber + 1})`,
      "log",
    );

    const { batch, fetchDuration, processDuration } = await this.resolveBatch(
      workerId,
      userId,
      threadIds,
      legacyBatch,
      userEmail,
    );
    const { batchAnalysis, llmDuration } = await this.runLlmAnalysis({
      workerId,
      userId,
      batch,
      sentPayload,
      userEmail,
      currentContextForPrompt,
    });
    const { saveDuration, batchResults } = await this.saveBatchResults({
      workerId,
      batchIndex,
      analysisRecordId,
      batch,
      batchAnalysis,
    });

    this.emitTotalBudgetMetric({
      workerId,
      fetchDuration,
      processDuration,
      llmDuration,
      saveDuration,
    });
    await this.updateUserProgress(workerId, userId, batchResults, totalBatches);

    const duration = Math.round(
      (Date.now() - tracker.startTime) / MS_PER_SECOND,
    );
    this.logger.log(
      `[Worker ${workerId}] ✅ COMPLETED batch ${batchIndex + 1}/${totalBatches} in ${duration}s. Analyzed ${batch.length} threads.`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] ✅ COMPLETED batch ${batchIndex + 1}/${totalBatches} in ${duration}s. Analyzed ${batch.length} threads.`,
      "log",
    );
    tracker.finish();
  }

  /**
   * Handle a batch processing error: either record final failure (if max retries exceeded) or log for retry.
   * Returns true if the error is terminal (max retries exceeded), false if should retry.
   */
  private async handleBatchError(options: {
    workerId: string;
    batchIndex: number;
    totalBatches: number;
    attemptNumber: number;
    maxRetries: number;
    analysisRecordId: string;
    error: unknown;
    tracker: JobPerformanceTracker;
  }): Promise<boolean> {
    const {
      workerId,
      batchIndex,
      totalBatches,
      attemptNumber,
      maxRetries,
      analysisRecordId,
      error,
      tracker,
    } = options;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    if (attemptNumber > maxRetries) {
      this.logger.error(
        `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} failed after ${maxRetries} retries: ${errorMessage}`,
        errorStack || error,
      );
      const batchCorrelationId = randomUUID();
      const errorType = classifyBatchError(error);
      logError(
        `[BATCH-PROCESSOR] [Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} failed after ${maxRetries} retries: ${errorMessage}`,
        undefined,
        {
          correlationId: batchCorrelationId,
          batchIndex,
          analysisId: analysisRecordId,
          errorType,
        },
      );
      writeAnalysisLog(
        `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} failed after ${maxRetries} retries: ${errorMessage}`,
        "error",
      );
      await this.storeBatchFailure({
        workerId,
        analysisRecordId,
        batchIndex,
        errorMessage,
        correlationId: batchCorrelationId,
        errorType,
      });
      tracker.finish(error as Error);
      return true;
    }
    this.logger.warn(
      `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} attempt ${attemptNumber} failed: ${errorMessage}. Will retry.`,
    );
    logWarn(
      `[BATCH-PROCESSOR] [Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} attempt ${attemptNumber} failed: ${errorMessage}. Will retry.`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} attempt ${attemptNumber} failed: ${errorMessage}. Will retry.`,
      "warn",
    );
    return false;
  }

  private async handleBatchAnalysisJob(job: Job<BatchAnalysisJob>) {
    const jobData = job.data;
    const { userId, batchIndex, analysisRecordId, totalBatches, threadIds } =
      jobData;
    const legacyBatch = jobData.batch;
    const workerId = job.id || "unknown";
    const tracker = new JobPerformanceTracker(
      JOB_NAMES.ANALYZE_CONTEXT_BATCH,
      workerId,
      this.cloudWatchService,
    );
    tracker.setMetadata({ userId, threadId: analysisRecordId });

    const jobReceivedTime = new Date().toISOString();
    const threadCount = threadIds?.length || legacyBatch?.length || 0;
    this.logger.log(
      `[Worker ${workerId}] ✅ JOB RECEIVED at ${jobReceivedTime}: batch ${batchIndex + 1}/${totalBatches} for user ${userId} (analysis ${analysisRecordId}, ${threadCount} threads)`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] ✅ JOB RECEIVED: batch ${batchIndex + 1}/${totalBatches} for analysis ${analysisRecordId}`,
      "log",
    );
    this.logger.log(
      `[Worker ${workerId}] 🚀 STARTING batch ${batchIndex + 1}/${totalBatches} for user ${userId} (${threadCount} threads)`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] 🚀 STARTING batch ${batchIndex + 1}/${totalBatches} for user ${userId}`,
      "log",
    );

    let attemptNumber = 0;
    const maxRetries = 5;

    // Wrap the whole retry loop with the user's KMS key so every attempt
    // (and any reads/writes of encrypted Email / EmailThread / UserContext
    // columns inside) sees the per-user envelope key in ALS.
    await this.userEncryptionService.withUserKey(userId, async () => {
      // Per-batch AI-capacity gate: context analysis fans out one LLM call per
      // batch, so re-check before each one. If the plan volume runs out
      // mid-analysis, record a clear failure on the progress record (the same
      // way other terminal batch errors are recorded) instead of calling the LLM.
      const capacity = await this.subscriptionsService.checkAiCapacity(userId);
      if (!capacity.allowed) {
        const limitMessage =
          "AI usage limit reached for your plan — batch analysis skipped";
        this.logger.warn(
          `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} blocked for user ${userId}: ${limitMessage} (${capacity.percentUsed}% used)`,
        );
        writeAnalysisLog(
          `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} blocked: ${limitMessage}`,
          "warn",
        );
        await this.storeBatchFailure({
          workerId,
          analysisRecordId,
          batchIndex,
          errorMessage: limitMessage,
          correlationId: randomUUID(),
          errorType: "ai_volume_limit",
        });
        tracker.finish(new Error(limitMessage));
        return;
      }
      while (attemptNumber <= maxRetries) {
        try {
          await this.runBatchAttempt({
            workerId,
            userId,
            batchIndex,
            totalBatches,
            attemptNumber,
            jobData,
            tracker,
          });
          return;
        } catch (error: unknown) {
          attemptNumber++;
          const isTerminal = await this.handleBatchError({
            workerId,
            batchIndex,
            totalBatches,
            attemptNumber,
            maxRetries,
            analysisRecordId,
            error,
            tracker,
          });
          if (isTerminal) throw error;
        }
      }
    });
  }
}
