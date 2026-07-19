import type OpenAI from "openai";

import type { AskAiTurn } from "../llm/llm-ask.service";

/**
 * A record of one tool the assistant used while answering, surfaced to the
 * client so the UI can show "Searched your emails" / "Looked in Google Drive".
 */
export interface AskAiToolActivity {
  /** Stable tool identifier (e.g. "search_emails" or the MCP tool name). */
  tool: string;
  /** Short, human-readable label for the UI. */
  label: string;
}

/** Result of an agentic Ask-AI turn. */
export interface AskAiAgentResult {
  answer: string;
  toolActivity: AskAiToolActivity[];
}

/** The open email/thread the conversation is grounded in. */
export interface AskAiEmailContext {
  subject: string;
  from: string;
  fromName: string;
  body: string;
  isThread: boolean;
}

/** Streamed progress event for an in-flight Ask AI turn. */
export type AskAiStreamEvent =
  | { type: "tool"; activity: AskAiToolActivity }
  | { type: "answer"; answer: string; toolActivity: AskAiToolActivity[] }
  | { type: "error"; message: string };

export interface AskAiAgentOptions {
  email: AskAiEmailContext;
  question: string;
  history: AskAiTurn[];
  userId: string;
  /** Called as each tool runs, so a streaming caller can show live progress. */
  onEvent?: (event: AskAiStreamEvent) => void;
  /** External abort signal (e.g. the HTTP client disconnected). */
  signal?: AbortSignal;
}

/**
 * How a tool exposed to the model maps back to an executable action. The model
 * only sees the function name; the registry resolves it to a concrete call.
 */
export type AskAiToolDescriptor =
  | { kind: "search_emails" }
  | {
      kind: "mcp";
      serverId: string;
      serverName: string;
      toolName: string;
    };

/** The set of tools offered to the model plus the resolution registry. */
export interface AskAiToolset {
  tools: OpenAI.Chat.Completions.ChatCompletionTool[];
  registry: Map<string, AskAiToolDescriptor>;
}
