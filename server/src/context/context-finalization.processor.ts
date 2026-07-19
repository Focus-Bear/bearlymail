import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import type { Job, PgBoss } from "pg-boss";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import {
  MAX_FINALIZATION_RETRIES,
  RETRY_CONSTANTS,
} from "../constants/service-constants";
import { MILLISECONDS, SECONDS } from "../constants/time-constants";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { getJobPriority } from "../queue/job-priorities";
import { registerWorker } from "../queue/register-worker";
import { ContextService } from "./context.service";
import { writeAnalysisLog } from "./context-analysis-logger";

interface FinalizationJob {
  userId: string;
  analysisRecordId: string;
  totalBatches: number;
  threadsInRange: number;
  sentEmailsData: number;
  analysisStats: {
    totalThreads: number;
    outboundEmails: number;
    threadsNeverOpened: number;
    threadsReadButNotReplied: number;
    vipContactsEvaluated: number;
  };
  trueVipContacts: Array<{
    emailKey: string;
    from: string;
    fromName?: string;
    threadCount: number;
  }>;
  userEmail?: string;
  /** Tracks how many times this finalization job has been re-queued (Bug #3 fix). */
  retryCount?: number;
}

@Injectable()
export class ContextFinalizationProcessor implements OnModuleInit {
  private readonly logger = new Logger(ContextFinalizationProcessor.name);
  private readonly finalizationConcurrency: number;

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private contextService: ContextService,
    private configService: ConfigService,
    private cloudWatchService: CloudWatchService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {
    // Get CPU cores for optimal concurrency
    const cpuCores = os.cpus().length;
    // For finalization (mostly DB writes), use moderate concurrency
    const defaultConcurrency = Math.max(2, Math.min(cpuCores, 3));

    this.finalizationConcurrency = parseInt(
      this.configService.get<string>("JOB_FINALIZATION_CONCURRENCY") ||
        String(defaultConcurrency),
      10,
    );

    this.logger.log(
      `CPU cores: ${cpuCores}, finalize-context-analysis concurrency: ${this.finalizationConcurrency}`,
    );
  }

  async onModuleInit() {
    // Worker for finalizing context analysis - checks if batches are done and does post-processing
    this.logger.log(
      `Registering context-finalization worker with concurrency: ${this.finalizationConcurrency}`,
    );
    writeAnalysisLog(
      `===== Context Finalization Worker Registered ===== (concurrency: ${this.finalizationConcurrency})`,
      "log",
    );

    await registerWorker(
      this.boss,
      JOB_NAMES.FINALIZE_CONTEXT_ANALYSIS,
      { teamSize: this.finalizationConcurrency } as { teamSize: number },
      async (job) => {
        await this.processFinalizationJob(job as Job<FinalizationJob>);
      },
    );

    this.logger.log("Context finalization worker registered successfully");
    writeAnalysisLog(
      "Context finalization worker registered successfully",
      "log",
    );
  }

  /**
   * Resolve the actual totalBatches from the DB stats, which is the source of truth.
   * Returns null if the analysis record cannot be found (caller should abort).
   */
  private async resolveActualTotalBatches(
    workerId: string,
    analysisRecordId: string,
    totalBatchesFromJob: number,
  ): Promise<number | null> {
    const analysisRecord =
      await this.contextService.getAnalysisRecordById(analysisRecordId);

    if (
      analysisRecord &&
      analysisRecord.stats &&
      analysisRecord.stats.totalBatches
    ) {
      const actualTotalBatches = analysisRecord.stats.totalBatches as number;
      if (actualTotalBatches !== totalBatchesFromJob) {
        this.logger.warn(
          `[Worker ${workerId}] ⚠️ totalBatches mismatch: job data says ${totalBatchesFromJob}, but analysis stats says ${actualTotalBatches}. Using stats value.`,
        );
        writeAnalysisLog(
          `[Worker ${workerId}] ⚠️ totalBatches mismatch: job=${totalBatchesFromJob}, stats=${actualTotalBatches}. Using stats.`,
          "warn",
        );
      }
      return actualTotalBatches;
    }

    if (!analysisRecord || !analysisRecord.stats) {
      this.logger.error(
        `[Worker ${workerId}] ❌ ERROR: Analysis record ${analysisRecordId} not found or has no stats! Cannot proceed.`,
      );
      writeAnalysisLog(
        `[Worker ${workerId}] ❌ ERROR: Analysis record ${analysisRecordId} not found or has no stats!`,
        "error",
      );
      return null;
    }

    this.logger.warn(
      `[Worker ${workerId}] ⚠️ Analysis record exists but totalBatches not in stats. Using job data value: ${totalBatchesFromJob}`,
    );
    return totalBatchesFromJob;
  }

