import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { Repository } from "typeorm";
import { JOB_NAMES } from "../constants/job-names";
import {
  BODY_PREVIEW_LENGTHS,
  CONTEXT_ANALYSIS,
} from "../constants/llm-constants";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import { QUERY_LIMITS } from "../constants/query-limits";
import { DAYS, MINUTES, MS_PER_SECOND } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { getJobPriority } from "../queue/job-priorities";
import { getErrorMessage } from "../types/common";
import { UsersService } from "../users/users.service";
import { writeAnalysisLog } from "./context-analysis-logger";
import {
  BatchPayloadItem,
  ContextBatchPayloadService,
} from "./context-batch-payload.service";
import { ContextCrudService } from "./context-crud.service";
import { ContextEnqueueService } from "./context-enqueue.service";
import { classifyContextAnalysisError } from "./context-error-handler";
import { ContextGmailDataService } from "./context-gmail-data.service";
import { ContextSqsDispatchService } from "./context-sqs-dispatch.service";

type SentPayloadItem = {
  emailId: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
};

type ContextPromptItem = {
  key: string;
  value: string;
  source: string;
};

type AnalysisStats = {
  totalThreads: number;
  outboundEmails: number;
  threadsNeverOpened: number;
  threadsReadButNotReplied: number;
  vipContactsEvaluated: number;
};

// EnqueueJobContext is defined in context-enqueue.service.ts; removed duplicate here.

type EnqueueBatchesArgs = {
  userId: string;
  analysisRecord: ContextAnalysis;
  threadIds: string[];
  sentPayload: SentPayloadItem[];
  currentContextForPrompt: ContextPromptItem[];
  twelveDaysAgo: Date;
  fiveDaysAgo: Date;
  userEmail: string | null;
  /** When true, dispatch via SQS → Lambda instead of PgBoss */
  useLambda?: boolean;
};

type EnqueueBatchesResult = {
  allProcessedBatches: BatchPayloadItem[][];
  jobResults: Array<{ jobId: string | null; batchNum: number }>;
  enqueueErrors: Array<{ batchNum: number; error: string }>;
  totalBatches: number;
};

type FinalizationParams = {
  totalBatches: number;
  totalThreads: number;
  sentEmailsCount: number;
  analysisStats: AnalysisStats;
  userEmail: string | null;
  successfulEnqueues: number;
  /** When true, use shorter startAfter delay — Lambda completes faster than PgBoss */
  isLambdaDispatched?: boolean;
};

const EMPTY_ANALYSIS_STATS: AnalysisStats = {
  totalThreads: 0,
  outboundEmails: 0,
  threadsNeverOpened: 0,
  threadsReadButNotReplied: 0,
  vipContactsEvaluated: 0,
};

@Injectable()
export class ContextAnalysisOrchestratorService {
  private readonly logger = new Logger(ContextAnalysisOrchestratorService.name);

  private readonly lambdaEnabled: boolean;

  constructor(
    @InjectRepository(ContextAnalysis)
    private contextAnalysisRepository: Repository<ContextAnalysis>,
    private usersService: UsersService,
    private gmailDataService: ContextGmailDataService,
    private crudService: ContextCrudService,
    private batchPayloadService: ContextBatchPayloadService,
    @Inject("PG_BOSS") private boss: PgBoss,
    private configService: ConfigService,
    private contextSqsDispatchService: ContextSqsDispatchService,
    private contextEnqueueService: ContextEnqueueService,
  ) {
    this.lambdaEnabled =
      this.configService.get<boolean>("LAMBDA_CONTEXT_ANALYSIS_ENABLED") ===
      true;

    if (this.lambdaEnabled) {
      this.logger.log(
        "[CONTEXT-ANALYSIS] 🚀 Lambda dispatch ENABLED (LAMBDA_CONTEXT_ANALYSIS_ENABLED=true)",
      );
    }
  }

