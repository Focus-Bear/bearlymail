import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { MoreThan, Repository } from "typeorm";

import { MILLISECONDS } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { getJobPriority } from "../queue/job-priorities";
import { getErrorMessage } from "../types/common";
import { writeAnalysisLog } from "./context-analysis-logger";

/**
 * Service for managing context analysis progress tracking and job synchronization.
 * Handles analysis progress queries, batch completion checks, and PgBoss job syncing.
 */
@Injectable()
export class ContextAnalysisProgressService {
  private readonly logger = new Logger(ContextAnalysisProgressService.name);

  constructor(
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
    @Inject("PG_BOSS") private boss: PgBoss,
  ) {}

  /**
   * Get an analysis record by ID
   */
  async getAnalysisRecordById(
    analysisRecordId: string,
  ): Promise<ContextAnalysis | null> {
    return await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecordId },
    });
  }

  /**
   * Check if all batches are complete for an analysis
   */
  async getCompletedBatchCount(analysisRecordId: string): Promise<number> {
    const analysisRecord = await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecordId },
    });

    if (!analysisRecord || !analysisRecord.stats) {
      return 0;
    }

    const { stats } = analysisRecord;
    const batchResults = (stats.batchResults as Record<string, unknown>) || {};
    return Object.keys(batchResults).length;
  }

  /**
   * Find the most recent active or completed analysis for a user
   */
  async findActiveAnalysis(
    userId: string,
    analysisId?: string,
  ): Promise<ContextAnalysis | null> {
    if (analysisId) {
      return await this.contextAnalysisRepository.findOne({
        where: { id: analysisId, userId },
      });
    }

    // Fall back to most recent running/pending analysis
    const oneHourAgo = new Date(Date.now() - MILLISECONDS.HOUR);
    let analysis = await this.contextAnalysisRepository.findOne({
      where: [
        { userId, status: "running", createdAt: MoreThan(oneHourAgo) },
        { userId, status: "pending", createdAt: MoreThan(oneHourAgo) },
      ],
      order: { createdAt: "DESC" },
    });

    if (!analysis) {
      analysis = await this.contextAnalysisRepository.findOne({
        where: [
          { userId, status: "running" },
          { userId, status: "pending" },
        ],
        order: { createdAt: "DESC" },
      });
    }

    return analysis;
  }

  /**
   * Find the most recently completed analysis for a user
   */
  async findRecentlyCompletedAnalysis(
    userId: string,
    maxAgeMinutes: number = 5,
  ): Promise<ContextAnalysis | null> {
    const recentCompleted = await this.contextAnalysisRepository.findOne({
      where: { userId, status: "completed" },
      order: { createdAt: "DESC" },
    });

    if (recentCompleted && recentCompleted.updatedAt) {
      const completedAgo = Date.now() - recentCompleted.updatedAt.getTime();
      if (completedAgo < maxAgeMinutes * MILLISECONDS.MINUTE) {
        return recentCompleted;
      }
    }

    return null;
  }

  /**
   * Check and sync jobs between DB and PgBoss
   * Logs the difference and re-queues missing jobs
   */
  async checkAndSyncJobs(userId: string, analysisId?: string): Promise<void> {
    const analysis = await this.findActiveAnalysis(userId, analysisId);

    if (!analysis || !analysis.stats) {
      this.logger.debug(
        `[PROGRESS-CHECK] No active analysis found for user ${userId}`,
      );
      return;
    }

    const { stats } = analysis;
    const batchResults = (stats.batchResults as Record<string, unknown>) || {};
    const failedBatches = (stats.failedBatches as number[]) || [];
    const batchJobIds =
      (stats.batchJobIds as Record<number, string | null>) || {};
    const batchPayloadsForRetry =
      (stats.batchPayloadsForRetry as Record<
        number,
        Array<{
          threadId?: string;
          from: string;
          fromName?: string;
          subject: string;
          body: string;
          receivedAt: string;
          isRead?: boolean;
          timeToReply?: number | null;
          starCount?: number;
          isArchived?: boolean;
        }>
      >) || {};
    const totalBatches = stats.totalBatches as number;

    if (!this.validateTotalBatches(totalBatches, batchResults)) {
      return;
    }

    const completedBatchesInDb = Object.keys(batchResults).length;
    const failedBatchesInDb = failedBatches.length;
    const remainingBatchesInDb =
      totalBatches - completedBatchesInDb - failedBatchesInDb;

    const queuedJobsInPgBoss = await this.getQueuedJobCount();
    if (queuedJobsInPgBoss === null) {
      return;
    }

    this.logSyncState({
      analysisId: analysis.id,
      userId,
      totalBatches,
      completedBatchesInDb,
      failedBatchesInDb,
      remainingBatchesInDb,
      batchJobIds,
      queuedJobsInPgBoss,
    });

    const missingBatchIndices = this.findMissingBatchIndices(
      totalBatches,
      batchResults,
      failedBatches,
    );

    if (missingBatchIndices.length > 0) {
      await this.requeueMissingBatches(
        userId,
        analysis.id,
        stats,
        missingBatchIndices,
        batchJobIds,
        batchPayloadsForRetry,
      );
    } else {
      this.logger.log(
        `[PROGRESS-CHECK] ✅ All batches accounted for - no missing jobs detected`,
      );
    }
  }

  /**
   * Validate that totalBatches is set and non-zero; log and return false if not.
   */
  private validateTotalBatches(
    totalBatches: number,
    batchResults: Record<string, unknown>,
  ): boolean {
    if (!totalBatches || totalBatches === 0) {
      const completedBatchIndices = Object.keys(batchResults).map((key) =>
        parseInt(key, 10),
      );
      this.logger.log(
        `[PROGRESS-CHECK] totalBatches is ${totalBatches || "not set"} and ${completedBatchIndices.length} batches completed. ` +
          `This is normal during progressive fetching - NOT inferring totalBatches.`,
      );
      return false;
    }
    return true;
  }

  /**
   * Get the current size of the analyze-context-batch queue.
   * Returns null if the call fails (caller should abort).
   */
  private async getQueuedJobCount(): Promise<number | null> {
    try {
      return await this.boss.getQueueSize("analyze-context-batch");
    } catch (error) {
      this.logger.error(
        `[PROGRESS-CHECK] Failed to get PgBoss queue size: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Log the current DB vs PgBoss state comparison.
   */
  private logSyncState(state: {
    analysisId: string;
    userId: string;
    totalBatches: number;
    completedBatchesInDb: number;
    failedBatchesInDb: number;
    remainingBatchesInDb: number;
    batchJobIds: Record<number, string | null>;
    queuedJobsInPgBoss: number;
  }): void {
    const {
      analysisId,
      userId,
      totalBatches,
      completedBatchesInDb,
      failedBatchesInDb,
      remainingBatchesInDb,
      batchJobIds,
      queuedJobsInPgBoss,
    } = state;
    const batchesWithJobIdsInDb = Object.keys(batchJobIds).filter(
      (key) => batchJobIds[parseInt(key, 10)] !== null,
    ).length;
    const missingJobs = Math.max(0, remainingBatchesInDb - queuedJobsInPgBoss);

    this.logger.debug(
      `\n[PROGRESS-CHECK] =========================================\n` +
        `Analysis: ${analysisId} (User: ${userId})\n` +
        `\n📊 DB State:\n` +
        `  • Total batches: ${totalBatches}\n` +
        `  • Completed in DB: ${completedBatchesInDb}\n` +
        `  • Failed in DB: ${failedBatchesInDb}\n` +
        `  • Remaining in DB: ${remainingBatchesInDb}\n` +
        `  • Batches with job IDs: ${batchesWithJobIdsInDb}\n` +
        `\n📦 PgBoss State:\n` +
        `  • Queued jobs (pending + active): ${queuedJobsInPgBoss}\n` +
        `\n🔍 Difference:\n` +
        `  • Expected remaining: ${remainingBatchesInDb}\n` +
        `  • Actually queued: ${queuedJobsInPgBoss}\n` +
        `  • Missing jobs: ${missingJobs}\n` +
        `=========================================\n`,
    );

    this.logger.log(
      `[PROGRESS-CHECK] Analysis ${analysisId} (user ${userId}): ` +
        `DB: ${completedBatchesInDb}/${totalBatches} completed, ` +
        `${failedBatchesInDb} failed, ${remainingBatchesInDb} remaining | ` +
        `PgBoss: ${queuedJobsInPgBoss} queued | ` +
        `Missing: ${missingJobs}`,
    );
  }

  /**
   * Determine which batch indices are neither completed nor failed.
   */
  private findMissingBatchIndices(
    totalBatches: number,
    batchResults: Record<string, unknown>,
    failedBatches: number[],
  ): number[] {
    const completedBatchIndices = Object.keys(batchResults).map((key) =>
      parseInt(key, 10),
    );
    const missing: number[] = [];
    for (let i = 0; i < totalBatches; i++) {
      if (!completedBatchIndices.includes(i) && !failedBatches.includes(i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  /**
   * Re-queue batches that are missing from PgBoss, updating batchJobIds in the DB.
   */
  private async requeueMissingBatches(
    userId: string,
    analysisId: string,
    stats: Record<string, unknown>,
    missingBatchIndices: number[],
    batchJobIds: Record<number, string | null>,
    batchPayloadsForRetry: Record<
      number,
      Array<{
        threadId?: string;
        from: string;
        fromName?: string;
        subject: string;
        body: string;
        receivedAt: string;
        isRead?: boolean;
        timeToReply?: number | null;
        starCount?: number;
        isArchived?: boolean;
      }>
    >,
  ): Promise<void> {
    this.logger.warn(
      `[PROGRESS-CHECK] Found ${missingBatchIndices.length} missing batches: ${missingBatchIndices.slice(0, 10).join(", ")}${missingBatchIndices.length > 10 ? ` ... (${missingBatchIndices.length - 10} more)` : ""}`,
    );

    let requeuedCount = 0;
    let requeueFailedCount = 0;

    for (const batchIndex of missingBatchIndices) {
      const shouldSkip = await this.checkExistingJobStillActive(
        batchIndex,
        batchJobIds[batchIndex] ?? null,
      );
      if (shouldSkip) {
        continue;
      }

      const batchPayload = batchPayloadsForRetry[batchIndex];
      if (batchPayload && batchPayload.length > 0) {
        try {
          const jobId = await this.boss.send(
            "analyze-context-batch",
            {
              userId,
              batchIndex,
              emailBatch: batchPayload,
              analysisId,
            },
            {
              priority: getJobPriority("analyze-context-batch"),
              singletonKey: `context-batch-${analysisId}-${batchIndex}`,
            },
          );

          if (jobId) {
            batchJobIds[batchIndex] = jobId;
            requeuedCount++;
            this.logger.log(
              `[PROGRESS-CHECK] ✅ Re-queued batch ${batchIndex} with job ID ${jobId}`,
            );
          }
        } catch (error) {
          requeueFailedCount++;
          this.logger.error(
            `[PROGRESS-CHECK] ❌ Failed to re-queue batch ${batchIndex}: ${getErrorMessage(error)}`,
          );
        }
      } else {
        this.logger.warn(
          `[PROGRESS-CHECK] ⚠️ Cannot re-queue batch ${batchIndex} - no payload found in batchPayloadsForRetry`,
        );
      }
    }

    if (requeuedCount > 0 || requeueFailedCount > 0) {
      await this.contextAnalysisRepository.update(
        { id: analysisId },
        {
          stats: {
            ...stats,
            batchJobIds,
          },
        },
      );
      this.logger.log(
        `[PROGRESS-CHECK] Re-queued ${requeuedCount} batches, ${requeueFailedCount} failed`,
      );
    }
  }

  /**
   * Check whether an existing job for a batch is still active in PgBoss.
   * Returns true if the job is still running (caller should skip re-queuing).
   */
  private async checkExistingJobStillActive(
    batchIndex: number,
    existingJobId: string | null,
  ): Promise<boolean> {
    if (!existingJobId) {
      return false;
    }
    try {
      const jobDetails = await this.boss.getJobById(existingJobId);
      if (
        jobDetails &&
        (jobDetails.state === "created" ||
          jobDetails.state === "active" ||
          jobDetails.state === "retry")
      ) {
        this.logger.debug(
          `[PROGRESS-CHECK] Batch ${batchIndex} has job ID ${existingJobId} with state '${jobDetails.state}' - still processing, skipping re-queue`,
        );
        return true;
      }
      this.logger.warn(
        `[PROGRESS-CHECK] ⚠️ Batch ${batchIndex} has job ID ${existingJobId} but job is ${jobDetails ? `in state '${jobDetails.state}'` : "not found in PgBoss"} - will re-queue`,
      );
    } catch (error) {
      this.logger.warn(
        `[PROGRESS-CHECK] ⚠️ Failed to check job ${existingJobId} for batch ${batchIndex}: ${getErrorMessage(error)} - will attempt re-queue`,
      );
    }
    return false;
  }

  /**
   * Check if all batches are complete for an analysis
   */
  async checkBatchesComplete(
    analysisRecordId: string,
    totalBatches: number,
  ): Promise<boolean> {
    const analysisRecord = await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecordId },
    });

    if (!analysisRecord || !analysisRecord.stats) {
      writeAnalysisLog(
        `[BATCH-CHECK] Analysis record ${analysisRecordId} not found or has no stats`,
        "warn",
      );
      return false;
    }

    const { stats } = analysisRecord;
    const batchResults = (stats.batchResults as Record<string, unknown>) || {};
    const failedBatches = (stats.failedBatches as number[]) || [];

    // CRITICAL: If totalBatches is 0, batches haven't been enqueued yet
    if (totalBatches === 0 || !totalBatches) {
      this.logger.warn(
        `[BATCH-CHECK] totalBatches is ${totalBatches} - batches haven't been enqueued yet. Cannot be complete.`,
      );
      writeAnalysisLog(
        `[BATCH-CHECK] totalBatches is ${totalBatches} - batches not enqueued yet`,
        "warn",
      );
      return false;
    }

    const completedCount = Object.keys(batchResults).length;
    const failedCount = failedBatches.length;
    const totalProcessed = completedCount + failedCount;

    this.logger.log(
      `[BATCH-CHECK] Analysis ${analysisRecordId}: ${completedCount} completed + ${failedCount} failed = ${totalProcessed}/${totalBatches}`,
    );
    writeAnalysisLog(
      `[BATCH-CHECK] ${completedCount} completed + ${failedCount} failed = ${totalProcessed}/${totalBatches}`,
      "log",
    );

    return totalProcessed >= totalBatches;
  }

  /**
   * Update analysis status
   */
  async updateAnalysisStatus(
    analysisId: string,
    status: "pending" | "running" | "completed" | "failed",
    errorMessage?: string,
  ): Promise<void> {
    const updates: Partial<ContextAnalysis> = { status };
    if (errorMessage) {
      updates.errorMessage = errorMessage;
    }
    await this.contextAnalysisRepository.update({ id: analysisId }, updates);
  }

  /**
   * Update analysis stats
   */
  async updateAnalysisStats(
    analysisId: string,
    stats: Record<string, unknown>,
  ): Promise<void> {
    const record = await this.contextAnalysisRepository.findOne({
      where: { id: analysisId },
    });
    if (record) {
      await this.contextAnalysisRepository.update(
        { id: analysisId },
        {
          stats: {
            ...record.stats,
            ...stats,
          },
        },
      );
    }
  }
}
