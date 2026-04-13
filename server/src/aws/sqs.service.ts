import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  SendMessageBatchCommand,
  SendMessageBatchRequestEntry,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { randomUUID } from "crypto";

export interface SqsBatchMessage {
  messageBody: Record<string, unknown>;
  deduplicationId?: string;
  messageGroupId?: string;
}

@Injectable()
export class SqsService {
  private readonly logger = new Logger(SqsService.name);
  private readonly client: SQSClient;
  private readonly queueUrl: string | undefined;
  private readonly prioritisationQueueUrl: string | undefined;

  constructor(private configService: ConfigService) {
    const region =
      this.configService.get<string>("AWS_REGION") || "ap-southeast-2";
    this.client = new SQSClient({ region });
    this.queueUrl = this.configService.get<string>(
      "CONTEXT_ANALYSIS_SQS_QUEUE_URL",
    );
    this.prioritisationQueueUrl = this.configService.get<string>(
      "EMAIL_PRIORITISATION_SQS_QUEUE_URL",
    );
  }

  /**
   * Send a single message to the context analysis SQS FIFO queue.
   *
   * @param messageBody - The message payload.
   * @param deduplicationId - Explicit deduplication ID (required for FIFO queues
   *   when contentBasedDeduplication is false).
   * @param messageGroupId - FIFO message group ID; defaults to "context-analysis".
   */
  async sendMessage(
    messageBody: Record<string, unknown>,
    deduplicationId?: string,
    messageGroupId = "context-analysis",
  ): Promise<string | undefined> {
    if (!this.queueUrl) {
      throw new Error("CONTEXT_ANALYSIS_SQS_QUEUE_URL is not configured");
    }

    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageDeduplicationId: deduplicationId,
      MessageGroupId: messageGroupId,
    });

    const result = await this.client.send(command);
    this.logger.log(`SQS message sent: ${result.MessageId}`);
    return result.MessageId;
  }

  /**
   * Send a single message to the email prioritisation SQS FIFO queue.
   *
   * @param messageBody - The message payload.
   * @param deduplicationId - Explicit deduplication ID.
   * @param messageGroupId - FIFO message group ID; defaults to "email-prioritisation".
   */
  async sendPrioritisationMessage(
    messageBody: Record<string, unknown>,
    deduplicationId?: string,
    messageGroupId = "email-prioritisation",
  ): Promise<string | undefined> {
    if (!this.prioritisationQueueUrl) {
      throw new Error("EMAIL_PRIORITISATION_SQS_QUEUE_URL is not configured");
    }

    const command = new SendMessageCommand({
      QueueUrl: this.prioritisationQueueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageDeduplicationId: deduplicationId,
      MessageGroupId: messageGroupId,
    });

    const result = await this.client.send(command);
    this.logger.log(`SQS prioritisation message sent: ${result.MessageId}`);
    return result.MessageId;
  }

  /**
   * Send a batch of up to 10 messages to SQS in a single API call.
   * Automatically splits larger arrays into groups of 10.
   */
  async sendMessageBatch(messages: SqsBatchMessage[]): Promise<{
    messageIds: Array<string | null>;
    failed: number[];
  }> {
    if (!this.queueUrl) {
      throw new Error("CONTEXT_ANALYSIS_SQS_QUEUE_URL is not configured");
    }
    return this.sendBatchToQueue(messages, this.queueUrl, "context-analysis");
  }

  /**
   * Send a batch of up to 10 messages to the email prioritisation SQS queue.
   * Automatically splits larger arrays into groups of 10.
   */
  async sendPrioritisationMessageBatch(messages: SqsBatchMessage[]): Promise<{
    messageIds: Array<string | null>;
    failed: number[];
  }> {
    if (!this.prioritisationQueueUrl) {
      throw new Error("EMAIL_PRIORITISATION_SQS_QUEUE_URL is not configured");
    }
    return this.sendBatchToQueue(
      messages,
      this.prioritisationQueueUrl,
      "email-prioritisation",
    );
  }

  private async sendBatchToQueue(
    messages: SqsBatchMessage[],
    queueUrl: string,
    defaultGroupId: string,
  ): Promise<{
    messageIds: Array<string | null>;
    failed: number[];
  }> {
    const failed: number[] = [];
    const SQS_BATCH_LIMIT = 10;

    const messageIds: Array<string | null> = new Array(messages.length).fill(
      null,
    );

    for (let i = 0; i < messages.length; i += SQS_BATCH_LIMIT) {
      const chunk = messages.slice(i, i + SQS_BATCH_LIMIT);

      const entries: SendMessageBatchRequestEntry[] = chunk.map((msg, idx) => ({
        Id: String(i + idx),
        MessageBody: JSON.stringify(msg.messageBody),
        MessageDeduplicationId: msg.deduplicationId,
        MessageGroupId: msg.messageGroupId ?? defaultGroupId,
      }));

      const command = new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: entries,
      });

      try {
        const result = await this.client.send(command);

        for (const successEntry of result.Successful ?? []) {
          if (successEntry.Id) {
            const idx = Number(successEntry.Id);
            messageIds[idx] = successEntry.MessageId ?? randomUUID();
          }
        }

        for (const failEntry of result.Failed ?? []) {
          this.logger.error(
            `SQS batch entry ${failEntry.Id} failed: [${failEntry.Code}] ${failEntry.Message}`,
          );
          failed.push(i + Number(failEntry.Id));
        }
      } catch (err) {
        this.logger.error(`SQS sendBatchToQueue chunk failed: ${err}`);
        for (let j = 0; j < chunk.length; j++) {
          failed.push(i + j);
        }
      }
    }

    const successCount = messageIds.filter(
      (messageId) => messageId !== null,
    ).length;
    this.logger.log(
      `SQS batch send complete: ${successCount} sent, ${failed.length} failed`,
    );
    return { messageIds, failed };
  }
}
