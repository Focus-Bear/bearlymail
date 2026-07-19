import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
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
    private configService: ConfigService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  /**
   * SQS→Lambda is used in the cloud, but a local install has no AWS. When the
   * queue URL is unset we fall back to enqueuing each batch as a local PgBoss
   * ANALYZE_CONTEXT_BATCH job, which the in-process ContextBatchAnalysisProcessor
   * picks up — so onboarding's AI-training step works entirely on-machine.
   */
  private isSqsConfigured(): boolean {
    return !!this.configService.get<string>("CONTEXT_ANALYSIS_SQS_QUEUE_URL");
  }

  async buildAndQueueBatchJobs(
    args: BuildAndQueueArgs,
    analysisBatchSize: number,
  ): Promise<BatchQueueResult> {
    const { userId, threadIds, userEmail } = args;

    // Phase 2: Single-pass parallel thread fetch — instead of processing fetchBatchSize
    // threads sequentially (10 rounds for 300 threads), fetch all threads in one parallel
    // pass. fetchThreadsByIds already parallelises internally in sub-batches of 50, so
    // we're not increasing peak concurrency, just removing the idle time between rounds
    // (saves 10-30s).
    this.logger.log(
      `[CONTEXT-ANALYSIS] Fetching all ${threadIds.length} threads in one parallel pass...`,
    );

    const allProcessedBatches: BatchPayloadItem[][] = [];
    let globalBatchIndex = 0;
    const enqueueErrors: Array<{ batchNum: number; error: string }> = [];
    const lambdaBatches: Array<{
      batchNum: number;
      batchPayload: BatchPayloadItem[];
    }> = [];

    const allFetchedThreads =
      await this.gmailDataService.fetchThreadsByIdsFromProvider(
        userId,
        threadIds,
      );
    this.logger.log(
      `[CONTEXT-ANALYSIS] Fetched ${allFetchedThreads.length}/${threadIds.length} threads in single pass`,
    );

    const processedBatches = this.batchPayloadService.buildBatchPayloads(
      allFetchedThreads,
      userEmail,
      analysisBatchSize,
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] Created ${processedBatches.length} analysis batches from ${allFetchedThreads.length} threads`,
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

    const jobPromises = this.isSqsConfigured()
      ? await this.dispatchViaSqs(
          args,
          lambdaBatches,
          threadIds.length,
          analysisBatchSize,
          enqueueErrors,
        )
      : await this.dispatchLocally(
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

  /**
   * Local (no-AWS) dispatch: enqueue each batch as a PgBoss ANALYZE_CONTEXT_BATCH
   * job. The payload mirrors the SQS message body (minus the Lambda flag) so the
   * local ContextBatchAnalysisProcessor handles it identically.
   */
  private async dispatchLocally(
    args: BuildAndQueueArgs,
    lambdaBatches: Array<{
      batchNum: number;
      batchPayload: BatchPayloadItem[];
    }>,
    totalThreadIds: number,
    analysisBatchSize: number,
    enqueueErrors: Array<{ batchNum: number; error: string }>,
  ): Promise<Promise<{ jobId: string | null; batchNum: number }>[]> {
    const totalBatches = Math.ceil(totalThreadIds / analysisBatchSize);
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LOCAL] Enqueuing ${lambdaBatches.length} batch(es) as PgBoss ${JOB_NAMES.ANALYZE_CONTEXT_BATCH} jobs`,
    );
    const results: Array<{ jobId: string | null; batchNum: number }> = [];
    for (const { batchNum, batchPayload } of lambdaBatches) {
      try {
        const jobId = await this.boss.send(
          JOB_NAMES.ANALYZE_CONTEXT_BATCH,
          {
            userId: args.userId,
            batchIndex: batchNum,
            batch: batchPayload,
            sentPayload: batchNum === 0 ? args.sentPayload : [],
            userEmail: args.userEmail ?? undefined,
            currentContextForPrompt: args.currentContextForPrompt,
            analysisRecordId: args.analysisRecord.id,
            totalBatches,
            after: args.twelveDaysAgo.toISOString(),
            before: args.fiveDaysAgo.toISOString(),
          },
          {
            priority: getJobPriority(JOB_NAMES.ANALYZE_CONTEXT_BATCH),
            singletonKey: `analyze-context-batch-${args.analysisRecord.id}-${batchNum}`,
          },
        );
        results.push({ jobId, batchNum });
      } catch (error) {
        enqueueErrors.push({
          batchNum: batchNum + 1,
          error: getErrorMessage(error),
        });
        results.push({ jobId: null, batchNum });
      }
    }
    return results.map((result) => Promise.resolve(result));
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
