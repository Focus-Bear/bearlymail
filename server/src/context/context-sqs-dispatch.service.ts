/**
 * ContextSqsDispatchService
 *
 * Extracted from ContextAnalysisOrchestratorService to keep that file under
 * the 800-line limit (it was 941 lines).
 *
 * Owns the SQS-dispatch side of context batch analysis:
 *   - enqueueSingleBatchViaSqs  — builds payload + dispatches one batch
 *   - enqueueAllBatchesViaSqs   — collects all per-batch SqsBatchMessage objects
 *                                 and sends them in groups of 10 via sendMessageBatch()
 *
 * Using sendMessageBatch() (10 messages per API call) instead of one sendMessage()
 * per batch dramatically reduces SQS API calls and latency when many batches
 * are dispatched at once (e.g., 30+ batches on a large account).
 */
import { Injectable, Logger } from "@nestjs/common";

import { SqsBatchMessage, SqsService } from "../aws/sqs.service";
import { getErrorMessage } from "../types/common";
import { buildBatchDeduplicationId } from "./context-batch-analysis.core";
import { BatchPayloadItem } from "./context-batch-payload.service";

export type SentPayloadItem = {
  emailId: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
};

export type ContextPromptItem = {
  key: string;
  value: string;
  source: string;
};

export type SqsEnqueueJobContext = {
  userId: string;
  analysisRecordId: string;
  sentPayload: SentPayloadItem[];
  currentContextForPrompt: ContextPromptItem[];
  twelveDaysAgo: Date;
  fiveDaysAgo: Date;
  userEmail: string | null;
  totalThreadIds: number;
  analysisBatchSize: number;
};

export type SqsDispatchResult = {
  jobId: string | null;
  batchNum: number;
};

@Injectable()
export class ContextSqsDispatchService {
  private readonly logger = new Logger(ContextSqsDispatchService.name);

  constructor(private readonly sqsService: SqsService) {}