  /**
   * Wrap resolveActualTotalBatches in withUserKey because ContextAnalysis.stats
   * uses encryptedJsonTransformer (per-user KMS envelope): without the user key
   * in AsyncLocalStorage, decryption fails open to null, and the call would
   * falsely report "not found or has no stats". On failure, logs, finishes the
   * tracker, and rethrows so the job can be retried.
   */
  private async resolveActualTotalBatchesWithUserKey(
    workerId: string,
    userId: string,
    analysisRecordId: string,
    totalBatchesFromJob: number,
    tracker: JobPerformanceTracker,
  ): Promise<number | null> {
    try {
      return await this.userEncryptionService.withUserKey(userId, () =>
        this.resolveActualTotalBatches(
          workerId,
          analysisRecordId,
          totalBatchesFromJob,
        ),
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[Worker ${workerId}] Failed to resolve actual total batches for ${analysisRecordId}: ${errorMessage}`,
        errorStack || error,
      );
      writeAnalysisLog(
        `[Worker ${workerId}] Failed to resolve actual total batches for ${analysisRecordId}: ${errorMessage}`,
        "error",
      );
      tracker.finish(error as Error);
      throw error;
    }
  }

  /**
   * Re-queue this finalization job to run again after a short delay.
   * Enforces a maximum retry limit (MAX_FINALIZATION_RETRIES) to prevent
   * infinite re-queue loops. Marks the analysis as failed when limit is exceeded.
   */
  private async requeueFinalizationJob(
    workerId: string,
    jobData: FinalizationJob,
    analysisRecordId: string,
    actualTotalBatches: number,
    completedBatches: number,
  ): Promise<void> {
    const currentRetryCount = (jobData.retryCount ?? 0) + 1;

    // Enforce max re-queue limit to prevent infinite loops (Bug #3 fix)
    if (currentRetryCount > MAX_FINALIZATION_RETRIES) {
      this.logger.error(
        `[Worker ${workerId}] ❌ Finalization exceeded max retries (${MAX_FINALIZATION_RETRIES}) for analysis ${analysisRecordId}. Marking as failed.`,
      );
      writeAnalysisLog(
        `[Worker ${workerId}] ❌ Finalization exceeded max retries (${MAX_FINALIZATION_RETRIES}). Marking analysis ${analysisRecordId} as failed.`,
        "error",
      );
      await this.contextService.markAnalysisAsFailed(
        analysisRecordId,
        `Analysis timed out: batches did not complete after ${MAX_FINALIZATION_RETRIES} retries (${completedBatches}/${actualTotalBatches} batches completed).`,
      );
      return;
    }

    this.logger.log(
      `[Worker ${workerId}] Not all batches complete yet (${completedBatches}/${actualTotalBatches}). Re-queuing finalization job in ${RETRY_CONSTANTS.FINALIZATION_RETRY_DELAY_SECONDS}s (attempt ${currentRetryCount}/${MAX_FINALIZATION_RETRIES}).`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] Not all batches complete yet (${completedBatches}/${actualTotalBatches}). Re-queuing finalization job in ${RETRY_CONSTANTS.FINALIZATION_RETRY_DELAY_SECONDS}s (attempt ${currentRetryCount}/${MAX_FINALIZATION_RETRIES}).`,
      "log",
    );

    // Update job data with correct totalBatches and incremented retryCount before re-queuing
    const updatedJobData = {
      ...jobData,
      totalBatches: actualTotalBatches,
      retryCount: currentRetryCount,
    };

    // Use a unique key with timestamp to avoid singleton conflict with current job
    const retryJobId = await this.boss.send(
      JOB_NAMES.FINALIZE_CONTEXT_ANALYSIS,
      updatedJobData,
      {
        priority: getJobPriority(JOB_NAMES.FINALIZE_CONTEXT_ANALYSIS, false),
        singletonKey: `finalize-context-analysis-${analysisRecordId}-retry-${Date.now()}`,
        // Short duration for retry jobs
        singletonSeconds: SECONDS.MINUTE,
        startAfter: new Date(
          Date.now() +
            RETRY_CONSTANTS.FINALIZATION_RETRY_DELAY_SECONDS *
              MILLISECONDS.SECOND,
        ),
      },
    );
    this.logger.log(
      `[Worker ${workerId}] Re-queued finalization job with ID: ${retryJobId}`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] Re-queued finalization job with ID: ${retryJobId}`,
      "log",
    );
  }

  /**
   * Validate the resolved totalBatches value. Returns false (and logs) if it is 0 or undefined.
   */
  private validateActualTotalBatches(
    workerId: string,
    actualTotalBatches: number,
    totalBatchesFromJob: number,
    tracker: JobPerformanceTracker,
  ): boolean {
    if (!actualTotalBatches || actualTotalBatches === 0) {
      this.logger.error(
        `[Worker ${workerId}] ❌ ERROR: Finalization job received with totalBatches = ${actualTotalBatches} (job data: ${totalBatchesFromJob}). This should never happen - batches were never enqueued. checkBatchesComplete will return false.`,
      );
      writeAnalysisLog(
        `[Worker ${workerId}] ❌ ERROR: Finalization job with totalBatches = ${actualTotalBatches}. Batches were never enqueued.`,
        "error",
      );
      // Don't proceed - checkBatchesComplete will return false, and we'll re-queue
      tracker.finish(
        new Error(
          `Invalid finalization job: totalBatches is ${actualTotalBatches}`,
        ),
      );
      return false;
    }
    return true;
  }

  /**
   * Run post-processing (finalizeContextAnalysis) once all batches are confirmed complete.
   */
  private async runPostProcessing(
    workerId: string,
    jobData: FinalizationJob,
    actualTotalBatches: number,
  ): Promise<void> {
    const {
      userId,
      analysisRecordId,
      threadsInRange,
      sentEmailsData,
      analysisStats,
      trueVipContacts,
    } = jobData;
    const completedBatches =
      await this.contextService.getCompletedBatchCount(analysisRecordId);
    this.logger.log(
      `[Worker ${workerId}] ✅ All batches complete (${completedBatches}/${actualTotalBatches}). Starting post-processing.`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] ✅ All batches complete (${completedBatches}/${actualTotalBatches}). Starting post-processing.`,
      "log",
    );

    await this.contextService.finalizeContextAnalysis({
      userId,
      analysisRecordId,
      // Use actual value from stats
      totalBatches: actualTotalBatches,
      totalThreads: threadsInRange,
      sentEmailsCount: sentEmailsData,
      analysisStats,
      trueVipContacts,
    });

    this.logger.log(
      `[Worker ${workerId}] ✅ Completed context analysis for user ${userId} (analysis ${analysisRecordId}). All ${jobData.totalBatches} batches processed.`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] ✅ Completed context analysis for user ${userId} (analysis ${analysisRecordId}). All ${jobData.totalBatches} batches processed.`,
      "log",
    );
  }

  /**
   * Core handler for a finalize-context-analysis job.
   */
  private async processFinalizationJob(
    job: Job<FinalizationJob>,
  ): Promise<void> {
    const jobData = job.data;
    const { userId, analysisRecordId, totalBatches } = jobData;
    const workerId = job.id || "unknown";
    const tracker = new JobPerformanceTracker(
      JOB_NAMES.FINALIZE_CONTEXT_ANALYSIS,
      workerId,
      this.cloudWatchService,
    );
    tracker.setMetadata({ userId, threadId: analysisRecordId });

    this.logger.log(
      `[Worker ${workerId}] Finalization job received for analysis ${analysisRecordId} (totalBatches from job data: ${totalBatches})`,
    );
    writeAnalysisLog(
      `[Worker ${workerId}] Finalization job received for analysis ${analysisRecordId} (totalBatches from job data: ${totalBatches})`,
      "log",
    );

    const actualTotalBatches = await this.resolveActualTotalBatchesWithUserKey(
      workerId,
      userId,
      analysisRecordId,
      totalBatches,
      tracker,
    );

    if (actualTotalBatches === null) {
      tracker.finish(
        new Error(
          `Analysis record ${analysisRecordId} not found or has no stats`,
        ),
      );
      return;
    }

    // CRITICAL: If totalBatches is 0, this is an invalid finalization job
    if (
      !this.validateActualTotalBatches(
        workerId,
        actualTotalBatches,
        totalBatches,
        tracker,
      )
    ) {
      // Exit early - don't process (checkBatchesComplete will handle re-queueing)
      return;
    }

    try {
      // runPostProcessing reads encrypted ContextAnalysis batch payloads
      // and writes encrypted UserContext rows. Wrap with the user's KMS
      // key so transformers operate under the per-user envelope.
      await this.userEncryptionService.withUserKey(userId, async () => {
        // Check if all batches are complete using actual totalBatches from stats
        // CRITICAL: Use actualTotalBatches from stats, not from job data
        const allBatchesComplete =
          await this.contextService.checkBatchesComplete(
            analysisRecordId,
            // Use actual value from stats, not job data
            actualTotalBatches,
          );

        if (!allBatchesComplete) {
          // Not all batches are done yet - re-queue this job with a delay
          const completedBatches =
            await this.contextService.getCompletedBatchCount(analysisRecordId);
          await this.requeueFinalizationJob(
            workerId,
            jobData,
            analysisRecordId,
            actualTotalBatches,
            completedBatches,
          );
          return;
        }

        // All batches are complete - do the post-processing
        await this.runPostProcessing(workerId, jobData, actualTotalBatches);
      });
      tracker.finish();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[Worker ${workerId}] Failed to finalize context analysis for ${analysisRecordId}: ${errorMessage}`,
        errorStack || error,
      );
      writeAnalysisLog(
        `[Worker ${workerId}] Failed to finalize context analysis for ${analysisRecordId}: ${errorMessage}`,
        "error",
      );
      tracker.finish(error as Error);
      throw error;
    }
  }
}
