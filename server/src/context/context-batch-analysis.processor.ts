import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import PgBoss = require("pg-boss");
import { LLMService } from "../llm/llm.service";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { writeAnalysisLog } from "./context-analysis-logger";
import { getErrorMessage } from "../types/common";
import { ContextGmailDataService } from "./context-gmail-data.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { GMAIL_LABELS } from "../constants/email-labels";
import { UsersService } from "../users/users.service";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { PERCENTAGES } from "../constants/percentages";
import { CloudWatchService } from "../aws/cloudwatch.service";

interface BatchAnalysisJob {
  userId: string;
  batchIndex: number;
  // New: thread IDs to fetch and process
  threadIds?: string[];
  // Legacy: pre-processed payloads
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
  // Date range for fetching threads
  after?: string;
  before?: string;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(
  attemptNumber: number,
  baseDelay: number = 1000,
  maxDelay: number = 60000,
  jitterFactor: number = 0.3,
): number {
  // Exponential backoff: baseDelay * 2^attemptNumber
  const exponentialDelay = baseDelay * Math.pow(2, attemptNumber);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter: random(0, jitterFactor) * cappedDelay
  const jitter = Math.random() * jitterFactor * cappedDelay;

  return Math.floor(cappedDelay + jitter);
}

@Injectable()
export class ContextBatchAnalysisProcessor implements OnModuleInit {
  private readonly logger = new Logger(ContextBatchAnalysisProcessor.name);
  private readonly batchConcurrency: number;

