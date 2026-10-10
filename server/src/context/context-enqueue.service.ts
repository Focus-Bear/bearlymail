import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import type { DiscoveryThreadStub } from "../llm/llm-discover-user-context";
import { getJobPriority } from "../queue/job-priorities";
import { getErrorMessage } from "../types/common";
import { ContextBatchPayloadService } from "./context-batch-payload.service";
import {
  buildDiscoveryBatchSingletonKey,
  DiscoveryBatchJob,
} from "./context-discovery.types";
import { ContextGmailDataService } from "./context-gmail-data.service";

export type DiscoveryEnqueueArgs = {
  userId: string;
  analysisRecordId: string;
  threadIds: string[];
  userEmail: string | null;
  existingCategories: string[];
  existingVipContacts: string[];
  batchSize: number;
};

export type DiscoveryEnqueueResult = {
  /** Stubs per batch, kept on the analysis record so a lost batch can be re-queued. */
  batches: DiscoveryThreadStub[][];
  jobResults: Array<{ jobId: string | null; batchNum: number }>;
  enqueueErrors: Array<{ batchNum: number; error: string }>;
};

/**
 * Fetches the sampled threads, turns them into discovery stubs and enqueues
 * one PgBoss ANALYZE_CONTEXT_BATCH job per batch for the in-process worker.
 * Discovery is a handful of tiny Nova calls, so it no longer fans out to the
 * SQS → Lambda batch analyzer that the retired mega prompt needed.
 */
@Injectable()
export class ContextEnqueueService {
  private readonly logger = new Logger(ContextEnqueueService.name);

  constructor(
    private gmailDataService: ContextGmailDataService,
    private batchPayloadService: ContextBatchPayloadService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  async buildAndQueueDiscoveryBatches(
    args: DiscoveryEnqueueArgs,
  ): Promise<DiscoveryEnqueueResult> {
    const { userId, threadIds, userEmail, batchSize } = args;

    this.logger.log(
      `[CONTEXT-DISCOVERY] Fetching ${threadIds.length} sampled threads in one parallel pass...`,
    );
    const fetchedThreads =
      await this.gmailDataService.fetchThreadsByIdsFromProvider(
        userId,
        threadIds,
      );
    const batches = this.batchPayloadService.buildDiscoveryBatches(
      fetchedThreads,
      userEmail,
      batchSize,
    );
    this.logger.log(
      `[CONTEXT-DISCOVERY] Built ${batches.length} discovery batch(es) from ${fetchedThreads.length}/${threadIds.length} fetched threads`,
    );

    const jobResults: Array<{ jobId: string | null; batchNum: number }> = [];
    const enqueueErrors: Array<{ batchNum: number; error: string }> = [];
    for (const [batchNum, threads] of batches.entries()) {
      const job = this.buildBatchJob(args, batchNum, batches.length, threads);
      try {
        const jobId = await this.enqueueBatch(job);
        jobResults.push({ jobId, batchNum });
      } catch (error) {
        enqueueErrors.push({ batchNum, error: getErrorMessage(error) });
        jobResults.push({ jobId: null, batchNum });
      }
    }
    return { batches, jobResults, enqueueErrors };
  }

  /** Re-queue one batch from the stubs stored on the analysis record. */
  async requeueBatch(job: DiscoveryBatchJob): Promise<string | null> {
    return this.enqueueBatch(job);
  }

  private buildBatchJob(
    args: DiscoveryEnqueueArgs,
    batchIndex: number,
    totalBatches: number,
    threads: DiscoveryThreadStub[],
  ): DiscoveryBatchJob {
    return {
      userId: args.userId,
      analysisRecordId: args.analysisRecordId,
      batchIndex,
      totalBatches,
      threads,
      userEmail: args.userEmail ?? undefined,
      existingCategories: args.existingCategories,
      existingVipContacts: args.existingVipContacts,
    };
  }

  private async enqueueBatch(job: DiscoveryBatchJob): Promise<string | null> {
    return this.boss.send(JOB_NAMES.ANALYZE_CONTEXT_BATCH, job, {
      priority: getJobPriority(JOB_NAMES.ANALYZE_CONTEXT_BATCH),
      singletonKey: buildDiscoveryBatchSingletonKey(
        job.analysisRecordId,
        job.batchIndex,
      ),
    });
  }
}
