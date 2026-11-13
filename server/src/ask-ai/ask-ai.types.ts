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

/**
 * A connected-tool call the agent wants to make that is not known to be
 * read-only, so it waits for the user's explicit approval. The arguments shown
 * here are exactly what runs on approval; `argumentsHash` binds the approval to
 * them and `approvalId` identifies the single-use, expiring pending record.
 */
export interface AskAiPendingToolCall {
  approvalId: string;
  /** Display name of the connected server the tool belongs to. */
  serverName: string;
  /** The tool's name as the connected server advertises it. */
  toolName: string;
  /** Optional human-readable title from the server's tool annotations. */
  toolTitle?: string;
  arguments: Record<string, unknown>;
  argumentsHash: string;
  /** ISO timestamp after which the approval can no longer be used. */
  expiresAt: string;
}

/**
 * Result of an agentic Ask-AI turn: either a final answer, or a pause waiting
 * for the user to approve or deny a tool call (`answer` is then empty).
 */
export interface AskAiAgentResult {
  answer: string;
  toolActivity: AskAiToolActivity[];
  pendingToolCall?: AskAiPendingToolCall;
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
  | {
      type: "approval_required";
      pendingToolCall: AskAiPendingToolCall;
      toolActivity: AskAiToolActivity[];
    }
  | { type: "error"; message: string };

/** Callbacks shared by a fresh turn and a resumed (post-approval) turn. */
export interface AskAiRunHooks {
  /** Called as each tool runs, so a streaming caller can show live progress. */
  onEvent?: (event: AskAiStreamEvent) => void;
  /** External abort signal (e.g. the HTTP client disconnected). */
  signal?: AbortSignal;
}

/** The user's answer to a pending tool call. */
export interface AskAiToolDecision {
  userId: string;
  approvalId: string;
  argumentsHash: string;
  approved: boolean;
}

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
      toolTitle?: string;
      /**
       * True only when the server explicitly annotates the tool as read-only.
       * Anything else needs the user's approval before each call.
       */
      readOnly: boolean;
    };

/** The set of tools offered to the model plus the resolution registry. */
export interface AskAiToolset {
  tools: OpenAI.Chat.Completions.ChatCompletionTool[];
  registry: Map<string, AskAiToolDescriptor>;
}

/** A connected (MCP) tool descriptor. */
export type AskAiMcpToolDescriptor = Extract<
  AskAiToolDescriptor,
  { kind: "mcp" }
>;

/**
 * The agent loop's working state. Persisted (encrypted) while a tool call
 * waits for approval so the turn can resume exactly where it paused.
 */
export interface AskAiLoopState {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  activity: AskAiToolActivity[];
  /** Model rounds that have already requested tools. */
  round: number;
  /** Tool calls from the latest assistant message not yet answered. */
  queuedCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
}

/** A paused turn: loop state plus the call awaiting the user's decision. */
export interface AskAiPausedTurn extends AskAiLoopState {
  awaiting: {
    toolCallId: string;
    descriptor: AskAiMcpToolDescriptor;
    args: Record<string, unknown>;
  };
}
