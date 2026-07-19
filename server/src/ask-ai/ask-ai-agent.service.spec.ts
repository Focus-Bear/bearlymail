import type OpenAI from "openai";

import { LLMCoreService } from "../llm/llm-core.service";
import { AskAiToolset } from "./ask-ai.types";
import { AskAiAgentService } from "./ask-ai-agent.service";
import { AskAiToolService, SEARCH_EMAILS_TOOL } from "./ask-ai-tools.service";

type Message = OpenAI.Chat.Completions.ChatCompletionMessage;

function assistant(partial: Partial<Message>): Message {
  return {
    role: "assistant",
    content: null,
    refusal: null,
    ...partial,
  } as Message;
}

const EMAIL = {
  subject: "Fwd: Update your AUD account details",
  from: "team@thecrmcarpenters.com",
  fromName: "The CRM Carpenters",
  body: "Please update your AUD account details.",
  isThread: false,
};

describe("AskAiAgentService", () => {
  let llmCore: jest.Mocked<Pick<LLMCoreService, "chatWithTools">>;
  let tools: jest.Mocked<
    Pick<AskAiToolService, "buildToolset" | "executeTool">
  >;
  let service: AskAiAgentService;

  const toolset: AskAiToolset = {
    tools: [],
    registry: new Map([[SEARCH_EMAILS_TOOL, { kind: "search_emails" }]]),
  };

  beforeEach(() => {
    llmCore = { chatWithTools: jest.fn() };
    tools = {
      buildToolset: jest.fn().mockResolvedValue(toolset),
      executeTool: jest.fn(),
    };
    service = new AskAiAgentService(
      llmCore as unknown as LLMCoreService,
      tools as unknown as AskAiToolService,
    );
  });

  it("answers directly when no tool is needed", async () => {
    llmCore.chatWithTools.mockResolvedValue(
      assistant({ content: "It asks you to update your AUD account details." }),
    );

    const result = await service.ask({
      email: EMAIL,
      question: "What does this email want?",
      history: [],
      userId: "user-1",
    });

    expect(result.answer).toContain("AUD account");
    expect(result.toolActivity).toEqual([]);
    expect(tools.executeTool).not.toHaveBeenCalled();
  });

  it("runs a tool call then summarises the result", async () => {
    llmCore.chatWithTools
      .mockResolvedValueOnce(
        assistant({
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: SEARCH_EMAILS_TOOL,
                arguments: JSON.stringify({ from: "carpenters" }),
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        assistant({ content: "Yes — 2 earlier emails from that sender." }),
      );
    tools.executeTool.mockResolvedValue({
      resultJson: JSON.stringify({ count: 2, results: [] }),
      activity: { tool: SEARCH_EMAILS_TOOL, label: "Searched your emails" },
    });

    const result = await service.ask({
      email: EMAIL,
      question: "Any other emails from this sender?",
      history: [],
      userId: "user-1",
    });

    expect(tools.executeTool).toHaveBeenCalledWith(
      "user-1",
      { kind: "search_emails" },
      { from: "carpenters" },
    );
    expect(result.answer).toContain("earlier emails");
    expect(result.toolActivity).toEqual([
      { tool: SEARCH_EMAILS_TOOL, label: "Searched your emails" },
    ]);
    // Second call should include the tool result in the message history.
    const secondCallMessages = llmCore.chatWithTools.mock.calls[1][0].messages;
    expect(secondCallMessages.some((msg) => msg.role === "tool")).toBe(true);
  });

  it("forces a final answer after exhausting the tool budget", async () => {
    // Always request a tool — the loop must still terminate.
    llmCore.chatWithTools.mockResolvedValue(
      assistant({
        content: "stopping now",
        tool_calls: [
          {
            id: "call-x",
            type: "function",
            function: { name: SEARCH_EMAILS_TOOL, arguments: "{}" },
          },
        ],
      }),
    );
    tools.executeTool.mockResolvedValue({
      resultJson: "{}",
      activity: { tool: SEARCH_EMAILS_TOOL, label: "Searched your emails" },
    });

    const result = await service.ask({
      email: EMAIL,
      question: "loop forever?",
      history: [],
      userId: "user-1",
    });

    // 4 tool rounds + 1 forced final call = 5 model calls.
    expect(llmCore.chatWithTools).toHaveBeenCalledTimes(5);
    expect(result.answer).toBe("stopping now");
  });

  it("returns a graceful message when the turn is aborted/timed out", async () => {
    const abortError = Object.assign(new Error("aborted"), {
      name: "APIUserAbortError",
    });
    llmCore.chatWithTools.mockRejectedValue(abortError);

    const result = await service.ask({
      email: EMAIL,
      question: "slow question",
      history: [],
      userId: "user-1",
    });

    expect(result.answer.toLowerCase()).toContain("time");
    expect(result.toolActivity).toEqual([]);
  });

  it("passes a per-call timeout and abort signal to the model", async () => {
    llmCore.chatWithTools.mockResolvedValue(assistant({ content: "ok" }));

    await service.ask({
      email: EMAIL,
      question: "quick",
      history: [],
      userId: "user-1",
    });

    const callArgs = llmCore.chatWithTools.mock.calls[0][0];
    expect(callArgs.timeoutMs).toBeGreaterThan(0);
    expect(callArgs.signal).toBeInstanceOf(AbortSignal);
  });
});
