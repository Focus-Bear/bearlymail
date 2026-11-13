import type OpenAI from "openai";

import { LLMCoreService } from "../llm/llm-core.service";
import {
  AskAiMcpToolDescriptor,
  AskAiPausedTurn,
  AskAiPendingToolCall,
  AskAiToolset,
} from "./ask-ai.types";
import { AskAiAgentService } from "./ask-ai-agent.service";
import { AskAiApprovalService } from "./ask-ai-approval.service";
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
  let approvals: jest.Mocked<
    Pick<AskAiApprovalService, "createPending" | "consume">
  >;
  let service: AskAiAgentService;

  const READ_ONLY_TOOL: AskAiMcpToolDescriptor = {
    kind: "mcp",
    serverId: "srv-1",
    serverName: "Google Drive",
    toolName: "search_files",
    readOnly: true,
  };
  const WRITE_TOOL: AskAiMcpToolDescriptor = {
    kind: "mcp",
    serverId: "srv-1",
    serverName: "Google Drive",
    toolName: "share_file",
    readOnly: false,
  };

  const toolset: AskAiToolset = {
    tools: [],
    registry: new Map([
      [SEARCH_EMAILS_TOOL, { kind: "search_emails" }],
      ["mcp_0_search_files", READ_ONLY_TOOL],
      ["mcp_1_share_file", WRITE_TOOL],
    ]),
  };

  const PENDING: AskAiPendingToolCall = {
    approvalId: "approval-1",
    serverName: "Google Drive",
    toolName: "share_file",
    arguments: { fileId: "f1", email: "a@b.com" },
    argumentsHash: "a".repeat(64),
    expiresAt: new Date().toISOString(),
  };

  function toolCall(id: string, name: string, args: Record<string, unknown>) {
    return {
      id,
      type: "function" as const,
      function: { name, arguments: JSON.stringify(args) },
    };
  }

  beforeEach(() => {
    llmCore = { chatWithTools: jest.fn() };
    tools = {
      buildToolset: jest.fn().mockResolvedValue(toolset),
      executeTool: jest.fn(),
    };
    approvals = {
      createPending: jest.fn().mockResolvedValue(PENDING),
      consume: jest.fn(),
    };
    service = new AskAiAgentService(
      llmCore as unknown as LLMCoreService,
      tools as unknown as AskAiToolService,
      approvals as unknown as AskAiApprovalService,
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

  describe("connected tools and approval", () => {
    const ASK = {
      email: EMAIL,
      question: "Share the deck with Sam",
      history: [],
      userId: "user-1",
    };

    it("auto-runs read-only connected tools without asking", async () => {
      llmCore.chatWithTools
        .mockResolvedValueOnce(
          assistant({
            tool_calls: [
              toolCall("call-1", "mcp_0_search_files", { query: "deck" }),
            ],
          }),
        )
        .mockResolvedValueOnce(assistant({ content: "Found the deck." }));
      tools.executeTool.mockResolvedValue({
        resultJson: "{}",
        activity: { tool: "search_files", label: "Looked in Google Drive" },
      });

      const result = await service.ask(ASK);

      expect(tools.executeTool).toHaveBeenCalledWith("user-1", READ_ONLY_TOOL, {
        query: "deck",
      });
      expect(approvals.createPending).not.toHaveBeenCalled();
      expect(result.pendingToolCall).toBeUndefined();
      expect(result.answer).toBe("Found the deck.");
    });

    it("pauses on a non-read-only tool instead of running it", async () => {
      llmCore.chatWithTools.mockResolvedValueOnce(
        assistant({
          tool_calls: [
            toolCall("call-1", "mcp_0_search_files", { query: "deck" }),
            toolCall("call-2", "mcp_1_share_file", {
              fileId: "f1",
              email: "a@b.com",
            }),
          ],
        }),
      );
      tools.executeTool.mockResolvedValue({
        resultJson: "{}",
        activity: { tool: "search_files", label: "Looked in Google Drive" },
      });

      const result = await service.ask(ASK);

      // The read-only call ran; the share call did not.
      expect(tools.executeTool).toHaveBeenCalledTimes(1);
      expect(tools.executeTool).not.toHaveBeenCalledWith(
        expect.anything(),
        WRITE_TOOL,
        expect.anything(),
      );
      expect(llmCore.chatWithTools).toHaveBeenCalledTimes(1);
      expect(result.pendingToolCall).toEqual(PENDING);
      expect(result.answer).toBe("");

      const [userId, paused] = approvals.createPending.mock.calls[0];
      expect(userId).toBe("user-1");
      expect(paused.awaiting).toEqual({
        toolCallId: "call-2",
        descriptor: WRITE_TOOL,
        args: { fileId: "f1", email: "a@b.com" },
      });
      expect(paused.round).toBe(1);
      expect(paused.queuedCalls).toEqual([]);
    });

    function pausedTurn(): AskAiPausedTurn {
      return {
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "Share the deck with Sam" },
          {
            role: "assistant",
            content: "",
            tool_calls: [
              toolCall("call-2", "mcp_1_share_file", { fileId: "f1" }),
            ],
          },
        ],
        activity: [],
        round: 1,
        queuedCalls: [],
        awaiting: {
          toolCallId: "call-2",
          descriptor: WRITE_TOOL,
          args: { fileId: "f1" },
        },
      };
    }

    it("runs exactly the stored call on approval and resumes the loop", async () => {
      tools.executeTool.mockResolvedValue({
        resultJson: '{"ok":true}',
        activity: {
          tool: "share_file",
          label: "Used share_file on Google Drive",
        },
      });
      llmCore.chatWithTools.mockResolvedValueOnce(
        assistant({ content: "Shared it with Sam." }),
      );
      const onEvent = jest.fn();

      const result = await service.resume(
        {
          userId: "user-1",
          approvalId: "approval-1",
          argumentsHash: "a".repeat(64),
          approved: true,
        },
        pausedTurn(),
        { onEvent },
      );

      expect(tools.executeTool).toHaveBeenCalledWith("user-1", WRITE_TOOL, {
        fileId: "f1",
      });
      // The messages array is shared (and later mutated), so find the result.
      const { messages } = llmCore.chatWithTools.mock.calls[0][0];
      expect(messages.find((msg) => msg.role === "tool")).toEqual({
        role: "tool",
        tool_call_id: "call-2",
        content: '{"ok":true}',
      });
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "tool" }),
      );
      expect(result.answer).toBe("Shared it with Sam.");
    });

    it("tells the model the user declined and never runs the tool", async () => {
      llmCore.chatWithTools.mockResolvedValueOnce(
        assistant({ content: "Okay, I didn't share it." }),
      );

      const result = await service.resume(
        {
          userId: "user-1",
          approvalId: "approval-1",
          argumentsHash: "a".repeat(64),
          approved: false,
        },
        pausedTurn(),
      );

      expect(tools.executeTool).not.toHaveBeenCalled();
      const { messages } = llmCore.chatWithTools.mock.calls[0][0];
      const last = messages.find((msg) => msg.role === "tool") as {
        role: string;
        tool_call_id: string;
        content: string;
      };
      expect(last.role).toBe("tool");
      expect(last.tool_call_id).toBe("call-2");
      expect(last.content).toContain("declined");
      expect(result.toolActivity[0].label).toContain("declined");
      expect(result.answer).toBe("Okay, I didn't share it.");
    });

    it("claims approvals through the approval service", async () => {
      approvals.consume.mockResolvedValue(pausedTurn());
      const decision = {
        userId: "user-1",
        approvalId: "approval-1",
        argumentsHash: "a".repeat(64),
        approved: true,
      };

      await expect(service.claimApproval(decision)).resolves.toEqual(
        pausedTurn(),
      );
      expect(approvals.consume).toHaveBeenCalledWith(decision);
    });
  });
});
