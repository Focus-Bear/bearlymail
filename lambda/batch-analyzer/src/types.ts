/**
 * Shared types for the Lambda batch analyzer.
 * Mirror of server/src/context/context-batch-analysis.core.ts
 * (duplicated to keep Lambda self-contained without importing server code).
 */

export interface ContextBatchPayload {
  userId: string;
  batchIndex: number;
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
  threadIds?: string[];
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
  isLambdaDispatched?: boolean;
}
