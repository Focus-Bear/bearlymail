import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { MoreThan, Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { DAYS, MILLISECONDS } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { getJobPriority } from "../queue/job-priorities";
import { getErrorMessage } from "../types/common";
import { writeAnalysisLog } from "./context-analysis-logger";
import { BatchPayloadItem } from "./context-batch-payload.service";
import {
  ContextSqsDispatchService,
  SqsEnqueueJobContext,
} from "./context-sqs-dispatch.service";

/**
 * Service for managing context analysis progress tracking and job synchronization.
 * Handles analysis progress queries, batch completion checks, and SQS job syncing.
 */
@Injectable()
export class ContextAnalysisProgressService {
  private readonly logger = new Logger(ContextAnalysisProgressService.name);

  constructor(
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
    private readonly sqsDispatchService: ContextSqsDispatchService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  /**
   * Local (no-SQS) re-queue of a single missing batch as a PgBoss
   * ANALYZE_CONTEXT_BATCH job, mirroring the SQS path's shape so the caller can
   * read `result.jobId` uniformly.
   */
  private async requeueSingleBatchLocally(
    batchIndex: number,
    batchPayload: BatchPayloadItem[],
    ctx: {
      userId: string;
      analysisRecordId: string;
      sentPayload: unknown[];
      currentContextForPrompt: unknown[];
      twelveDaysAgo: Date;
      fiveDaysAgo: Date;
      userEmail: string | null;
    },
    totalBatches: number,
  ): Promise<{ jobId: string | null }> {
    const jobId = await this.boss.send(
      JOB_NAMES.ANALYZE_CONTEXT_BATCH,
      {
        userId: ctx.userId,
        batchIndex,
        batch: batchPayload,
        sentPayload: batchIndex === 0 ? ctx.sentPayload : [],
        userEmail: ctx.userEmail ?? undefined,
        currentContextForPrompt: ctx.currentContextForPrompt,
        analysisRecordId: ctx.analysisRecordId,
        totalBatches,
        after: ctx.twelveDaysAgo.toISOString(),
        before: ctx.fiveDaysAgo.toISOString(),
      },
      {
        priority: getJobPriority(JOB_NAMES.ANALYZE_CONTEXT_BATCH),
        singletonKey: `analyze-context-batch-${ctx.analysisRecordId}-${batchIndex}`,
      },
    );
    return { jobId };
  }

  /**
   * Starts a fresh context analysis for the user (moved out of
   * ContextController — business logic lives in services):
   * 1. supersede any still-"running" analysis so stale insights never show,
   * 2. create a new record with EMPTY stats (no batch results from prior runs),
   * 3. enqueue the ANALYZE_CONTEXT job.
   * Returns the new analysis id for the frontend to poll.
   */
  async startAnalysis(userId: string): Promise<{ analysisId: string }> {
    await this.contextAnalysisRepository.update(
      { userId, status: "running" },
      { status: "failed", errorMessage: "Superseded by new analysis" },
    );

    const analysisRecord = this.contextAnalysisRepository.create({
      userId,
      status: "running",
      progress: 0,
      total: 100,
      analyzedCount: 0,
      stats: {
        totalThreads: 0,
        outboundEmails: 0,
        threadsNeverOpened: 0,
        threadsReadButNotReplied: 0,
        vipContactsEvaluated: 0,
        // Explicitly empty — no insights from previous runs.
        batchResults: {},
        batchJobIds: {},
        batchPayloadsForRetry: {},
      },
    });
    await this.contextAnalysisRepository.save(analysisRecord);
    this.logger.log(
      `Created analysis record ${analysisRecord.id} for user ${userId}`,
    );

    const priority = getJobPriority(JOB_NAMES.ANALYZE_CONTEXT);
    try {
      await this.boss.send(
        JOB_NAMES.ANALYZE_CONTEXT,
        { userId, analysisId: analysisRecord.id },
        { priority },
      );
    } catch (error) {
      // Without this, a failed enqueue strands the record in "running" forever
      // (no job will ever advance it).
      await this.contextAnalysisRepository.update(
        { id: analysisRecord.id },
        { status: "failed", errorMessage: "Failed to enqueue analysis job" },
      );
      throw error;
    }
    this.logger.log(
      `Enqueued ${JOB_NAMES.ANALYZE_CONTEXT} (priority ${priority}) for user ${userId}, analysis ${analysisRecord.id}`,
    );
    return { analysisId: analysisRecord.id };
  }

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
   * Check and sync jobs between DB and SQS.
   * Finds missing batches and re-queues them via SQS → Lambda.
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
      (stats.batchPayloadsForRetry as Record<number, BatchPayloadItem[]>) || {};
    const totalBatches = stats.totalBatches as number;

    if (!this.validateTotalBatches(totalBatches, batchResults)) {
      return;
    }

    const completedBatchesInDb = Object.keys(batchResults).length;
    const failedBatchesInDb = failedBatches.length;
    const remainingBatchesInDb =
      totalBatches - completedBatchesInDb - failedBatchesInDb;

    this.logSyncState({
      analysisId: analysis.id,
      userId,
      totalBatches,
      completedBatchesInDb,
      failedBatchesInDb,
      remainingBatchesInDb,
      batchJobIds,
    });

    const missingBatchIndices = this.findMissingBatchIndices(
      totalBatches,
      batchResults,
      failedBatches,
    );

    if (missingBatchIndices.length > 0) {
      await this.requeueMissingBatches({
        userId,
        analysisId: analysis.id,
        stats,
        missingBatchIndices,
        batchJobIds,
        batchPayloadsForRetry,
      });
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
   * Log the current DB state for diagnostics.
   */
  private logSyncState(state: {
    analysisId: string;
    userId: string;
    totalBatches: number;
    completedBatchesInDb: number;
    failedBatchesInDb: number;
    remainingBatchesInDb: number;
    batchJobIds: Record<number, string | null>;
  }): void {
    const {
      analysisId,
      userId,
      totalBatches,
      completedBatchesInDb,
      failedBatchesInDb,
      remainingBatchesInDb,
      batchJobIds,
    } = state;
    const batchesWithJobIdsInDb = Object.keys(batchJobIds).filter(
      (key) => batchJobIds[parseInt(key, 10)] !== null,
    ).length;

    this.logger.debug(
      `\n[PROGRESS-CHECK] =========================================\n` +
        `Analysis: ${analysisId} (User: ${userId})\n` +
        `\n📊 DB State:\n` +
        `  • Total batches: ${totalBatches}\n` +
        `  • Completed in DB: ${completedBatchesInDb}\n` +
        `  • Failed in DB: ${failedBatchesInDb}\n` +
        `  • Remaining in DB: ${remainingBatchesInDb}\n` +
        `  • Batches with job IDs: ${batchesWithJobIdsInDb}\n` +
        `=========================================\n`,
    );

    this.logger.log(
      `[PROGRESS-CHECK] Analysis ${analysisId} (user ${userId}): ` +
        `DB: ${completedBatchesInDb}/${totalBatches} completed, ` +
        `${failedBatchesInDb} failed, ${remainingBatchesInDb} remaining`,
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
   * Re-queue missing batches via SQS → Lambda, updating batchJobIds in the DB.
   * SQS deduplication IDs prevent double-processing of batches already in-flight.
   */
  private async requeueMissingBatches(options: {
    userId: string;
    analysisId: string;
    stats: Record<string, unknown>;
    missingBatchIndices: number[];
    batchJobIds: Record<number, string | null>;
    batchPayloadsForRetry: Record<number, BatchPayloadItem[]>;
  }): Promise<void> {
    const {
      userId,
      analysisId,
      stats,
      missingBatchIndices,
      batchJobIds,
      batchPayloadsForRetry,
    } = options;
    this.logger.warn(
      `[PROGRESS-CHECK] Found ${missingBatchIndices.length} missing batches: ${missingBatchIndices.slice(0, 10).join(", ")}${missingBatchIndices.length > 10 ? ` ... (${missingBatchIndices.length - 10} more)` : ""}`,
    );

    let requeuedCount = 0;
    let requeueFailedCount = 0;

    const sqsCtx: SqsEnqueueJobContext = {
      userId,
      analysisRecordId: analysisId,
      sentPayload: [],
      currentContextForPrompt: [],
      twelveDaysAgo: new Date(Date.now() - DAYS.TWELVE * MILLISECONDS.DAY),
      fiveDaysAgo: new Date(Date.now() - 5 * MILLISECONDS.DAY),
      userEmail: null,
      totalThreadIds: (stats.totalBatches as number) || 0,
      analysisBatchSize: 0,
    };

    for (const batchIndex of missingBatchIndices) {
      const batchPayload = batchPayloadsForRetry[batchIndex];
      if (batchPayload && batchPayload.length > 0) {
        const enqueueErrors: Array<{ batchNum: number; error: string }> = [];
        try {
          // Local mode (no SQS): re-queue the batch as a PgBoss job the
          // in-process worker handles, instead of dispatching to Lambda.
          const result = process.env.CONTEXT_ANALYSIS_SQS_QUEUE_URL
            ? await this.sqsDispatchService.enqueueSingleBatchViaSqs(
                batchIndex,
                batchPayload,
                sqsCtx,
                enqueueErrors,
              )
            : await this.requeueSingleBatchLocally(
                batchIndex,
                batchPayload,
                sqsCtx,
                (stats.totalBatches as number) || 0,
              );

          if (result.jobId) {
            batchJobIds[batchIndex] = result.jobId;
            requeuedCount++;
            this.logger.log(
              `[PROGRESS-CHECK] ✅ Re-queued batch ${batchIndex} via SQS, message ID: ${result.jobId}`,
            );
          } else {
            requeueFailedCount++;
            this.logger.error(
              `[PROGRESS-CHECK] ❌ Failed to re-queue batch ${batchIndex} via SQS: ${enqueueErrors.map((err) => err.error).join(", ") || "no message ID returned"}`,
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
        `[PROGRESS-CHECK] Re-queued ${requeuedCount} batches via SQS, ${requeueFailedCount} failed`,
      );
    }
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
