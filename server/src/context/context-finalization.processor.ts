import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import PgBoss = require("pg-boss");
import { ContextService } from "./context.service";
import { getJobPriority } from "../queue/job-priorities";
import { writeAnalysisLog } from "./context-analysis-logger";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { CloudWatchService } from "../aws/cloudwatch.service";
import { MILLISECONDS } from "../constants/time-constants";
import { RETRY_CONSTANTS } from "../constants/service-constants";

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
}

@Injectable()
export class ContextFinalizationProcessor implements OnModuleInit {
  private readonly logger = new Logger(ContextFinalizationProcessor.name);
  private readonly finalizationConcurrency: number;

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    private contextService: ContextService,
    private configService: ConfigService,
    private cloudWatchService: CloudWatchService,
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

    await this.boss.work(
      "finalize-context-analysis",
      { teamSize: this.finalizationConcurrency } as { teamSize: number },
      async (job) => {
        const jobData = job.data as FinalizationJob;
        const {
          userId,
          analysisRecordId,
          totalBatches,
          threadsInRange,
          sentEmailsData,
          analysisStats,
          trueVipContacts,
        } = jobData;
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          "finalize-context-analysis",
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

        // CRITICAL: Get actual totalBatches from analysis record stats, not from job data
        // Job data might be stale or incorrect - always use the source of truth (DB stats)
        // Load analysis record first to get the actual totalBatches
        const analysisRecord =
          await this.contextService.getAnalysisRecordById(analysisRecordId);
        let actualTotalBatches = totalBatches;

        if (
          analysisRecord &&
          analysisRecord.stats &&
          analysisRecord.stats.totalBatches
        ) {
          actualTotalBatches = analysisRecord.stats.totalBatches as number;
          if (actualTotalBatches !== totalBatches) {
            this.logger.warn(
              `[Worker ${workerId}] ⚠️ totalBatches mismatch: job data says ${totalBatches}, but analysis stats says ${actualTotalBatches}. Using stats value.`,
            );
            writeAnalysisLog(
              `[Worker ${workerId}] ⚠️ totalBatches mismatch: job=${totalBatches}, stats=${actualTotalBatches}. Using stats.`,
              "warn",
            );
          }
        } else if (!analysisRecord || !analysisRecord.stats) {
          this.logger.error(
            `[Worker ${workerId}] ❌ ERROR: Analysis record ${analysisRecordId} not found or has no stats! Cannot proceed.`,
          );
          writeAnalysisLog(
            `[Worker ${workerId}] ❌ ERROR: Analysis record ${analysisRecordId} not found or has no stats!`,
            "error",
          );
          tracker.finish(
            new Error(
              `Analysis record ${analysisRecordId} not found or has no stats`,
            ),
          );
          return;
        } else {
          this.logger.warn(
            `[Worker ${workerId}] ⚠️ Analysis record exists but totalBatches not in stats. Using job data value: ${totalBatches}`,
          );
        }

        // CRITICAL: If totalBatches is 0, this is an invalid finalization job - batches were never enqueued
        // checkBatchesComplete will also check this, but we should fail fast here
        if (!actualTotalBatches || actualTotalBatches === 0) {
          this.logger.error(
            `[Worker ${workerId}] ❌ ERROR: Finalization job received with totalBatches = ${actualTotalBatches} (job data: ${totalBatches}). This should never happen - batches were never enqueued. checkBatchesComplete will return false.`,
          );
          writeAnalysisLog(
            `[Worker ${workerId}] ❌ ERROR: Finalization job with totalBatches = ${actualTotalBatches}. Batches were never enqueued.`,
            "error",
          );

          // Don't proceed - checkBatchesComplete will return false, and we'll re-queue
          // But log this as an error since it shouldn't happen
          tracker.finish(
            new Error(
              `Invalid finalization job: totalBatches is ${actualTotalBatches}`,
            ),
          );
          return; // Exit early - don't process (checkBatchesComplete will handle re-queueing)
        }

        try {
          // Check if all batches are complete using actual totalBatches from stats
          // CRITICAL: Use actualTotalBatches from stats, not from job data
          const allBatchesComplete =
            await this.contextService.checkBatchesComplete(
              analysisRecordId,
              actualTotalBatches, // Use actual value from stats, not job data
            );

          if (!allBatchesComplete) {
            // Not all batches are done yet - re-queue this job with a delay
            const completedBatches =
              await this.contextService.getCompletedBatchCount(
                analysisRecordId,
              );
            this.logger.log(
              `[Worker ${workerId}] Not all batches complete yet (${completedBatches}/${actualTotalBatches}). Re-queuing finalization job in 30 seconds.`,
            );
            writeAnalysisLog(
              `[Worker ${workerId}] Not all batches complete yet (${completedBatches}/${actualTotalBatches}). Re-queuing finalization job in 30 seconds.`,
              "log",
            );

            // Update job data with correct totalBatches before re-queuing
            const updatedJobData = {
              ...jobData,
              totalBatches: actualTotalBatches,
            };

            // Use a unique key with timestamp to avoid singleton conflict with current job
            const retryJobId = await this.boss.send(
              "finalize-context-analysis",
              updatedJobData,
              {
                priority: getJobPriority("finalize-context-analysis", false),
                singletonKey: `finalize-context-analysis-${analysisRecordId}-retry-${Date.now()}`,
                singletonMinutes: 1, // Short duration for retry jobs
                startAfter: new Date(
                  Date.now() +
                    RETRY_CONSTANTS.FINALIZATION_RETRY_DELAY_SECONDS *
                      MILLISECONDS.SECOND,
                ), // Retry in 10 seconds (faster retry)
              },
            );
            this.logger.log(
              `[Worker ${workerId}] Re-queued finalization job with ID: ${retryJobId}`,
            );
            writeAnalysisLog(
              `[Worker ${workerId}] Re-queued finalization job with ID: ${retryJobId}`,
              "log",
            );
            tracker.finish(); // Log even when re-queuing
            return;
          }

          // All batches are complete - do the post-processing
          const completedBatches =
            await this.contextService.getCompletedBatchCount(analysisRecordId);
          this.logger.log(
            `[Worker ${workerId}] ✅ All batches complete (${completedBatches}/${actualTotalBatches}). Starting post-processing.`,
          );
          writeAnalysisLog(
            `[Worker ${workerId}] ✅ All batches complete (${completedBatches}/${actualTotalBatches}). Starting post-processing.`,
            "log",
          );

          await this.contextService.finalizeContextAnalysis(
            userId,
            analysisRecordId,
            actualTotalBatches, // Use actual value from stats
            threadsInRange,
            sentEmailsData,
            analysisStats,
            trueVipContacts,
          );

          this.logger.log(
            `[Worker ${workerId}] ✅ Completed context analysis for user ${userId} (analysis ${analysisRecordId}). All ${totalBatches} batches processed.`,
          );
          console.log(
            `[PROCESSOR] [Worker ${workerId}] ✅ Completed context analysis for user ${userId} (analysis ${analysisRecordId}). All ${totalBatches} batches processed.`,
          );
          writeAnalysisLog(
            `[Worker ${workerId}] ✅ Completed context analysis for user ${userId} (analysis ${analysisRecordId}). All ${totalBatches} batches processed.`,
            "log",
          );
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
      },
    );

    this.logger.log("Context finalization worker registered successfully");
    writeAnalysisLog(
      "Context finalization worker registered successfully",
      "log",
    );
  }
}