  // eslint-disable-next-line max-params
  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    private llmService: LLMService,
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
    private configService: ConfigService,
    private gmailDataService: ContextGmailDataService,
    private usersService: UsersService,
    private cloudWatchService: CloudWatchService,
  ) {
    // Get CPU cores for optimal concurrency
    const cpuCores = os.cpus().length;
    // For batch analysis (LLM bound), use moderate concurrency to avoid rate limits
    // Allow more parallelism than full analysis since batches are smaller
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
    // Worker for batch analysis - process multiple batches in parallel
    this.logger.log(
      `Registering batch-analysis worker with concurrency: ${this.batchConcurrency}`,
    );
    writeAnalysisLog(
      `===== Batch Analysis Worker Registered ===== (concurrency: ${this.batchConcurrency})`,
      "log",
    );

    await this.boss.work(
      "analyze-context-batch",
      { teamSize: this.batchConcurrency },
      async (job) => {
        const jobData = job.data as BatchAnalysisJob;
        const {
          userId,
          batchIndex,
          threadIds,
          batch: legacyBatch,
          sentPayload,
          userEmail,
          currentContextForPrompt,
          analysisRecordId,
          totalBatches,
        } = jobData;
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          "analyze-context-batch",
          workerId,
          this.cloudWatchService,
        );
        tracker.setMetadata({ userId, threadId: analysisRecordId });

        // Log job received with detailed information
        const jobReceivedTime = new Date().toISOString();
        this.logger.log(
          `[Worker ${workerId}] ✅ JOB RECEIVED at ${jobReceivedTime}: batch ${batchIndex + 1}/${totalBatches} for user ${userId} (analysis ${analysisRecordId}, ${threadIds?.length || legacyBatch?.length || 0} threads)`,
        );
        writeAnalysisLog(
          `[Worker ${workerId}] ✅ JOB RECEIVED: batch ${batchIndex + 1}/${totalBatches} for analysis ${analysisRecordId}`,
          "log",
        );

        this.logger.log(
          `[Worker ${workerId}] 🚀 STARTING batch ${batchIndex + 1}/${totalBatches} for user ${userId} (${threadIds?.length || legacyBatch?.length || 0} threads)`,
        );
        writeAnalysisLog(
          `[Worker ${workerId}] 🚀 STARTING batch ${batchIndex + 1}/${totalBatches} for user ${userId}`,
          "log",
        );

        let attemptNumber = 0;
        const maxRetries = 5;
        // 1 second
        const baseDelay = 1000;
        // 60 seconds
        const maxDelay = 60000;

        while (attemptNumber <= maxRetries) {
          try {
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

            // If threadIds provided, fetch and process threads; otherwise use legacy batch
            let batch: Array<{
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
              userReplied?: boolean;
              emailCount?: number;
              readCount?: number;
              receivedHour?: number;
            }>;

            // Track timing for performance budgets
            let fetchDuration = 0;
            let processDuration = 0;

            if (threadIds && threadIds.length > 0) {
              // New approach: fetch threads by IDs and process them
              const fetchStartTime = Date.now();
              this.logger.log(
                `[Worker ${workerId}] 📥 Step 1/4: Fetching ${threadIds.length} threads by ID...`,
              );
              writeAnalysisLog(
                `[Worker ${workerId}] 📥 Step 1/4: Fetching ${threadIds.length} threads by ID...`,
                "log",
              );

              const threads = await this.gmailDataService.fetchThreadsByIds(
                userId,
                threadIds,
              );
              fetchDuration = Date.now() - fetchStartTime;
              const fetchExceeded =
                fetchDuration > PERFORMANCE_BUDGETS.BATCH_FETCH_THREADS;

              // Emit CloudWatch metric for batch fetch threads
              this.cloudWatchService
                .putPerformanceBudgetMetric({
                  budgetName: "BATCH_FETCH_THREADS",
                  budgetType: "batch",
                  durationMs: fetchDuration,
                  budgetMs: PERFORMANCE_BUDGETS.BATCH_FETCH_THREADS,
                  exceeded: fetchExceeded,
                  metadata: {
                    WorkerId: workerId,
                    UserId: userId,
                    ThreadCount: String(threads.length),
                  },
                })
                .catch((err) => {
                  this.logger.error("Failed to emit CloudWatch metric:", err);
                });

              this.logger.log(
                `[Worker ${workerId}] ✅ Fetched ${threads.length} threads in ${Math.round(fetchDuration / 1000)}s (budget: ${PERFORMANCE_BUDGETS.BATCH_FETCH_THREADS / 1000}s)${fetchExceeded ? " ⚠️ OVER BUDGET" : ""}`,
              );
              writeAnalysisLog(
                `[Worker ${workerId}] ✅ Fetched ${threads.length} threads in ${Math.round(fetchDuration / 1000)}s`,
                "log",
              );

              // Process threads into payloads
              const processStartTime = Date.now();
              this.logger.log(
                `[Worker ${workerId}] 🔄 Step 2/4: Processing ${threads.length} threads into analysis payloads...`,
              );
              writeAnalysisLog(
                `[Worker ${workerId}] 🔄 Step 2/4: Processing ${threads.length} threads into analysis payloads...`,
                "log",
              );

              batch = threads
                .map((thread) => {
                  const firstEmail = thread.emails?.sort(
                    (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime(),
                  )[0];
                  if (!firstEmail) {
                    return null;
                  }

                  const userReplied = thread.emails?.some(
                    (email) =>
                      email.labelIds?.includes(GMAIL_LABELS.SENT) ||
                      (userEmail && email.from.toLowerCase() === userEmail),
                  );

                  let quickestReply: number | null = null;
                  if (userReplied) {
                    const sentEmails = thread.emails.filter(
                      (email) =>
                        email.labelIds?.includes(GMAIL_LABELS.SENT) ||
                        (userEmail && email.from.toLowerCase() === userEmail),
                    );
                    const receivedEmails = thread.emails.filter(
                      (email) =>
                        !email.labelIds?.includes(GMAIL_LABELS.SENT) &&
                        (!userEmail || email.from.toLowerCase() !== userEmail),
                    );

                    if (sentEmails.length > 0 && receivedEmails.length > 0) {
                      const firstReceived = receivedEmails[0].receivedAt;
                      const firstSent = sentEmails[0].receivedAt;
                      const replyTimeHours =
                        (firstSent.getTime() - firstReceived.getTime()) /
                        (1000 * 60 * 60);
                      if (replyTimeHours >= 0) {
                        quickestReply = replyTimeHours;
                      }
                    }
                  }

                  return {
                    threadId: thread.id,
                    from: firstEmail.from,
                    fromName: firstEmail.fromName,
                    subject: firstEmail.subject,
                    body: cleanEmailContent(
                      firstEmail.body,
                      firstEmail.htmlBody,
                      1000,
                    ),
                    receivedAt: firstEmail.receivedAt.toISOString(),
                    isRead: firstEmail.isRead,
                    timeToReply: quickestReply ? quickestReply * 60 : null,
                    starCount: thread.starCount || 0,
                    isArchived: thread.isArchived || false,
                    userReplied,
                    emailCount: thread.emails?.length || 0,
                    readCount:
                      thread.emails?.filter((e) => e.isRead).length || 0,
                    receivedHour: firstEmail.receivedAt.getHours(),
                  };
                })
                .filter((t) => t !== null) as Array<{
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
                userReplied?: boolean;
                emailCount?: number;
                readCount?: number;
                receivedHour?: number;
              }>;
              processDuration = Date.now() - processStartTime;
              const processExceeded =
                processDuration > PERFORMANCE_BUDGETS.BATCH_PROCESS_THREADS;

              // Emit CloudWatch metric for batch process threads
              this.cloudWatchService
                .putPerformanceBudgetMetric({
                  budgetName: "BATCH_PROCESS_THREADS",
                  budgetType: "batch",
                  durationMs: processDuration,
                  budgetMs: PERFORMANCE_BUDGETS.BATCH_PROCESS_THREADS,
                  exceeded: processExceeded,
                  metadata: {
                    WorkerId: workerId,
                    UserId: userId,
                    BatchSize: String(batch.length),
                  },
                })
                .catch((err) => {
                  this.logger.error("Failed to emit CloudWatch metric:", err);
                });

              this.logger.log(
                `[Worker ${workerId}] ✅ Processed ${batch.length} threads into payloads in ${Math.round(processDuration / 1000)}s (budget: ${PERFORMANCE_BUDGETS.BATCH_PROCESS_THREADS / 1000}s)${processExceeded ? " ⚠️ OVER BUDGET" : ""}`,
              );
              writeAnalysisLog(
                `[Worker ${workerId}] ✅ Processed ${batch.length} threads into payloads in ${Math.round(processDuration / 1000)}s`,
                "log",
              );
            } else if (legacyBatch) {
              // Pre-processed batch (fetched upfront in main job - no Gmail API calls needed)
              batch = legacyBatch;

              this.logger.log(
                `[Worker ${workerId}] ✅ Using pre-processed batch (${legacyBatch.length} threads) - skipping fetch/process steps (0s)`,
              );
              writeAnalysisLog(
                `[Worker ${workerId}] ✅ Using pre-processed batch (${legacyBatch.length} threads) - skipping fetch/process steps`,
                "log",
              );
              // fetchDuration and processDuration remain 0 (already initialized)
            } else {
              throw new Error("No threadIds or batch provided");
            }

            // Call LLM service to analyze the batch
            const llmStartTime = Date.now();
            this.logger.log(
              `[Worker ${workerId}] 🤖 Step 3/4: Calling LLM to analyze ${batch.length} email patterns...`,
            );
            writeAnalysisLog(
              `[Worker ${workerId}] 🤖 Step 3/4: Calling LLM to analyze ${batch.length} email patterns...`,
              "log",
            );

            const batchAnalysis = await this.llmService.analyzeEmailPatterns(
              batch,
              sentPayload, // Only first batch has sent emails, others get empty array
              undefined,
              userId,
              userEmail || undefined,
              currentContextForPrompt,
            );
            const llmDuration = Date.now() - llmStartTime;
            const llmExceeded =
              llmDuration > PERFORMANCE_BUDGETS.BATCH_LLM_ANALYSIS;

            // Emit CloudWatch metric for batch LLM analysis
            this.cloudWatchService
              .putPerformanceBudgetMetric({
                budgetName: "BATCH_LLM_ANALYSIS",
                budgetType: "batch",
                durationMs: llmDuration,
                budgetMs: PERFORMANCE_BUDGETS.BATCH_LLM_ANALYSIS,
                exceeded: llmExceeded,
                metadata: {
                  WorkerId: workerId,
                  UserId: userId,
                },
              })
              .catch((err) => {
                this.logger.error("Failed to emit CloudWatch metric:", err);
              });

            this.logger.log(
              `[Worker ${workerId}] ✅ LLM analysis completed in ${Math.round(llmDuration / 1000)}s (budget: ${PERFORMANCE_BUDGETS.BATCH_LLM_ANALYSIS / 1000}s)${llmExceeded ? " ⚠️ OVER BUDGET" : ""}`,
            );
            writeAnalysisLog(
              `[Worker ${workerId}] ✅ LLM analysis completed in ${Math.round(llmDuration / 1000)}s`,
              "log",
            );

            // Store result in ContextAnalysis.stats field (keyed by batch index)
            const saveStartTime = Date.now();
            this.logger.log(
              `[Worker ${workerId}] 💾 Step 4/4: Saving batch results to database...`,
            );
            writeAnalysisLog(
              `[Worker ${workerId}] 💾 Step 4/4: Saving batch results to database...`,
              "log",
            );

            const findRecordStartTime = Date.now();
            let analysisRecord = await this.contextAnalysisRepository.findOne({
              where: { id: analysisRecordId },
            });
            const findRecordDuration = Date.now() - findRecordStartTime;

            if (!analysisRecord) {
              throw new Error(
                `Analysis record ${analysisRecordId} not found for batch ${batchIndex}`,
              );
            }

            // Get existing stats or initialize
            const stats = analysisRecord.stats || {
              totalThreads: 0,
              outboundEmails: 0,
              threadsNeverOpened: 0,
              threadsReadButNotReplied: 0,
              vipContactsEvaluated: 0,
            };
            const batchResults =
              (stats.batchResults as Record<string, unknown>) || {};

            // Check if this batch was already completed (retry scenario)
            const batchWasAlreadyCompleted =
              batchResults[String(batchIndex)] !== undefined;

            // Extract thread IDs from batch for source linking
            const batchThreadIds = batch
              .map((t: { threadId?: string }) => t.threadId)
              .filter((id): id is string => !!id);

            // Store this batch's result (including thread IDs for fact-checking)
            batchResults[String(batchIndex)] = {
              context: batchAnalysis.context || [],
              writingStyle: batchAnalysis.writingStyle || null,
              completedAt: new Date().toISOString(),
              threadIds: batchThreadIds, // Store thread IDs for source linking
            };

            // Update stats with batch results
            stats.batchResults = batchResults;

            // Update analyzed count only if this batch wasn't already completed (prevent double counting on retries)
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

            // Re-read the latest stats to preserve concurrent updates from main job
            // This minimizes the race window - we read again right before saving
            const latestRecord = await this.contextAnalysisRepository.findOne({
              where: { id: analysisRecordId },
            });
            if (latestRecord && latestRecord.stats) {
              // Merge our batchResults into the latest stats (preserving fetchingStatus, totalBatches, etc.)
              const latestBatchResults =
                (latestRecord.stats.batchResults as Record<string, unknown>) ||
                {};
              latestBatchResults[String(batchIndex)] =
                batchResults[String(batchIndex)];
              latestRecord.stats.batchResults = latestBatchResults;
              latestRecord.analyzedCount = analysisRecord.analyzedCount;
              analysisRecord = latestRecord;
            } else {
              // Fallback: use our version
              analysisRecord.stats = stats;
            }

            const saveDbStartTime = Date.now();
            await this.contextAnalysisRepository.save(analysisRecord);
            const saveDbDuration = Date.now() - saveDbStartTime;
            const saveDuration = Date.now() - saveStartTime;
            const saveExceeded =
              saveDuration > PERFORMANCE_BUDGETS.BATCH_SAVE_RESULTS;

            // Emit CloudWatch metric for batch save results
            this.cloudWatchService
              .putPerformanceBudgetMetric({
                budgetName: "BATCH_SAVE_RESULTS",
                budgetType: "batch",
                durationMs: saveDuration,
                budgetMs: PERFORMANCE_BUDGETS.BATCH_SAVE_RESULTS,
                exceeded: saveExceeded,
                metadata: {
                  WorkerId: workerId,
                  UserId: userId,
                },
              })
              .catch((err) => {
                this.logger.error("Failed to emit CloudWatch metric:", err);
              });

            this.logger.log(
              `[Worker ${workerId}] ✅ Saved batch results in ${Math.round(saveDuration / 1000)}s (find: ${Math.round(findRecordDuration / 1000)}s, save: ${Math.round(saveDbDuration / 1000)}s, budget: ${PERFORMANCE_BUDGETS.BATCH_SAVE_RESULTS / 1000}s)${saveExceeded ? " ⚠️ OVER BUDGET" : ""}`,
            );
            writeAnalysisLog(
              `[Worker ${workerId}] ✅ Saved batch results in ${Math.round(saveDuration / 1000)}s`,
              "log",
            );

            // Calculate total time so far
            const totalTimeSoFar =
              saveDuration + llmDuration + processDuration + fetchDuration;

            const totalExceeded =
              totalTimeSoFar > PERFORMANCE_BUDGETS.BATCH_TOTAL;

            // Emit CloudWatch metric for batch total
            this.cloudWatchService
              .putPerformanceBudgetMetric({
                budgetName: "BATCH_TOTAL",
                budgetType: "batch",
                durationMs: totalTimeSoFar,
                budgetMs: PERFORMANCE_BUDGETS.BATCH_TOTAL,
                exceeded: totalExceeded,
                metadata: {
                  WorkerId: workerId,
                  UserId: userId,
                  FetchDuration: String(fetchDuration),
                  ProcessDuration: String(processDuration),
                  LlmDuration: String(llmDuration),
                  SaveDuration: String(saveDuration),
                },
              })
              .catch((err) => {
                this.logger.error("Failed to emit CloudWatch metric:", err);
              });

            if (totalExceeded) {
              this.logger.warn(
                `[Worker ${workerId}] ⚠️ BATCH OVER TOTAL BUDGET: ${Math.round(totalTimeSoFar / 1000)}s (budget: ${PERFORMANCE_BUDGETS.BATCH_TOTAL / 1000}s). Breakdown: fetch=${Math.round(fetchDuration / 1000)}s, process=${Math.round(processDuration / 1000)}s, llm=${Math.round(llmDuration / 1000)}s, save=${Math.round(saveDuration / 1000)}s`,
              );
            }

            // Update user progress (30-70% during LLM analysis, distributed across batches)
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
              // Don't fail the batch if progress update fails
            }

            const duration = Math.round(
              (Date.now() - tracker.startTime) / 1000,
            );
            this.logger.log(
              `[Worker ${workerId}] ✅ COMPLETED batch ${batchIndex + 1}/${totalBatches} in ${duration}s. Analyzed ${batchSize} threads.`,
            );
            writeAnalysisLog(
              `[Worker ${workerId}] ✅ COMPLETED batch ${batchIndex + 1}/${totalBatches} in ${duration}s. Analyzed ${batchSize} threads.`,
              "log",
            );

            // Success - break out of retry loop
            tracker.finish();
            return;
          } catch (error: unknown) {
            attemptNumber++;
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;

            if (attemptNumber > maxRetries) {
              // Max retries exceeded - mark batch as failed
              this.logger.error(
                `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} failed after ${maxRetries} retries: ${errorMessage}`,
                errorStack || error,
              );
              console.error(
                `[BATCH-PROCESSOR] [Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} failed after ${maxRetries} retries: ${errorMessage}`,
              );
              writeAnalysisLog(
                `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} failed after ${maxRetries} retries: ${errorMessage}`,
                "error",
              );

              // Store failure in stats
              try {
                const analysisRecord =
                  await this.contextAnalysisRepository.findOne({
                    where: { id: analysisRecordId },
                  });
                if (analysisRecord) {
                  const stats = analysisRecord.stats || {
                    totalThreads: 0,
                    outboundEmails: 0,
                    threadsNeverOpened: 0,
                    threadsReadButNotReplied: 0,
                    vipContactsEvaluated: 0,
                  };
                  const batchResults =
                    (stats.batchResults as Record<string, unknown>) || {};
                  const failedBatches = (stats.failedBatches as number[]) || [];
                  if (!failedBatches.includes(batchIndex)) {
                    failedBatches.push(batchIndex);
                  }
                  batchResults[String(batchIndex)] = {
                    error: errorMessage,
                    failedAt: new Date().toISOString(),
                  };
                  stats.batchResults = batchResults;
                  stats.failedBatches = failedBatches;
                  analysisRecord.stats = stats;
                  await this.contextAnalysisRepository.save(analysisRecord);
                }
              } catch (saveError) {
                this.logger.error(
                  `[Worker ${workerId}] Failed to save batch failure status: ${getErrorMessage(saveError)}`,
                );
              }

              // Re-throw to mark job as failed in PgBoss
              tracker.finish(error as Error);
              throw error;
            } else {
              // Will retry - log but continue
              this.logger.warn(
                `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} attempt ${attemptNumber} failed: ${errorMessage}. Will retry.`,
              );
              console.warn(
                `[BATCH-PROCESSOR] [Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} attempt ${attemptNumber} failed: ${errorMessage}. Will retry.`,
              );
              writeAnalysisLog(
                `[Worker ${workerId}] Batch ${batchIndex + 1}/${totalBatches} attempt ${attemptNumber} failed: ${errorMessage}. Will retry.`,
                "warn",
              );
            }
          }
        }
      },
    );

    this.logger.log("Batch analysis worker registered successfully");
    writeAnalysisLog("Batch analysis worker registered successfully", "log");
  }
}
