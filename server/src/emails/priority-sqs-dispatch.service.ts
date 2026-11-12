import { Injectable, Logger } from "@nestjs/common";

import { SqsService } from "../aws/sqs.service";
import type { PriorityBatchLambdaMessage } from "./priority-batch-lambda-message";

/**
 * Sends refine-priority batches to the prioritisation Lambda over SQS.
 *
 *   LLMPriorityBatchService → PrioritySqsDispatchService → SQS FIFO → Lambda
 *
 * Each batch is its own FIFO message group, so the Lambda processes batches in
 * parallel (up to its reserved concurrency) instead of one at a time.
 */
@Injectable()
export class PrioritySqsDispatchService {
  private readonly logger = new Logger(PrioritySqsDispatchService.name);

  constructor(private readonly sqsService: SqsService) {}

  /** Returns the SQS message id, or null when the send failed (the caller falls back). */
  async dispatchBatch(
    message: PriorityBatchLambdaMessage,
  ): Promise<string | null> {
    try {
      const messageId = await this.sqsService.sendPrioritisationMessage(
        { ...message },
        message.analysisId,
        message.analysisId,
      );
      return messageId ?? null;
    } catch (error) {
      this.logger.error(
        `[PRIORITY-SQS] Failed to dispatch batch ${message.analysisId} (${message.emailIds.length} emails)`,
        error,
      );
      return null;
    }
  }
}