  async analyzeAndLearnFromEmails(
    userId: string,
    analysisId?: string,
    options?: { isNewUserOnboarding?: boolean },
  ): Promise<void> {
    const logSuffix = analysisId ? ` with analysis ID ${analysisId}` : "";
    this.logger.log(
      `[CONTEXT-ANALYSIS] ===== Starting deep email analysis for user ${userId}${logSuffix} =====`,
    );
    writeAnalysisLog(
      `===== Starting deep email analysis for user ${userId}${logSuffix} =====`,
      "log",
    );

    const analysisRecord = await this.initializeAnalysisRecord(
      userId,
      analysisId,
    );

    try {
      await this.runAnalysisPipeline(userId, analysisRecord, options);
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

    let record = await this.contextAnalysisRepository.findOne({
      where: { userId, status: "running" },
      order: { createdAt: "DESC" },
    });

    if (!record) {
      record = this.contextAnalysisRepository.create({
        userId,
        status: "running",
        progress: 0,
        total: 100,
        stats: { ...EMPTY_ANALYSIS_STATS },
      });
      record = await this.contextAnalysisRepository.save(record);
      this.logger.log(
        `[CONTEXT-ANALYSIS] Created new analysis record ${record.id} with initialized stats`,
      );
      return record;
    }

    record.status = "running";
    record.progress = 0;
    record.total = 100;
    record.threadCount = undefined;
    record.analyzedCount = 0;
    record.stats = {
      ...EMPTY_ANALYSIS_STATS,
      batchResults: {},
      batchJobIds: {},
      batchPayloadsForRetry: {},
      totalBatches: 0,
    };
    record.fetchingStatus = null;
    record.fetchedGeneralCount = 0;
    record.fetchedSentCount = 0;
    await this.contextAnalysisRepository.save(record);
    this.logger.log(
      `[CONTEXT-ANALYSIS] Reset stats for existing analysis record ${record.id} to prevent stale data`,
    );
    return record;
  }

  private async runAnalysisPipeline(
    userId: string,
    analysisRecord: ContextAnalysis,
    options?: { isNewUserOnboarding?: boolean },
  ): Promise<void> {
    await this.usersService.update(userId, { scanProgress: 0, scanTotal: 100 });
    analysisRecord.progress = 0;
    analysisRecord.total = 100;
    analysisRecord.analyzedCount = 0;
    await this.contextAnalysisRepository.save(analysisRecord);

    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const twelveDaysAgo = new Date();
    twelveDaysAgo.setDate(twelveDaysAgo.getDate() - DAYS.TWELVE);

    const userForEmail = await this.usersService.findOne(userId);
    const userEmail = userForEmail?.email
      ? userForEmail.email.toLowerCase()
      : null;

    writeAnalysisLog(`Getting thread IDs from 5-12 days ago`, "log");
    const { generalThreadIds, sentThreadIds, threadIds } =
      await this.fetchAllThreadIds(
        userId,
        analysisRecord,
        twelveDaysAgo,
        fiveDaysAgo,
      );

    if (threadIds.length === 0) {
      await this.completeWithNoThreads(userId, analysisRecord);
      return;
    }

    await this.clearStaleFindings(analysisRecord);
    await this.resetStatsForAnalysis(analysisRecord, threadIds.length);

    const { sentEmailsData, sentPayload, analysisStats } =
      await this.fetchSentEmailsContext(userId, userEmail, threadIds.length);
    const currentContextForPrompt =
      await this.buildCurrentContextPrompt(userId);

    // Route to Lambda (SQS) if feature flag is enabled and this is a new user onboarding
    const useLambda =
      this.lambdaEnabled && (options?.isNewUserOnboarding ?? false);

    if (useLambda) {
      this.logger.log(
        `[CONTEXT-ANALYSIS] 🚀 Routing to Lambda via SQS for new user onboarding (userId: ${userId})`,
      );
    }

    const { allProcessedBatches, jobResults, enqueueErrors, totalBatches } =
      await this.enqueueAnalysisBatches({
        userId,
        analysisRecord,
        threadIds,
        sentPayload,
        currentContextForPrompt,
        twelveDaysAgo,
        fiveDaysAgo,
        userEmail,
        useLambda,
      });

    if (enqueueErrors.length > 0) {
      this.logger.error(
        `[CONTEXT-ANALYSIS] Enqueue errors: ${JSON.stringify(enqueueErrors)}`,
      );
    }

    const successfulEnqueues = jobResults.filter(
      (result) => result.jobId !== null,
    ).length;
    await this.persistBatchState(
      analysisRecord,
      allProcessedBatches,
      jobResults,
      totalBatches,
    );
    await this.queueFinalizationJob(userId, analysisRecord, {
      totalBatches,
      totalThreads: threadIds.length,
      sentEmailsCount: sentEmailsData.length,
      analysisStats,
      userEmail,
      successfulEnqueues,
      isLambdaDispatched: useLambda,
    });

    this.logger.log(
      `[CONTEXT-ANALYSIS] Pipeline complete. general=${generalThreadIds.length}, sent=${sentThreadIds.length}, total=${threadIds.length}`,
    );
  }

  private async fetchAllThreadIds(
    userId: string,
    analysisRecord: ContextAnalysis,
    twelveDaysAgo: Date,
    fiveDaysAgo: Date,
  ): Promise<{
    generalThreadIds: string[];
    sentThreadIds: string[];
    threadIds: string[];
  }> {
    analysisRecord.fetchingStatus = "Fetching general threads...";
    analysisRecord.fetchedGeneralCount = 0;
    analysisRecord.fetchedSentCount = 0;
    await this.contextAnalysisRepository.save(analysisRecord);

    const generalThreadIds = await this.gmailDataService.getThreadIdsFromGmail(
      userId,
      twelveDaysAgo,
      fiveDaysAgo,
      QUERY_LIMITS.CONTEXT_RECENT_EMAILS,
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] Found ${generalThreadIds.length} general threads from 5-12 days ago`,
    );

    analysisRecord.fetchingStatus = "Fetching sent threads...";
    analysisRecord.fetchedGeneralCount = generalThreadIds.length;
    await this.contextAnalysisRepository.save(analysisRecord);

    let sentThreadIds: string[] = [];
    try {
      sentThreadIds = await this.gmailDataService.getSentThreadIds(
        userId,
        QUERY_LIMITS.CONTEXT_SENT_EMAILS,
      );
      this.logger.log(
        `[CONTEXT-ANALYSIS] Found ${sentThreadIds.length} most recent sent thread IDs`,
      );
    } catch (fetchError) {
      this.logger.warn(
        `[CONTEXT-ANALYSIS] WARNING: Failed to fetch sent thread IDs: ${getErrorMessage(fetchError)}. Continuing with general threads only.`,
      );
    }

    const threadIds = Array.from(
      new Set([...generalThreadIds, ...sentThreadIds]),
    );
    analysisRecord.fetchingStatus = null;
    analysisRecord.fetchedGeneralCount = generalThreadIds.length;
    analysisRecord.fetchedSentCount = sentThreadIds.length;
    analysisRecord.stats = {
      ...(analysisRecord.stats || {}),
      uniqueThreads: threadIds.length,
    };
    await this.contextAnalysisRepository.save(analysisRecord);

    this.logger.log(
      `[CONTEXT-ANALYSIS] Found ${generalThreadIds.length} general + ${sentThreadIds.length} sent (${threadIds.length} unique total) for user ${userId}`,
    );
    return { generalThreadIds, sentThreadIds, threadIds };
  }

  private async fetchSentEmailsContext(
    userId: string,
    userEmail: string | null,
    totalThreads: number,
  ): Promise<{
    sentEmailsData: Awaited<
      ReturnType<ContextGmailDataService["fetchSentThreadsFromProvider"]>
    >;
    sentPayload: SentPayloadItem[];
    analysisStats: AnalysisStats;
  }> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - DAYS.NINETY);

    const sentEmailsData =
      await this.gmailDataService.fetchSentThreadsFromProvider(
        userId,
        userEmail || "",
        ninetyDaysAgo,
        new Date(),
        100,
      );
    this.logger.log(
      `[CONTEXT-ANALYSIS] Fetched ${sentEmailsData.length} sent emails`,
    );

    const sentPayload: SentPayloadItem[] = sentEmailsData.map((email) => ({
      emailId: email.id,
      to: "recipient@example.com",
      subject: email.subject,
      body: cleanEmailContent(
        email.body,
        email.htmlBody,
        BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
      ),
      sentAt: email.receivedAt.toISOString(),
    }));

    const analysisStats: AnalysisStats = {
      totalThreads,
      outboundEmails: sentEmailsData.length,
      threadsNeverOpened: 0,
      threadsReadButNotReplied: 0,
      vipContactsEvaluated: 0,
    };

    return { sentEmailsData, sentPayload, analysisStats };
  }

  private async buildCurrentContextPrompt(
    userId: string,
  ): Promise<ContextPromptItem[]> {
    const existingContext = await this.crudService.getUserContext(userId);
    return existingContext.map((ctx) => ({
      key: ctx.contextKey,
      value: ctx.contextValue,
      source: ctx.source,
    }));
  }

  private async enqueueAnalysisBatches(
    args: EnqueueBatchesArgs,
  ): Promise<EnqueueBatchesResult> {
    const FETCH_BATCH_SIZE = 30;
    const ANALYSIS_BATCH_SIZE = 10;
    const {
      allProcessedBatches,
      globalBatchIndex,
      jobPromises,
      enqueueErrors,
    } = await this.contextEnqueueService.buildAndQueueBatchJobs(
      args,
      FETCH_BATCH_SIZE,
      ANALYSIS_BATCH_SIZE,
    );

    const totalBatches = globalBatchIndex;
    if (totalBatches === 0) {
      args.analysisRecord.status = "failed";
      args.analysisRecord.errorMessage =
        "No batches were enqueued. Analysis cannot proceed.";
      await this.contextAnalysisRepository.save(args.analysisRecord);
      throw new Error(
        `Cannot proceed with analysis: totalBatches is 0. No batches were processed.`,
      );
    }

    const jobResults = await this.resolveJobPromises(
      jobPromises,
      totalBatches,
      args.analysisRecord,
    );

    if (!args.useLambda) {
      // PgBoss path: verify queue depth
      await new Promise((resolve) => setTimeout(resolve, MS_PER_SECOND));
      const queuedCount = await this.boss.getQueueSize(
        JOB_NAMES.ANALYZE_CONTEXT_BATCH,
      );
      this.logger.log(
        `[CONTEXT-ANALYSIS] Queue verification: ${queuedCount} jobs queued`,
      );
    } else {
      const successCount = jobResults.filter(
        (jobResult) => jobResult.jobId !== null,
      ).length;
      this.logger.log(
        `[CONTEXT-ANALYSIS] [SQS] ${successCount}/${totalBatches} batches dispatched to Lambda`,
      );
    }

    return { allProcessedBatches, jobResults, enqueueErrors, totalBatches };
  }

  // buildAndQueueBatchJobs moved to ContextEnqueueService to reduce file size
  // and centralize enqueue logic. See server/src/context/context-enqueue.service.ts

  private async resolveJobPromises(
    jobPromises: Promise<{ jobId: string | null; batchNum: number }>[],
    totalBatches: number,
    analysisRecord: ContextAnalysis,
  ): Promise<Array<{ jobId: string | null; batchNum: number }>> {
    let jobResults: Array<{ jobId: string | null; batchNum: number }> = [];
    try {
      jobResults = await Promise.all(jobPromises);
    } catch (promiseError) {
      this.logger.error(
        `[CONTEXT-ANALYSIS] ERROR: Promise.all failed: ${getErrorMessage(promiseError)}`,
      );
    }

    const successfulEnqueues = jobResults.filter(
      (result) => result.jobId !== null,
    ).length;
    if (successfulEnqueues === 0 && totalBatches > 0) {
      this.logger.error(
        `[CONTEXT-ANALYSIS] ERROR: All ${totalBatches} batches failed to enqueue!`,
      );
      analysisRecord.status = "failed";
      analysisRecord.errorMessage = `All ${totalBatches} batches failed to enqueue.`;
      await this.contextAnalysisRepository.save(analysisRecord);
      throw new Error(
        `All ${totalBatches} batches failed to enqueue. Analysis cannot proceed.`,
      );
    }

    this.logger.log(
      `[CONTEXT-ANALYSIS] Job enqueueing complete: ${successfulEnqueues} successful, ${jobResults.length - successfulEnqueues} failed`,
    );
    return jobResults;
  }

  private async persistBatchState(
    analysisRecord: ContextAnalysis,
    allProcessedBatches: BatchPayloadItem[][],
    jobResults: Array<{ jobId: string | null; batchNum: number }>,
    totalBatches: number,
  ): Promise<void> {
    const batchJobIds: Record<number, string | null> = {};
    const batchPayloadsForRetry: Record<number, BatchPayloadItem[]> = {};

    let payloadIndex = 0;
    for (const batchArray of allProcessedBatches) {
      if (batchArray.length > 0) {
        batchPayloadsForRetry[payloadIndex] = batchArray;
        payloadIndex++;
      }
    }
    for (const result of jobResults) {
      batchJobIds[result.batchNum] = result.jobId;
    }

    analysisRecord.stats = {
      ...(analysisRecord.stats || { ...EMPTY_ANALYSIS_STATS }),
      totalBatches,
      batchJobIds,
      batchPayloadsForRetry,
    };
    await this.contextAnalysisRepository.save(analysisRecord);
    writeAnalysisLog(
      `Saved analysis stats: totalBatches=${totalBatches}`,
      "log",
    );

    const savedRecord = await this.contextAnalysisRepository.findOne({
      where: { id: analysisRecord.id },
    });
    if (savedRecord?.stats) {
      const savedTotalBatches = (savedRecord.stats.totalBatches as number) || 0;
      if (savedTotalBatches !== totalBatches) {
        this.logger.error(
          `[CONTEXT-ANALYSIS] totalBatches mismatch after save! Expected: ${totalBatches}, Saved: ${savedTotalBatches}. Fixing...`,
        );
        savedRecord.stats = { ...savedRecord.stats, totalBatches };
        await this.contextAnalysisRepository.save(savedRecord);
      }
    }
  }

  private async queueFinalizationJob(
    userId: string,
    analysisRecord: ContextAnalysis,
    params: FinalizationParams,
  ): Promise<void> {
    const {
      totalBatches,
      totalThreads,
      sentEmailsCount,
      analysisStats,
      userEmail,
      successfulEnqueues,
      isLambdaDispatched,
    } = params;

    // Lambda processes all batches concurrently — expect completion in ~30-60s
    // PgBoss processes sequentially at 6-10 concurrent — expect 5-15 minutes
    // 30 seconds — Lambda processes all batches concurrently; enough headroom before timeout.
    const LAMBDA_FINALIZATION_DELAY_MS = 30_000;
    const finalizationDelayMs = isLambdaDispatched
      ? LAMBDA_FINALIZATION_DELAY_MS
      : CONTEXT_ANALYSIS.BATCH_TIMEOUT_MS;

    if (totalBatches <= 0 || successfulEnqueues <= 0) {
      this.logger.error(
        `[CONTEXT-ANALYSIS] Cannot queue finalization job - totalBatches: ${totalBatches}, successfulEnqueues: ${successfulEnqueues}`,
      );
      analysisRecord.status = "failed";
      analysisRecord.errorMessage = `No batches successfully enqueued.`;
      await this.contextAnalysisRepository.save(analysisRecord);
      throw new Error(
        `Cannot proceed: totalBatches is ${totalBatches}, successfulEnqueues is ${successfulEnqueues}`,
      );
    }

    await this.boss.send(
      JOB_NAMES.FINALIZE_CONTEXT_ANALYSIS,
      {
        userId,
        analysisRecordId: analysisRecord.id,
        totalBatches,
        totalThreads,
        sentEmailsData: sentEmailsCount,
        analysisStats,
        userEmail: userEmail || undefined,
      },
      {
        priority: getJobPriority(JOB_NAMES.FINALIZE_CONTEXT_ANALYSIS, false),
        singletonKey: `finalize-context-analysis-${analysisRecord.id}`,
        singletonMinutes: MINUTES.HOUR,
        startAfter: new Date(Date.now() + finalizationDelayMs),
      },
    );

    this.logger.log(
      `[CONTEXT-ANALYSIS] Finalization job queued. ${successfulEnqueues}/${totalBatches} batches enqueued.`,
    );
  }

  private async handleAnalysisError(
    userId: string,
    analysisRecord: ContextAnalysis | undefined,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    this.logger.error(
      `[CONTEXT-ANALYSIS] FAILED for user ${userId}: ${errorMessage}`,
    );
    writeAnalysisLog(`FAILED for user ${userId}: ${errorMessage}`, "error");
    if (errorStack) {
      this.logger.error(`[CONTEXT-ANALYSIS] Stack: ${errorStack}`);
    }

    try {
      if (analysisRecord) {
        analysisRecord.status = "failed";
        const userFriendlyMessage = classifyContextAnalysisError(error);
        analysisRecord.errorMessage = userFriendlyMessage.substring(
          0,
          QUERY_LIMITS.SUBSTRING_BODY_PREVIEW,
        );
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
        `[CONTEXT-ANALYSIS] Failed to update error state for user ${userId}:`,
        updateError,
      );
    }
  }

  private async completeWithNoThreads(
    userId: string,
    analysisRecord: ContextAnalysis,
  ): Promise<void> {
    this.logger.warn(
      `[CONTEXT-ANALYSIS] No threads found for user ${userId}. Completing with empty data.`,
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

  private async clearStaleFindings(
    analysisRecord: ContextAnalysis,
  ): Promise<void> {
    if (analysisRecord.stats?.findings) {
      const stats = { ...analysisRecord.stats };
      delete stats.findings;
      analysisRecord.stats = stats;
      await this.contextAnalysisRepository.save(analysisRecord);
    }
  }

  private async resetStatsForAnalysis(
    analysisRecord: ContextAnalysis,
    threadCount: number,
  ): Promise<void> {
    await this.usersService.update(analysisRecord.userId, {
      scanProgress: 0,
      scanTotal: 100,
    });
    analysisRecord.threadCount = threadCount;
    analysisRecord.analyzedCount = 0;
    analysisRecord.stats = {
      ...EMPTY_ANALYSIS_STATS,
      batchResults: {},
      batchJobIds: {},
      batchPayloadsForRetry: {},
      totalBatches: 0,
    };
    await this.contextAnalysisRepository.save(analysisRecord);
  }
}
