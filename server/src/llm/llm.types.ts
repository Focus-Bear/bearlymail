import { LLMOperation } from "./llm-operations";

export enum LLMProvider {
  GEMINI = "gemini",
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  /** AWS Bedrock (Amazon Nova models). Used for cheap, high-volume summarisation. */
  BEDROCK = "bedrock",
  /** Locally installed Claude Code CLI (`claude -p`). No API key required. */
  CLAUDE_CLI = "claude-cli",
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
  /**
   * When true, request extended "thinking"/reasoning from the provider for
   * higher-quality answers on harder calls. For Gemini this enables a dynamic
   * thinking budget; non-thinking models ignore it.
   */
  thinking?: boolean;
  metadata?: {
    /** Email IDs processed in this LLM call (for tracking duplicate summarisations). */
    emailIds?: string[];
  };
}
