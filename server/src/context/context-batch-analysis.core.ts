/**
 * Shared core logic for context batch analysis.
 *
 * This module contains the data types and payload contracts shared between:
 * - ContextBatchAnalysisProcessor (PgBoss worker path)
 * - Lambda handler (SQS + Lambda path)
 *
 * The actual analysis logic lives in each handler but uses the same payload
 * shape so that both paths are interchangeable from the orchestrator's
 * perspective.
 */

/**
 * The canonical payload for a single context analysis batch.
 * Sent as a PgBoss job body (PgBoss path) or SQS message body (Lambda path).
 *
 * Batch payloads are self-contained: the orchestrator pre-fetches threads and
 * builds these payloads before enqueuing, so neither the PgBoss worker nor
 * the Lambda function needs to hit the Gmail API for the pre-processed path.
 */
export interface ContextBatchPayload {
  userId: string;
  batchIndex: number;

  /** Pre-processed thread payloads (preferred path — no Gmail API call required). */
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

  /**
   * Legacy path: thread IDs only. The processor fetches from Gmail.
   * Not used for Lambda dispatch (Lambda avoids Gmail API calls in MVP).
   */
  threadIds?: string[];

  /** Sent email payload — only populated for batch 0. */
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
  after?: string;
  before?: string;

  /**
   * Whether this batch was dispatched via Lambda (SQS path).
   * Used by finalization to apply a shorter polling delay.
   */
  isLambdaDispatched?: boolean;
}

/**
 * Result of a successfully completed batch, written to the DB by both
 * the PgBoss worker and the Lambda function.
 */
export interface BatchResult {
  context: unknown[];
  writingStyle: unknown | null;
  completedAt: string;
  threadIds: string[];
}

/**
 * Build the SQS deduplication ID for a given batch.
 * Prevents the same batch being processed twice if enqueued multiple times.
 */
export function buildBatchDeduplicationId(
  analysisRecordId: string,
  batchIndex: number,
): string {
  return `analyze-context-batch-${analysisRecordId}-${batchIndex}`;
}
