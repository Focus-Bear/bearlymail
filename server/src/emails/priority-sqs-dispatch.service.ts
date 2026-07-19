/**
 * PrioritySqsDispatchService
 *
 * Dispatches email priority batches to the SQS queue for Lambda processing,
 * mirroring the pattern used by ContextSqsDispatchService for context analysis.
 *
 * Architecture:
 *   LLMPriorityBatchService → PrioritySqsDispatchService → SQS FIFO
 *     → Lambda: bearlymail-email-prioritiser (×30 concurrent)
 *       → Writes results to RDS via RDS Proxy
 */
import { Injectable, Logger } from "@nestjs/common";

import { SqsBatchMessage, SqsService } from "../aws/sqs.service";
import {
  BYTE_CONVERSIONS,
  SQS_CONSTANTS,
} from "../constants/service-constants";

/**
 * User context item for priority analysis.
 */
export interface PriorityContextItem {
  value: string;
  explanation?: string;
  priority?: number;
}

/**
 * User context for priority analysis (mirrors LLMPriorityBatchService.buildUserContext).
 */
export interface PriorityUserContext {
  urgentItems: PriorityContextItem[];
  notUrgentItems: PriorityContextItem[];
  goals: PriorityContextItem[];
  workingOn: PriorityContextItem[];
  dontCare: Array<{ value: string }>;
  emailCategories: Array<{
    name: string;
    description?: string;
    categoryKey?: string;
  }>;
  protoCategories: Array<{
    name: string;
    description?: string;
    categoryKey?: string;
  }>;
}

/**
 * A single email payload within a priority batch.
 */
export interface PriorityEmailPayload {
  emailKey: string;
  from: string;
  fromName?: string;
  senderJobTitle?: string;
  subject: string;
  body: string;
  receivedAt?: Date;
  preComputedSentimentScore?: number;
  existingUrgencyScore?: number;
  existingCategory?: string;
}

export type PriorityBatchPayload = {
  userId: string;
  batchIndex: number;
  totalBatches: number;
  analysisId: string;
  emails: PriorityEmailPayload[];
  userContext: PriorityUserContext;
  /** IANA timezone used to render current/received times in the prompt. */
  userTimezone?: string;
};

export type PrioritySqsEnqueueJobContext = {
  userId: string;
  analysisId: string;
  emails: PriorityEmailPayload[];
  userContext: PriorityUserContext;
  totalBatches: number;
  userTimezone?: string;
};

export type PrioritySqsDispatchResult = {
  jobId: string | null;
  batchNum: number;
};

/**
 * Build a deduplication ID for a priority batch to prevent duplicate processing.
 * Uses userId + analysisId + batchIndex to ensure idempotency.
 */
export function buildPriorityBatchDeduplicationId(
  analysisId: string,
  batchIndex: number,
): string {
  return `priority-${analysisId}-batch-${batchIndex}`;
}

/**
 * SQS max message size is 256 KB. We enforce a soft limit (SQS_CONSTANTS.MAX_BODY_KB)
 * to leave headroom for SQS metadata and attribute overhead.
 */
const SQS_MAX_BODY_BYTES = SQS_CONSTANTS.MAX_BODY_KB * BYTE_CONVERSIONS.KB;

/**
 * Ensure a batch payload fits within the SQS 256 KB message size limit.
 * Email bodies are progressively trimmed, then stripped. If the user context
 * alone exceeds the limit, it is cleared as a last resort.
 */
export function trimPayloadToSqsLimit(
  payload: PriorityBatchPayload,
): PriorityBatchPayload {
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf-8") <= SQS_MAX_BODY_BYTES) {
    return payload;
  }

  for (const trimLen of SQS_CONSTANTS.TRIM_LENGTHS) {
    const trimmed: PriorityBatchPayload = {
      ...payload,
      emails: payload.emails.map((email) => ({
        ...email,
        body:
          email.body.length > trimLen
            ? `${email.body.substring(0, trimLen)}…`
            : email.body,
      })),
    };
    if (
      Buffer.byteLength(JSON.stringify(trimmed), "utf-8") <= SQS_MAX_BODY_BYTES
    ) {
      return trimmed;
    }
  }

  // Strip bodies entirely
  const strippedBodies: PriorityBatchPayload = {
    ...payload,
    emails: payload.emails.map((email) => ({ ...email, body: "" })),
  };
  if (
    Buffer.byteLength(JSON.stringify(strippedBodies), "utf-8") <=
    SQS_MAX_BODY_BYTES
  ) {
    return strippedBodies;
  }

  // Extreme last resort: user context alone exceeds the limit — clear it too
  return {
    ...strippedBodies,
    userContext: {
      urgentItems: [],
      notUrgentItems: [],
      goals: [],
      workingOn: [],
      dontCare: [],
      emailCategories: [],
      protoCategories: [],
    },
  };
}

@Injectable()
export class PrioritySqsDispatchService {
  private readonly logger = new Logger(PrioritySqsDispatchService.name);

  constructor(private readonly sqsService: SqsService) {}

