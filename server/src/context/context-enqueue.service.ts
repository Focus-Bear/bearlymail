import { Inject, Injectable, Logger } from "@nestjs/common";
import PgBoss from "pg-boss";

import { JOB_NAMES } from "../constants/job-names";
import { MINUTES } from "../constants/time-constants";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { getJobPriority } from "../queue/job-priorities";
import { getErrorMessage } from "../types/common";
import {
  BatchPayloadItem,
  ContextBatchPayloadService,
} from "./context-batch-payload.service";
import { ContextGmailDataService } from "./context-gmail-data.service";
import {
  ContextPromptItem,
  ContextSqsDispatchService,
  SentPayloadItem,
} from "./context-sqs-dispatch.service";

type EnqueueJobContext = {
  userId: string;
  analysisRecord: ContextAnalysis;
  sentPayload: SentPayloadItem[];
  currentContextForPrompt: ContextPromptItem[];
  twelveDaysAgo: Date;
  fiveDaysAgo: Date;
  userEmail: string | null;
  totalThreadIds: number;
  analysisBatchSize: number;
};

type BatchQueueResult = {
  allProcessedBatches: BatchPayloadItem[][];
  globalBatchIndex: number;
  jobPromises: Promise<{ jobId: string | null; batchNum: number }>[];
  enqueueErrors: Array<{ batchNum: number; error: string }>;
};

type BuildAndQueueArgs = {
  userId: string;
  analysisRecord: ContextAnalysis;
  threadIds: string[];
  sentPayload: SentPayloadItem[];
  currentContextForPrompt: ContextPromptItem[];
  twelveDaysAgo: Date;
  fiveDaysAgo: Date;
  userEmail: string | null;
  useLambda?: boolean;
};

