/**
 * Type definitions for the email prioritiser Lambda function.
 * Defines the shape of SQS payloads and priority analysis results.
 */

/**
 * User context items shared across all emails in a priority batch.
 */
export interface UserContextItem {
  value: string;
  explanation?: string;
  priority?: number;
}

export interface UserContext {
  urgentItems: UserContextItem[];
  notUrgentItems: UserContextItem[];
  goals: UserContextItem[];
  workingOn: UserContextItem[];
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
 * A single email within a priority batch payload.
 */
export interface PriorityEmailPayload {
  emailKey: string;
  from: string;
  fromName?: string;
  senderJobTitle?: string;
  subject: string;
  body: string;
  /** ISO timestamp (Date serialises to a string over SQS JSON). */
  receivedAt?: string;
  preComputedSentimentScore?: number;
  existingUrgencyScore?: number;
  existingCategory?: string;
}

/**
 * SQS message payload for email prioritisation batches.
 * Mirrors the structure built by LLMPriorityBatchService.buildBatchEmailPayloads().
 */
export interface PriorityBatchPayload {
  userId: string;
  batchIndex: number;
  totalBatches: number;
  analysisId: string;
  emails: PriorityEmailPayload[];
  userContext: UserContext;
  /** IANA timezone used to render current/received times in the prompt. */
  userTimezone?: string;
}

/**
 * Individual priority analysis result for one email.
 */
export interface PriorityResult {
  urgencyScore: number;
  urgencyExplanation: string;
  sentimentScore: number | undefined;
  goalAlignmentScore: number;
  goalAlignmentExplanation: string;
  category: string;
  categoryExplanation: string;
  categoryConfidence?: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;
  protoCategorySuggestion?: { name: string; description: string };
}

/**
 * Batch priority result with triage metadata.
 */
export interface BatchPriorityResult extends PriorityResult {
  isFallback: boolean;
  triagePreserved?: boolean;
}

/**
 * Triage result for a single email (Phase 1).
 */
export interface TriageResult {
  emailKey: string;
  needsReanalysis: boolean;
  reason: string;
}

/**
 * Triage response from the cheap LLM model.
 */
export interface TriageResponse {
  results: TriageResult[];
}

/**
 * Full batch analysis result from the Lambda.
 */
export interface LambdaBatchResult {
  analysisId: string;
  batchIndex: number;
  results: Map<string, BatchPriorityResult>;
  processedAt: string;
}
