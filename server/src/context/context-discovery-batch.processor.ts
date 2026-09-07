import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import type { Job, PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { PERCENTAGES } from "../constants/percentages";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { LLMService } from "../llm/llm.service";
import type { DiscoveryResult } from "../llm/llm-discover-user-context";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { registerWorker } from "../queue/register-worker";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { getErrorMessage } from "../types/common";
import { UsersService } from "../users/users.service";
import { writeAnalysisLog } from "./context-analysis-logger";
import { classifyBatchError } from "./context-batch-analysis.helpers";
import {
  DiscoveryBatchFailure,
  DiscoveryBatchJob,
  DiscoveryBatchResult,
  StoredBatchResult,
} from "./context-discovery.types";

const AI_VOLUME_LIMIT_ERROR_TYPE = "ai_volume_limit";
const AI_VOLUME_LIMIT_MESSAGE =
  "AI usage limit reached for your plan — discovery batch skipped";
const DISCOVERY_FAILED_MESSAGE =
  "Discovery model returned nothing usable for this batch";

/**
 * Worker for one slim-discovery batch: a single cheap LLM call over ~20 thread
 * stubs that proposes categories and VIPs, persisted onto the analysis record
 * for the finalizer to merge. A batch that fails after Nova → Gemini escalation
 * is recorded as failed (never retried in a loop) so finalization still
 * completes with whatever the other batches found.
 */
@Injectable()
export class ContextDiscoveryBatchProcessor implements OnModuleInit {
  private readonly logger = new Logger(ContextDiscoveryBatchProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private llmService: LLMService,
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
    private usersService: UsersService,
    private cloudWatchService: CloudWatchService,
    private readonly userEncryptionService: UserEncryptionService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async onModuleInit() {
    await registerWorker(this.boss, JOB_NAMES.ANALYZE_CONTEXT_BATCH, (job) =>
      this.handleDiscoveryBatchJob(job as Job<DiscoveryBatchJob>),
    );
    this.logger.log("Context discovery batch worker registered");
    writeAnalysisLog("Context discovery batch worker registered", "log");
  }

  private async handleDiscoveryBatchJob(
    job: Job<DiscoveryBatchJob>,
  ): Promise<void> {
    const jobData = job.data;
    const { userId, batchIndex, totalBatches, analysisRecordId } = jobData;
    const workerId = job.id || "unknown";
    const tracker = new JobPerformanceTracker(
      JOB_NAMES.ANALYZE_CONTEXT_BATCH,
      workerId,
      this.cloudWatchService,
    );
    tracker.setMetadata({ userId, threadId: analysisRecordId });
    this.logger.log(
      `[Worker ${workerId}] Discovery batch ${batchIndex + 1}/${totalBatches} for user ${userId} (${jobData.threads.length} threads)`,
    );

    // Encrypted ContextAnalysis.stats and UserContext reads/writes need the
    // per-user envelope key in ALS for the whole batch.
    await this.userEncryptionService.withUserKey(userId, async () => {
      const capacity = await this.subscriptionsService.checkAiCapacity(userId);
      if (!capacity.allowed) {
        this.logger.warn(
          `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} blocked for user ${userId}: ${AI_VOLUME_LIMIT_MESSAGE} (${capacity.percentUsed}% used)`,
        );
        await this.storeBatchOutcome(
          analysisRecordId,
          batchIndex,
          this.buildFailure(
            AI_VOLUME_LIMIT_MESSAGE,
            AI_VOLUME_LIMIT_ERROR_TYPE,
          ),
          0,
        );
        tracker.finish(new Error(AI_VOLUME_LIMIT_MESSAGE));
        return;
      }

      try {
        const discovery = await this.llmService.discoverUserContext({
          threads: jobData.threads,
          userEmail: jobData.userEmail ?? null,
          existingCategories: jobData.existingCategories ?? [],
          existingVipContacts: jobData.existingVipContacts ?? [],
          userId,
        });
        if (!discovery) {
          throw new Error(DISCOVERY_FAILED_MESSAGE);
        }
        const batchResults = await this.storeBatchOutcome(
          analysisRecordId,
          batchIndex,
          this.buildResult(discovery, jobData),
          jobData.threads.length,
        );
        await this.updateUserProgress(userId, batchResults, totalBatches);
        this.logger.log(
          `[Worker ${workerId}] ✅ Batch ${batchIndex + 1}/${totalBatches}: ${discovery.categories.length} categories, ${discovery.vipContacts.length} VIPs`,
        );
        tracker.finish();
      } catch (error) {
        const message = getErrorMessage(error);
        this.logger.error(
          `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} failed: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
        writeAnalysisLog(
          `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} failed: ${message}`,
          "error",
        );
        await this.storeBatchOutcome(
          analysisRecordId,
          batchIndex,
          this.buildFailure(message, classifyBatchError(error)),
          0,
        );
        tracker.finish(error as Error);
      }
    });
  }

  private buildResult(
    discovery: DiscoveryResult,
    jobData: DiscoveryBatchJob,
  ): DiscoveryBatchResult {
    return {
      categories: discovery.categories,
      vipContacts: discovery.vipContacts,
      urgentHints: discovery.urgentHints,
      notUrgentHints: discovery.notUrgentHints,
      threadIds: jobData.threads.map((thread) => thread.threadId),
      completedAt: new Date().toISOString(),
    };
  }

  private buildFailure(
    error: string,
    errorType: string,
  ): DiscoveryBatchFailure {
    return {
      error,
      errorType,
      failedAt: new Date().toISOString(),
      correlationId: randomUUID(),
    };
  }

  /**
   * Merge this batch's outcome into the analysis record, re-reading it first
   * so concurrent batches never clobber each other. A retried batch that was
   * already completed does not double-count analyzedCount.
   */
  private async storeBatchOutcome(
    analysisRecordId: string,
    batchIndex: number,
    outcome: StoredBatchResult,
    threadCount: number,
  ): Promise<Record<string, StoredBatchResult>> {
    const record = await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecordId },
    });
    if (!record) {
      throw new Error(
        `Analysis record ${analysisRecordId} not found for batch ${batchIndex}`,
      );
    }
    const stats = record.stats ?? {};
    const batchResults = (stats.batchResults ?? {}) as Record<
      string,
      StoredBatchResult
    >;
    const wasAlreadyStored = batchResults[String(batchIndex)] !== undefined;
    batchResults[String(batchIndex)] = outcome;

    const failedBatches = new Set(stats.failedBatches ?? []);
    if ("error" in outcome) {
      failedBatches.add(batchIndex);
    } else {
      failedBatches.delete(batchIndex);
    }

    record.stats = {
      ...stats,
      batchResults,
      failedBatches: [...failedBatches],
    };
    if (!wasAlreadyStored) {
      record.analyzedCount = (record.analyzedCount || 0) + threadCount;
    }
    await this.contextAnalysisRepository.save(record);
    return batchResults;
  }

  /** Batches own the 30→70% band of the onboarding progress bar. */
  private async updateUserProgress(
    userId: string,
    batchResults: Record<string, StoredBatchResult>,
    totalBatches: number,
  ): Promise<void> {
    const completedBatches = Object.keys(batchResults).length;
    const progressPercent =
      PERCENTAGES.THIRTY +
      Math.floor(
        (completedBatches / Math.max(totalBatches, 1)) *
          (PERCENTAGES.SEVENTY - PERCENTAGES.THIRTY),
      );
    try {
      await this.usersService.update(userId, {
        scanProgress: progressPercent,
        scanTotal: 100,
      });
    } catch (progressError) {
      this.logger.warn(
        `Failed to update discovery progress for user ${userId}: ${getErrorMessage(progressError)}`,
      );
    }
  }
}
