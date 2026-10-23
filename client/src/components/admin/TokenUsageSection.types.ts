export interface UsageByOperation {
  operation: string;
  /** Server-provided display name. Optional for the same rolling-deploy reason as `models`. */
  operationLabel?: string;
  callCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
  htmlCallCount: number;
  /** Estimated USD cost for the operation; null when no model had pricing. */
  estimatedCostUsd: number | null;
  /** Calls on unpriced models left out of estimatedCostUsd. */
  unpricedCallCount?: number;
  /**
   * Model ids the operation ran on, most-used first (usually one). Optional so
   * a frontend deployed ahead of the backend (rolling deploy) doesn't crash on
   * a response that predates this field.
   */
  models?: string[];
}

export interface UsageSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
  totalEstimatedCostUsd: number;
  /** Calls on unpriced models left out of totalEstimatedCostUsd. */
  unpricedCallCount?: number;
}

export interface PromptExample {
  operation: string;
  /** Server-provided display name; optional for rolling deploys. */
  operationLabel?: string;
  promptTokens: number;
  promptText: string;
  systemPromptText?: string;
  containsHtml: boolean;
  capturedAt: string;
  provider: string;
  model: string;
}

export interface UsageByUser {
  userId: string;
  userEmail: string | null;
  callCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
}

export type DateRange = '24h' | '7d' | '30d' | 'all';
