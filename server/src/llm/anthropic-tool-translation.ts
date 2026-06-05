import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";

import { LLM_BLOCK_TYPES } from "../constants/domain-types";

/**
 * Pure translation between the OpenAI chat/tool message shape (used as the
 * lingua franca across the LLM layer) and Anthropic's tool_use/tool_result
 * format. Kept side-effect free so it can be unit-tested directly.
 */

const FUNCTION_TOOL_CALL = "function";
const ROLE_SYSTEM = "system" as const;
const ROLE_USER = "user" as const;
const ROLE_ASSISTANT = "assistant" as const;
const ROLE_TOOL = "tool" as const;

export function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part && "text" in part
          ? String((part as { text: unknown }).text)
          : "",
      )
      .join("");
  }
  return "";
}

export function safeJsonParse(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function assistantContentBlocks(
  message: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam,
): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  const text = contentToString(message.content);
  if (text) blocks.push({ type: "text", text });
  for (const call of message.tool_calls ?? []) {
    if (call.type !== FUNCTION_TOOL_CALL) continue;
    blocks.push({
      type: "tool_use",
      id: call.id,
      name: call.function.name,
      input: safeJsonParse(call.function.arguments),
    });
  }
  // Anthropic rejects empty content; fall back to a single space.
  return blocks.length > 0 ? blocks : [{ type: "text", text: " " }];
}

/** Translate OpenAI-shaped messages to an Anthropic system string + messages. */
export function toAnthropicMessages(
  openAiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): { system: string; messages: Anthropic.MessageParam[] } {
  const systemParts: string[] = [];
  const messages: Anthropic.MessageParam[] = [];
  let pendingToolResults: Anthropic.ToolResultBlockParam[] = [];

  const flushToolResults = () => {
    if (pendingToolResults.length > 0) {
      messages.push({ role: "user", content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const message of openAiMessages) {
    if (message.role === ROLE_SYSTEM) {
      systemParts.push(contentToString(message.content));
      continue;
    }
    if (message.role === ROLE_TOOL) {
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: message.tool_call_id,
        content: contentToString(message.content),
      });
      continue;
    }
    flushToolResults();
    if (message.role === ROLE_USER) {
      messages.push({
        role: "user",
        content: contentToString(message.content),
      });
    } else if (message.role === ROLE_ASSISTANT) {
      messages.push({
        role: "assistant",
        content: assistantContentBlocks(message),
      });
    }
  }
  flushToolResults();

  // Anthropic's Messages API requires (a) the first message to have role
  // "user" and (b) strictly alternating user/assistant roles. Drop any
  // leading non-user messages and merge runs of same-role messages by
  // concatenating their content blocks.
  const validatedMessages: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    if (validatedMessages.length === 0) {
      if (msg.role !== ROLE_USER) continue;
      validatedMessages.push(msg);
      continue;
    }
    const lastMsg = validatedMessages[validatedMessages.length - 1];
    if (lastMsg.role === msg.role) {
      const lastBlocks: Anthropic.ContentBlockParam[] = Array.isArray(
        lastMsg.content,
      )
        ? (lastMsg.content as Anthropic.ContentBlockParam[])
        : [{ type: "text", text: lastMsg.content as string }];
      const nextBlocks: Anthropic.ContentBlockParam[] = Array.isArray(
        msg.content,
      )
        ? (msg.content as Anthropic.ContentBlockParam[])
        : [{ type: "text", text: msg.content as string }];
      lastMsg.content = [
        ...lastBlocks,
        ...nextBlocks,
      ] as Anthropic.MessageParam["content"];
    } else {
      validatedMessages.push(msg);
    }
  }

  return { system: systemParts.join("\n\n"), messages: validatedMessages };
}

export function toAnthropicTools(
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
): Anthropic.Tool[] {
  return (tools ?? [])
    .filter((tool) => tool.type === FUNCTION_TOOL_CALL)
    .map((tool) => ({
      name: tool.function.name,
      description: tool.function.description ?? "",
      input_schema: (tool.function
        .parameters as Anthropic.Tool.InputSchema) ?? {
        type: "object",
        properties: {},
      },
    }));
}

/** Map an Anthropic reply back into an OpenAI ChatCompletionMessage. */
export function fromAnthropicMessage(
  response: Anthropic.Message,
): OpenAI.Chat.Completions.ChatCompletionMessage {
  let text = "";
  const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
  for (const block of response.content) {
    if (block.type === LLM_BLOCK_TYPES.TEXT) {
      text += block.text;
    } else if (block.type === LLM_BLOCK_TYPES.TOOL_USE) {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    }
  }
  return {
    role: "assistant",
    content: text || null,
    refusal: null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  } as OpenAI.Chat.Completions.ChatCompletionMessage;
}
