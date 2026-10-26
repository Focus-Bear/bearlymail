/**
 * The I/O boundary of the email-intelligence module. Everything in this folder
 * is framework-free so the same decision logic runs in the NestJS worker and in
 * the prioritisation Lambda; each runtime supplies these ports (Nest services
 * satisfy them structurally, the Lambda implements them over pg/fetch).
 */
import type { LLMOperation } from "../../llm/llm-operations";

/** The subset of a logger the module uses; Nest's Logger and console both fit. */
export interface LoggerPort {
  log(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

/** Reads one configuration value (env var name), undefined when unset. */
export type ConfigReader = (key: string) => string | undefined;

/** Reports an unexpected failure to error tracking. */
export interface ErrorReporter {
  captureException(
    error: Error,
    userId?: string,
    additionalContext?: Record<string, unknown>,
  ): void;
}

/** One LLM/Jev/embedding call's token usage, as written to `token_usage`. */
export interface TokenUsageLogData {
  userId?: string | null;
  operation: LLMOperation;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs?: number | null;
  // Optional: full prompt text for example capture
  promptText?: string;
  systemPromptText?: string;
  // Whether the input prompt contained HTML (auto-detected if promptText provided)
  containsHtml?: boolean;
  // Email IDs processed in this LLM call (for tracking duplicate summarizations)
  emailIds?: string[];
}

/** Records token usage so every runtime's spend shows on the admin dashboard. */
export interface TokenUsageSink {
  logUsage(usageData: TokenUsageLogData): Promise<unknown>;
}