@Injectable()
export class ContextEnqueueService {
  private readonly logger = new Logger(ContextEnqueueService.name);

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    private gmailDataService: ContextGmailDataService,
    private batchPayloadService: ContextBatchPayloadService,
    private contextSqsDispatchService: ContextSqsDispatchService,
  ) {}

  async buildAndQueueBatchJobs(
    args: BuildAndQueueArgs,
    fetchBatchSize: number,
    analysisBatchSize: number,
  ): Promise<BatchQueueResult> {
    const {
      userId,
      analysisRecord,
      threadIds,
      sentPayload,
      currentContextForPrompt,
      twelveDaysAgo,
      fiveDaysAgo,
      userEmail,
      useLambda,
    } = args;

    this.logger.log(
      `[CONTEXT-ANALYSIS] Fetching threads progressively (${fetchBatchSize} at a time)...`,
    );

    const allProcessedBatches: BatchPayloadItem[][] = [];
    let globalBatchIndex = 0;
    let jobPromises: Promise<{ jobId: string | null; batchNum: number }>[] = [];
    const enqueueErrors: Array<{ batchNum: number; error: string }> = [];
    const lambdaBatches: Array<{
      batchNum: number;
      batchPayload: BatchPayloadItem[];
    }> = [];

    const jobCtx: EnqueueJobContext = {
      userId,
      analysisRecord,
      sentPayload,
      currentContextForPrompt,
      twelveDaysAgo,
      fiveDaysAgo,
      userEmail,
      totalThreadIds: threadIds.length,
      analysisBatchSize,
    };

    for (let start = 0; start < threadIds.length; start += fetchBatchSize) {
      const batchIds = threadIds.slice(
        start,
        Math.min(start + fetchBatchSize, threadIds.length),
      );
      const fetchedThreads = await this.gmailDataService.fetchThreadsByIds(
        userId,
        batchIds,
      );
      this.logger.log(
        `[CONTEXT-ANALYSIS] Fetched batch ${Math.floor(start / fetchBatchSize) + 1}: ${fetchedThreads.length}/${batchIds.length} threads`,
      );

      const processedBatches = this.batchPayloadService.buildBatchPayloads(
        fetchedThreads,
        userEmail,
        analysisBatchSize,
      );
      this.logger.log(
        `[CONTEXT-ANALYSIS] Created ${processedBatches.length} analysis batches from ${fetchedThreads.length} threads`,
      );

      for (const batchPayload of processedBatches) {
        if (batchPayload.length === 0) {
          this.logger.warn(`[CONTEXT-ANALYSIS] Skipping empty batch payload`);
          continue;
        }
        const batchNum = globalBatchIndex++;

        if (useLambda) {
          lambdaBatches.push({ batchNum, batchPayload });
        } else {
          jobPromises.push(
            this.enqueueSingleBatchJob(
              batchNum,
              batchPayload,
              jobCtx,
              enqueueErrors,
            ),
          );
        }
      }

      allProcessedBatches.push(...processedBatches);
    }

    if (useLambda) {
      jobPromises = await this.dispatchViaSqs(
        args,
        lambdaBatches,
        threadIds.length,
        analysisBatchSize,
        enqueueErrors,
      );
    }

    return {
      allProcessedBatches,
      globalBatchIndex,
      jobPromises,
      enqueueErrors,
    };
  }

  private async dispatchViaSqs(
    args: BuildAndQueueArgs,
    lambdaBatches: Array<{
      batchNum: number;
      batchPayload: BatchPayloadItem[];
    }>,
    totalThreadIds: number,
    analysisBatchSize: number,
    enqueueErrors: Array<{ batchNum: number; error: string }>,
  ): Promise<Promise<{ jobId: string | null; batchNum: number }>[]> {
    try {
      const ctxForDispatch = {
        userId: args.userId,
        analysisRecordId: args.analysisRecord.id,
        sentPayload: args.sentPayload,
        currentContextForPrompt: args.currentContextForPrompt,
        twelveDaysAgo: args.twelveDaysAgo,
        fiveDaysAgo: args.fiveDaysAgo,
        userEmail: args.userEmail,
        totalThreadIds,
        analysisBatchSize,
      };
      const dispatchResults =
        await this.contextSqsDispatchService.enqueueAllBatchesViaSqs(
          lambdaBatches,
          ctxForDispatch,
          enqueueErrors,
        );
      return dispatchResults.map((result) => Promise.resolve(result));
    } catch (dispatchError) {
      this.logger.error(
        `[CONTEXT-ANALYSIS] ERROR dispatching batches to SQS: ${getErrorMessage(dispatchError)}`,
      );
      for (const lambdaBatch of lambdaBatches) {
        enqueueErrors.push({
          batchNum: lambdaBatch.batchNum + 1,
          error: getErrorMessage(dispatchError),
        });
      }
      return [];
    }
  }

  private async enqueueSingleBatchJob(
    batchNum: number,
    batchPayload: BatchPayloadItem[],
    ctx: EnqueueJobContext,
    enqueueErrors: Array<{ batchNum: number; error: string }>,
  ): Promise<{ jobId: string | null; batchNum: number }> {
    const singletonKey = `analyze-context-batch-${ctx.analysisRecord.id}-${batchNum}`;
    try {
      const jobId = await this.boss.send(
        JOB_NAMES.ANALYZE_CONTEXT_BATCH,
        {
          userId: ctx.userId,
          batchIndex: batchNum,
          batch: batchPayload,
          sentPayload: batchNum === 0 ? ctx.sentPayload : [],
          userEmail: ctx.userEmail || undefined,
          currentContextForPrompt: ctx.currentContextForPrompt,
          analysisRecordId: ctx.analysisRecord.id,
          totalBatches: Math.ceil(ctx.totalThreadIds / ctx.analysisBatchSize),
          after: ctx.twelveDaysAgo.toISOString(),
          before: ctx.fiveDaysAgo.toISOString(),
        },
        {
          priority: getJobPriority(JOB_NAMES.ANALYZE_CONTEXT_BATCH, false),
          singletonKey,
          singletonMinutes: MINUTES.HOUR,
        },
      );

      if (jobId) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] Enqueued batch ${batchNum + 1} with job ID: ${jobId}`,
        );
      } else {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] Batch ${batchNum + 1} returned null job ID (may be singleton duplicate)`,
        );
      }

      return { jobId, batchNum };
    } catch (enqueueError) {
      const errorMessage = getErrorMessage(enqueueError);
      this.logger.error(
        `[CONTEXT-ANALYSIS] ERROR: Failed to enqueue batch ${batchNum + 1}: ${errorMessage}`,
      );
      enqueueErrors.push({ batchNum: batchNum + 1, error: errorMessage });
      return { jobId: null, batchNum };
    }
  }
}
