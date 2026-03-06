export interface UsageByOperation {
  operation: string;
  callCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
  htmlCallCount: number;
}

export interface UsageSummary {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgDurationMs: number | null;
}

export interface PromptExample {
  operation: string;
  promptTokens: number;
  promptText: string;
  systemPromptText?: string;
  containsHtml: boolean;
  capturedAt: string;
  provider: string;
  model: string;
}

export type DateRange = '24h' | '7d' | '30d' | 'all';
