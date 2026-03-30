import { Injectable, Logger } from "@nestjs/common";

import { ContextAnalysis } from "../database/entities/context-analysis.entity";
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
};

@Injectable()
export class ContextEnqueueService {
  private readonly logger = new Logger(ContextEnqueueService.name);

  constructor(
    private gmailDataService: ContextGmailDataService,
    private batchPayloadService: ContextBatchPayloadService,
    private contextSqsDispatchService: ContextSqsDispatchService,
  ) {}

  async buildAndQueueBatchJobs(
    args: BuildAndQueueArgs,
    fetchBatchSize: number,
    analysisBatchSize: number,
  ): Promise<BatchQueueResult> {
    const { userId, threadIds, userEmail } = args;

    this.logger.log(
      `[CONTEXT-ANALYSIS] Fetching threads progressively (${fetchBatchSize} at a time)...`,
    );

    const allProcessedBatches: BatchPayloadItem[][] = [];
    let globalBatchIndex = 0;
    const enqueueErrors: Array<{ batchNum: number; error: string }> = [];
    const lambdaBatches: Array<{
      batchNum: number;
      batchPayload: BatchPayloadItem[];
    }> = [];

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
        lambdaBatches.push({ batchNum, batchPayload });
      }

      allProcessedBatches.push(...processedBatches);
    }

    const jobPromises = await this.dispatchViaSqs(
      args,
      lambdaBatches,
      threadIds.length,
      analysisBatchSize,
      enqueueErrors,
    );

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

}