  /**
   * Dispatch all priority batches to SQS using sendMessageBatch() (groups of 10).
   *
   * Each batch gets a unique MessageGroupId so Lambda processes all batches
   * in parallel without FIFO ordering constraints.
   */
  async enqueueAllBatchesViaSqs(
    batches: Array<{ batchNum: number; batchPayload: PriorityEmailPayload[] }>,
    ctx: PrioritySqsEnqueueJobContext,
    enqueueErrors: Array<{ batchNum: number; error: string }>,
  ): Promise<PrioritySqsDispatchResult[]> {
    if (!this.sqsService) {
      const errorMessage =
        "SqsService not injected — ensure AwsModule is imported in EmailsModule";
      this.logger.error(`[PRIORITY-SQS] ${errorMessage}`);
      return batches.map(({ batchNum }) => {
        enqueueErrors.push({ batchNum: batchNum + 1, error: errorMessage });
        return { jobId: null, batchNum };
      });
    }

    // Map each batch to an SqsBatchMessage
    const messages: Array<SqsBatchMessage & { batchNum: number }> = batches.map(
      ({ batchNum, batchPayload }) => {
        const deduplicationId = buildPriorityBatchDeduplicationId(
          ctx.analysisId,
          batchNum,
        );
        const rawPayload: PriorityBatchPayload = {
          userId: ctx.userId,
          batchIndex: batchNum,
          totalBatches: ctx.totalBatches,
          analysisId: ctx.analysisId,
          emails: batchPayload,
          userContext: ctx.userContext,
          userTimezone: ctx.userTimezone,
        };
        const messageBody = trimPayloadToSqsLimit(rawPayload);
        if (messageBody !== rawPayload) {
          this.logger.warn(
            `[PRIORITY-SQS] Batch ${batchNum + 1} payload exceeded SQS limit — email bodies trimmed`,
          );
        }
        return {
          batchNum,
          messageBody,
          deduplicationId,
          // Each batch gets its own MessageGroupId for parallel Lambda processing
          messageGroupId: `${ctx.analysisId}-batch-${batchNum}`,
        };
      },
    );

    // Fire all groups of ≤10 via sendPrioritisationMessageBatch
    const { messageIds, failed } =
      await this.sqsService.sendPrioritisationMessageBatch(messages);

    const results: PrioritySqsDispatchResult[] = batches.map(
      ({ batchNum }, idx) => {
        if (failed.includes(idx)) {
          const errorMessage = `SQS batch send failed for message index ${idx}`;
          this.logger.error(
            `[PRIORITY-SQS] ERROR: Failed to enqueue batch ${batchNum + 1}: ${errorMessage}`,
          );
          enqueueErrors.push({ batchNum: batchNum + 1, error: errorMessage });
          return { jobId: null, batchNum };
        }

        const messageId = messageIds[idx] ?? null;
        if (messageId) {
          this.logger.log(
            `[PRIORITY-SQS] Enqueued priority batch ${batchNum + 1} via SQS, message ID: ${messageId}`,
          );
        } else {
          this.logger.log(
            `[PRIORITY-SQS] Enqueued priority batch ${batchNum + 1} via SQS (no message ID returned)`,
          );
        }
        return { jobId: messageId, batchNum };
      },
    );

    const sentCount = messageIds.filter(
      (messageId) => messageId !== null,
    ).length;
    this.logger.log(
      `[PRIORITY-SQS] Batch dispatch complete: ${sentCount}/${batches.length} sent`,
    );

    return results;
  }

  /**
   * Dispatch a single priority batch to SQS.
   */
  async enqueueSingleBatchViaSqs(
    batchNum: number,
    batchPayload: PriorityEmailPayload[],
    ctx: PrioritySqsEnqueueJobContext,
    enqueueErrors: Array<{ batchNum: number; error: string }>,
  ): Promise<PrioritySqsDispatchResult> {
    if (!this.sqsService) {
      const errorMessage =
        "SqsService not injected — ensure AwsModule is imported in EmailsModule";
      this.logger.error(`[PRIORITY-SQS] ${errorMessage}`);
      enqueueErrors.push({ batchNum: batchNum + 1, error: errorMessage });
      return { jobId: null, batchNum };
    }

    const deduplicationId = buildPriorityBatchDeduplicationId(
      ctx.analysisId,
      batchNum,
    );

    const rawPayload: PriorityBatchPayload = {
      userId: ctx.userId,
      batchIndex: batchNum,
      totalBatches: ctx.totalBatches,
      analysisId: ctx.analysisId,
      emails: batchPayload,
      userContext: ctx.userContext,
    };
    const messageBody = trimPayloadToSqsLimit(rawPayload);
    if (messageBody !== rawPayload) {
      this.logger.warn(
        `[PRIORITY-SQS] Single batch ${batchNum + 1} payload exceeded SQS limit — email bodies trimmed`,
      );
    }

    try {
      const messageId = await this.sqsService.sendPrioritisationMessage(
        messageBody,
        deduplicationId,
        `${ctx.analysisId}-batch-${batchNum}`,
      );

      if (messageId) {
        this.logger.log(
          `[PRIORITY-SQS] Enqueued priority batch ${batchNum + 1}, message ID: ${messageId}`,
        );
      } else {
        this.logger.warn(
          `[PRIORITY-SQS] Batch ${batchNum + 1} SQS send returned no message ID`,
        );
      }

      return { jobId: messageId ?? null, batchNum };
    } catch (enqueueError) {
      const errorMessage =
        enqueueError instanceof Error
          ? enqueueError.message
          : String(enqueueError);
      this.logger.error(
        `[PRIORITY-SQS] ERROR: Failed to enqueue batch ${batchNum + 1}: ${errorMessage}`,
      );
      enqueueErrors.push({ batchNum: batchNum + 1, error: errorMessage });
      return { jobId: null, batchNum };
    }
  }
}
