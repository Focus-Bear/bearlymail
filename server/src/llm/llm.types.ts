import { LLMOperation } from "./llm-operations";

export enum LLMProvider {
  GEMINI = "gemini",
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
}

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  /** Optional userId to use the user's own API key. */
  userId?: string;
  /** Operation type for token usage tracking. */
  operation?: LLMOperation;
  /** When true, instructs the provider to return valid JSON (prevents non-JSON responses). */
  jsonMode?: boolean;
  /** Optional model override (e.g. for cheap triage calls). */
  model?: string;
  metadata?: {
    /** Email IDs processed in this LLM call (for tracking duplicate summarisations). */
    emailIds?: string[];
  };
}
