import { Injectable, Logger } from "@nestjs/common";
import type OpenAI from "openai";

import { StructuralError } from "../errors/structural-error";
import { LLMCoreService } from "../llm/llm-core.service";
import { LLM_OP_ASK_AI_AGENT } from "../llm/llm-operations";
import { ASSISTANT_PROMPT_IDS, getPrompt, renderPrompt } from "../llm/prompts";
import {
  AskAiAgentOptions,
  AskAiAgentResult,
  AskAiStreamEvent,
  AskAiToolActivity,
  AskAiToolset,
} from "./ask-ai.types";
import { AskAiToolService } from "./ask-ai-tools.service";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** OpenAI tool-call discriminant for standard function tools. */
const FUNCTION_TOOL_CALL = "function";

/**
 * Drives the agentic Ask AI turn: grounds the model in the open email, exposes
 * the user's tools (email search + connected MCP tools), and runs a bounded
 * tool-calling loop until the model produces a final answer.
 */
@Injectable()
export class AskAiAgentService {
  private readonly logger = new Logger(AskAiAgentService.name);

  /** Max model turns that may request tools before we force a text answer. */
  private static readonly MAX_TOOL_ROUNDS = 4;

  /** Overall wall-clock budget for a single Ask AI turn. */
  private static readonly TURN_BUDGET_MS = 60_000;
  /** Per model-call timeout (also bounded by the remaining turn budget). */
  private static readonly PER_CALL_TIMEOUT_MS = 30_000;

  constructor(
    private readonly llmCore: LLMCoreService,
    private readonly tools: AskAiToolService,
  ) {}

  async ask(options: AskAiAgentOptions): Promise<AskAiAgentResult> {
    const { userId, onEvent, signal } = options;

    const promptConfig = getPrompt(ASSISTANT_PROMPT_IDS.ASK_AI_AGENT);
    if (!promptConfig) {
      throw new StructuralError(
        `Prompt template not found: ${ASSISTANT_PROMPT_IDS.ASK_AI_AGENT}. Expected file: ask-ai-agent.md in server/promptfoo/prompts/ directory.`,
      );
    }

    const messages = this.buildMessages(promptConfig, options);
    const toolset = await this.tools.buildToolset(userId);
    const activity: AskAiToolActivity[] = [];
    const { deadline, controller, cleanup } = this.setupAbort(signal);

    try {
      for (let round = 0; round < AskAiAgentService.MAX_TOOL_ROUNDS; round++) {
        if (Date.now() >= deadline) break;

        const message = await this.llmCore.chatWithTools({
          messages,
          tools: toolset.tools,
          userId,
          operation: LLM_OP_ASK_AI_AGENT,
          timeoutMs: this.callTimeout(deadline),
          signal: controller.signal,
        });

        messages.push(this.toAssistantMessage(message));

        const toolCalls = message.tool_calls ?? [];
        if (toolCalls.length === 0) {
          return {
            answer: (message.content ?? "").trim(),
            toolActivity: activity,
          };
        }

        await this.runToolCalls({
          userId,
          toolCalls,
          toolset,
          messages,
          activity,
          onEvent,
        });
      }

      // Tool budget exhausted (or deadline hit) — force a final text answer.
      const finalMessage = await this.llmCore.chatWithTools({
        messages,
        userId,
        operation: LLM_OP_ASK_AI_AGENT,
        timeoutMs: this.callTimeout(deadline),
        signal: controller.signal,
      });
      return {
        answer: (finalMessage.content ?? "").trim(),
        toolActivity: activity,
      };
    } catch (error) {
      // Client-initiated abort: not a timeout. Rethrow so the caller can
      // distinguish a normal disconnect from a system timeout.
      if (signal?.aborted) {
        throw error;
      }
      if (controller.signal.aborted || this.isTimeout(error)) {
        this.logger.warn("Ask AI turn timed out");
        return {
          answer:
            activity.length > 0
              ? "I ran out of time before I could finish. Here's what I started looking into — try narrowing your question or asking again."
              : "I couldn't answer in time. Please try again, or ask a more specific question.",
          toolActivity: activity,
        };
      }
      throw error;
    } finally {
      cleanup();
    }
  }

  /**
   * Wire up the turn-level abort controller: a wall-clock timeout plus
   * forwarding from the caller's own abort signal. Returns the deadline,
   * controller, and a cleanup callback to run in `finally`.
   */
  private setupAbort(signal: AbortSignal | undefined): {
    deadline: number;
    controller: AbortController;
    cleanup: () => void;
  } {
    const deadline = Date.now() + AskAiAgentService.TURN_BUDGET_MS;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      AskAiAgentService.TURN_BUDGET_MS,
    );
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener("abort", onExternalAbort);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onExternalAbort);
    };
    return { deadline, controller, cleanup };
  }

  /** Build the system + seed user message (email context + history + question). */
  private buildMessages(
    promptConfig: { prompt: string; systemPrompt: string },
    options: AskAiAgentOptions,
  ): ChatMessage[] {
    const { email, history, question } = options;
    // Body is already cleaned + bounded by the controller (single email or the
    // assembled thread), so we render it as-is.
    const userContent = renderPrompt(promptConfig.prompt || "", {
      subject: email.subject || "(no subject)",
      from: email.from,
      fromName: email.fromName || email.from || "Unknown sender",
      isThread: email.isThread,
      body: email.body,
      hasHistory: history.length > 0,
      history,
      question,
    });
    return [
      { role: "system", content: promptConfig.systemPrompt || "" },
      { role: "user", content: userContent },
    ];
  }

  /** Remaining turn budget, clamped to the per-call timeout. */
  private callTimeout(deadline: number): number {
    return Math.max(
      1,
      Math.min(AskAiAgentService.PER_CALL_TIMEOUT_MS, deadline - Date.now()),
    );
  }

  private isTimeout(error: unknown): boolean {
    const name = (error as { name?: string })?.name ?? "";
    return name === "AbortError" || name === "APIUserAbortError";
  }

  /** Execute every tool call in a round and append the results to `messages`. */
  private async runToolCalls(ctx: {
    userId: string;
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
    toolset: AskAiToolset;
    messages: ChatMessage[];
    activity: AskAiToolActivity[];
    onEvent?: (event: AskAiStreamEvent) => void;
  }): Promise<void> {
    const { userId, toolCalls, toolset, messages, activity, onEvent } = ctx;
    for (const call of toolCalls) {
      if (call.type !== FUNCTION_TOOL_CALL) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "Unsupported tool call type" }),
        });
        continue;
      }

      const descriptor = toolset.registry.get(call.function.name);
      if (!descriptor) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "Unknown tool" }),
        });
        continue;
      }

      const args = this.parseArguments(call.function.arguments);
      const { resultJson, activity: toolActivity } =
        await this.tools.executeTool(userId, descriptor, args);
      activity.push(toolActivity);
      onEvent?.({ type: "tool", activity: toolActivity });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: resultJson,
      });
    }
  }

  private parseArguments(raw: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(raw || "{}");
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      this.logger.warn("Failed to parse tool-call arguments; using {}");
      return {};
    }
  }

  private toAssistantMessage(
    message: OpenAI.Chat.Completions.ChatCompletionMessage,
  ): ChatMessage {
    const assistant: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam =
      {
        role: "assistant",
        content: message.content ?? "",
      };
    if (message.tool_calls && message.tool_calls.length > 0) {
      assistant.tool_calls = message.tool_calls;
    }
    return assistant;
  }
}
