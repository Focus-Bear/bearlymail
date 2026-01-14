import { LLMOperation } from "./llm-operations";

export enum LLMProvider {
  GEMINI = "gemini",
  OPENAI = "openai",
}

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  // Optional userId to use user's API key
  operation?: LLMOperation;
  // Operation type for token usage tracking
}


