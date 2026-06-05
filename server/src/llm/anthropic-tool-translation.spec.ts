import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";

import {
  fromAnthropicMessage,
  toAnthropicMessages,
  toAnthropicTools,
} from "./anthropic-tool-translation";

type OpenAIMsg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

describe("anthropic-tool-translation", () => {
  describe("toAnthropicMessages", () => {
    it("extracts system messages and keeps user/assistant order", () => {
      const messages: OpenAIMsg[] = [
        { role: "system", content: "You are an assistant." },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "Thanks" },
      ];
      const { system, messages: out } = toAnthropicMessages(messages);
      expect(system).toBe("You are an assistant.");
      expect(out).toHaveLength(3);
      expect(out[0]).toEqual({ role: "user", content: "Hi" });
      // Assistant messages are emitted as content blocks (valid Anthropic form).
      expect(out[1]).toEqual({
        role: "assistant",
        content: [{ type: "text", text: "Hello" }],
      });
    });

    it("maps a tool call + result to tool_use / tool_result blocks", () => {
      const messages: OpenAIMsg[] = [
        { role: "user", content: "search" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "search_emails", arguments: '{"query":"x"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "call-1", content: '{"count":1}' },
      ];
      const { messages: out } = toAnthropicMessages(messages);

      // user, assistant(tool_use), user(tool_result)
      expect(out).toHaveLength(3);
      const assistantBlocks = out[1].content as Anthropic.ContentBlockParam[];
      const toolUse = assistantBlocks.find((blk) => blk.type === "tool_use");
      expect(toolUse).toMatchObject({
        type: "tool_use",
        id: "call-1",
        name: "search_emails",
        input: { query: "x" },
      });
      const resultBlocks = out[2].content as Anthropic.ContentBlockParam[];
      expect(resultBlocks[0]).toMatchObject({
        type: "tool_result",
        tool_use_id: "call-1",
        content: '{"count":1}',
      });
    });

    it("groups consecutive tool results into one user message", () => {
      const messages: OpenAIMsg[] = [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "a",
              type: "function",
              function: { name: "t", arguments: "{}" },
            },
            {
              id: "b",
              type: "function",
              function: { name: "t", arguments: "{}" },
            },
          ],
        },
        { role: "tool", tool_call_id: "a", content: "1" },
        { role: "tool", tool_call_id: "b", content: "2" },
      ];
      const { messages: out } = toAnthropicMessages(messages);
      const resultMsg = out[out.length - 1];
      expect(resultMsg.role).toBe("user");
      expect(resultMsg.content).toHaveLength(2);
    });
  });

  describe("toAnthropicTools", () => {
    it("maps function tools to Anthropic tools", () => {
      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
        {
          type: "function",
          function: {
            name: "search_emails",
            description: "Search",
            parameters: { type: "object", properties: {} },
          },
        },
      ];
      const out = toAnthropicTools(tools);
      expect(out[0]).toMatchObject({
        name: "search_emails",
        description: "Search",
        input_schema: { type: "object" },
      });
    });
  });

  describe("fromAnthropicMessage", () => {
    it("converts text + tool_use blocks to an OpenAI message", () => {
      const response = {
        content: [
          { type: "text", text: "Looking…" },
          {
            type: "tool_use",
            id: "tu-1",
            name: "search_emails",
            input: { query: "budget" },
          },
        ],
      } as unknown as Anthropic.Message;

      const message = fromAnthropicMessage(response);
      expect(message.content).toBe("Looking…");
      expect(message.tool_calls?.[0]).toMatchObject({
        id: "tu-1",
        type: "function",
        function: { name: "search_emails", arguments: '{"query":"budget"}' },
      });
    });

    it("returns null content when only tool calls are present", () => {
      const response = {
        content: [{ type: "tool_use", id: "tu-1", name: "t", input: {} }],
      } as unknown as Anthropic.Message;
      const message = fromAnthropicMessage(response);
      expect(message.content).toBeNull();
      expect(message.tool_calls).toHaveLength(1);
    });
  });
});