  /**
   * Dispatch all batches to SQS using sendMessageBatch() (groups of 10).
   *
   * M-1 fix: instead of one sendMessage() call per batch (serial, N round-trips),
   * we collect all SqsBatchMessage objects and send them in groups of 10.
   * For 30 batches this reduces SQS API calls from 30 → 3.
   */
  async enqueueAllBatchesViaSqs(
    batches: Array<{ batchNum: number; batchPayload: BatchPayloadItem[] }>,
    ctx: SqsEnqueueJobContext,
    enqueueErrors: Array<{ batchNum: number; error: string }>,
  ): Promise<SqsDispatchResult[]> {
    if (!this.sqsService) {
      // Should never happen — SqsService is now required (non-optional).
      // Kept as a defensive guard; if reached it indicates a DI misconfiguration.
      const errorMessage =
        "SqsService not injected — ensure AwsModule is imported in ContextModule";
      this.logger.error(`[CONTEXT-ANALYSIS] [SQS] ${errorMessage}`);
      return batches.map(({ batchNum }) => {
        enqueueErrors.push({ batchNum: batchNum + 1, error: errorMessage });
        return { jobId: null, batchNum };
      });
    }

    // Map each batch to an SqsBatchMessage — no network calls yet
    const messages: Array<SqsBatchMessage & { batchNum: number }> = batches.map(
      ({ batchNum, batchPayload }) => {
        const deduplicationId = buildBatchDeduplicationId(
          ctx.analysisRecordId,
          batchNum,
        );
        const messageBody = this.buildMessageBody(batchNum, batchPayload, ctx);
        return {
          batchNum,
          messageBody,
          deduplicationId,
          // Each batch gets its own MessageGroupId so Lambda processes all batches
          // in parallel. Using the same group ID for all batches would force FIFO
          // sequential processing, defeating the 30x parallelism goal.
          messageGroupId: `${ctx.analysisRecordId}-${batchNum}`,
        };
      },
    );

    // Fire all groups of ≤10 via sendMessageBatch (handles chunking internally)
    const { messageIds, failed } =
      await this.sqsService.sendMessageBatch(messages);

    const results: SqsDispatchResult[] = batches.map(({ batchNum }, idx) => {
      if (failed.includes(idx)) {
        const errorMessage = `SQS batch send failed for message index ${idx}`;
        this.logger.error(
          `[CONTEXT-ANALYSIS] [SQS] ERROR: Failed to enqueue batch ${batchNum + 1}: ${errorMessage}`,
        );
        enqueueErrors.push({ batchNum: batchNum + 1, error: errorMessage });
        return { jobId: null, batchNum };
      }

      const messageId = messageIds[idx] ?? null;
      if (messageId) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] [SQS] Enqueued batch ${batchNum + 1} via SQS, message ID: ${messageId}`,
        );
      } else {
        this.logger.log(
          `[CONTEXT-ANALYSIS] [SQS] Enqueued batch ${batchNum + 1} via SQS (no message ID returned)`,
        );
      }
      return { jobId: messageId, batchNum };
    });

    const sentCount = messageIds.filter(
      (messageId) => messageId !== null,
    ).length;
    this.logger.log(
      `[CONTEXT-ANALYSIS] [SQS] Batch dispatch complete: ${sentCount}/${batches.length} sent`,
    );

    return results;
  }

  /**
   * Dispatch a single batch to SQS. Kept for cases where only one batch
   * needs to be sent (e.g., retry of a specific failed batch).
   */
  async enqueueSingleBatchViaSqs(
    batchNum: number,
    batchPayload: BatchPayloadItem[],
    ctx: SqsEnqueueJobContext,
    enqueueErrors: Array<{ batchNum: number; error: string }>,
  ): Promise<SqsDispatchResult> {
    if (!this.sqsService) {
      // Should never happen — SqsService is now required (non-optional).
      const errorMessage =
        "SqsService not injected — ensure AwsModule is imported in ContextModule";
      this.logger.error(`[CONTEXT-ANALYSIS] [SQS] ${errorMessage}`);
      enqueueErrors.push({ batchNum: batchNum + 1, error: errorMessage });
      return { jobId: null, batchNum };
    }

    const deduplicationId = buildBatchDeduplicationId(
      ctx.analysisRecordId,
      batchNum,
    );

    const messageBody = this.buildMessageBody(batchNum, batchPayload, ctx);

    try {
      const messageId = await this.sqsService.sendMessage(
        messageBody,
        deduplicationId,
        `${ctx.analysisRecordId}-${batchNum}`,
      );

      if (messageId) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] [SQS] Enqueued batch ${batchNum + 1}, message ID: ${messageId}`,
        );
      } else {
        this.logger.warn(
          `[CONTEXT-ANALYSIS] [SQS] Batch ${batchNum + 1} SQS send returned no message ID`,
        );
      }

      return { jobId: messageId ?? null, batchNum };
    } catch (enqueueError) {
      const errorMessage = getErrorMessage(enqueueError);
      this.logger.error(
        `[CONTEXT-ANALYSIS] [SQS] ERROR: Failed to enqueue batch ${batchNum + 1}: ${errorMessage}`,
      );
      enqueueErrors.push({ batchNum: batchNum + 1, error: errorMessage });
      return { jobId: null, batchNum };
    }
  }

  private buildMessageBody(
    batchNum: number,
    batchPayload: BatchPayloadItem[],
    ctx: SqsEnqueueJobContext,
  ): Record<string, unknown> {
    return {
      userId: ctx.userId,
      batchIndex: batchNum,
      batch: batchPayload,
      sentPayload: batchNum === 0 ? ctx.sentPayload : [],
      userEmail: ctx.userEmail ?? undefined,
      currentContextForPrompt: ctx.currentContextForPrompt,
      analysisRecordId: ctx.analysisRecordId,
      totalBatches: Math.ceil(ctx.totalThreadIds / ctx.analysisBatchSize),
      after: ctx.twelveDaysAgo.toISOString(),
      before: ctx.fiveDaysAgo.toISOString(),
      isLambdaDispatched: true,
    };
  }
}
