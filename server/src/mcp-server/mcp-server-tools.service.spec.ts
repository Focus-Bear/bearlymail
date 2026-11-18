import { MCP_TOOL_NAMES } from "../constants/mcp-server.constants";
import {
  ALL_PAT_SCOPES,
  PAT_SCOPES,
  PatScope,
} from "../constants/personal-access-tokens.constants";
import { McpDraftToolsService } from "./mcp-draft-tools.service";
import { McpReadToolsService } from "./mcp-read-tools.service";
import { McpSendToolsService } from "./mcp-send-tools.service";
import { JsonRpcError, McpCallContext } from "./mcp-server.types";
import { McpServerToolsService } from "./mcp-server-tools.service";
import { McpToolInputError } from "./mcp-tool-args";

function contextWith(scopes: PatScope[]): McpCallContext {
  return {
    principal: { userId: "user-1", tokenId: "token-1", scopes },
    ipAddress: null,
    userAgent: null,
  };
}

describe("McpServerToolsService", () => {
  let readTools: jest.Mocked<McpReadToolsService>;
  let sendTools: jest.Mocked<McpSendToolsService>;
  let draftTools: jest.Mocked<McpDraftToolsService>;
  let service: McpServerToolsService;

  beforeEach(() => {
    readTools = {
      listImportantEmails: jest.fn().mockResolvedValue({ emails: [] }),
      getThread: jest.fn(),
      searchEmails: jest.fn().mockResolvedValue('{"count":0}'),
      listFollowUps: jest.fn(),
    } as unknown as jest.Mocked<McpReadToolsService>;
    sendTools = {
      sendReply: jest.fn().mockResolvedValue({ status: "queued" }),
      sendEmail: jest.fn(),
    } as unknown as jest.Mocked<McpSendToolsService>;
    draftTools = {
      createDraft: jest.fn().mockResolvedValue({ draftId: "draft-1" }),
      updateDraft: jest.fn(),
      listDrafts: jest.fn().mockResolvedValue({ drafts: [] }),
      deleteDraft: jest.fn(),
    } as unknown as jest.Mocked<McpDraftToolsService>;
    service = new McpServerToolsService(readTools, sendTools, draftTools);
  });

  it("hides send tools from a read-only token", () => {
    const names = service
      .listTools([PAT_SCOPES.MAIL_READ])
      .map((tool) => tool.name);
    expect(names).toContain(MCP_TOOL_NAMES.GET_THREAD);
    expect(names).not.toContain(MCP_TOOL_NAMES.SEND_REPLY);
    expect(names).not.toContain(MCP_TOOL_NAMES.SEND_EMAIL);
    expect(names).not.toContain(MCP_TOOL_NAMES.CREATE_DRAFT);
    expect(names).toContain(MCP_TOOL_NAMES.LIST_DRAFTS);
  });

  it("lets a draft-only token draft but not send", () => {
    const names = service
      .listTools([PAT_SCOPES.MAIL_READ, PAT_SCOPES.MAIL_DRAFT])
      .map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        MCP_TOOL_NAMES.CREATE_DRAFT,
        MCP_TOOL_NAMES.UPDATE_DRAFT,
        MCP_TOOL_NAMES.LIST_DRAFTS,
        MCP_TOOL_NAMES.DELETE_DRAFT,
      ]),
    );
    expect(names).not.toContain(MCP_TOOL_NAMES.SEND_REPLY);
    expect(names).not.toContain(MCP_TOOL_NAMES.SEND_EMAIL);
  });

  it("lets a token that can send also draft, so existing connections keep working", async () => {
    const result = await service.callTool(
      contextWith([PAT_SCOPES.MAIL_READ, PAT_SCOPES.MAIL_SEND]),
      MCP_TOOL_NAMES.CREATE_DRAFT,
      { to: ["a@example.com"], subject: "Hi", body: "Hello" },
    );
    expect(result.isError).toBeUndefined();
    expect(draftTools.createDraft).toHaveBeenCalledWith("user-1", {
      to: ["a@example.com"],
      subject: "Hi",
      body: "Hello",
    });
  });

  it("refuses to draft for a read-only token, naming both permissions that would allow it", async () => {
    const result = await service.callTool(
      contextWith([PAT_SCOPES.MAIL_READ]),
      MCP_TOOL_NAMES.CREATE_DRAFT,
      { body: "Hello" },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(PAT_SCOPES.MAIL_DRAFT);
    expect(result.content[0].text).toContain(PAT_SCOPES.MAIL_SEND);
    expect(draftTools.createDraft).not.toHaveBeenCalled();
  });

  it("marks draft tools as neither read-only nor reaching anyone else", () => {
    const createDraft = service
      .listTools(ALL_PAT_SCOPES)
      .find((tool) => tool.name === MCP_TOOL_NAMES.CREATE_DRAFT);
    expect(createDraft?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
  });

  it("marks send tools destructive and read tools read-only", () => {
    const tools = service.listTools(ALL_PAT_SCOPES);
    const sendReply = tools.find(
      (tool) => tool.name === MCP_TOOL_NAMES.SEND_REPLY,
    );
    const getThread = tools.find(
      (tool) => tool.name === MCP_TOOL_NAMES.GET_THREAD,
    );
    expect(sendReply?.annotations).toMatchObject({
      destructiveHint: true,
      readOnlyHint: false,
    });
    expect(getThread?.annotations).toMatchObject({ readOnlyHint: true });
    expect(tools.every((tool) => !("allowedScopes" in tool))).toBe(true);
  });

  it("refuses a call the token's scopes don't cover, without running it", async () => {
    const result = await service.callTool(
      contextWith([PAT_SCOPES.MAIL_READ]),
      MCP_TOOL_NAMES.SEND_REPLY,
      { emailId: "x", body: "hi" },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(PAT_SCOPES.MAIL_SEND);
    expect(sendTools.sendReply).not.toHaveBeenCalled();
  });

  it("returns handler output as JSON text", async () => {
    const result = await service.callTool(
      contextWith([PAT_SCOPES.MAIL_READ]),
      MCP_TOOL_NAMES.LIST_IMPORTANT_EMAILS,
      {},
    );
    expect(result).toEqual({
      content: [{ type: "text", text: '{"emails":[]}' }],
    });
    expect(readTools.listImportantEmails).toHaveBeenCalledWith("user-1", {});
  });

  it("passes string output through unchanged", async () => {
    const result = await service.callTool(
      contextWith([PAT_SCOPES.MAIL_READ]),
      MCP_TOOL_NAMES.SEARCH_EMAILS,
      { query: "invoice" },
    );
    expect(result.content[0].text).toBe('{"count":0}');
  });

  it("reports bad arguments as a readable tool error", async () => {
    readTools.getThread.mockRejectedValue(
      new McpToolInputError("No email found with id x"),
    );
    const result = await service.callTool(
      contextWith([PAT_SCOPES.MAIL_READ]),
      MCP_TOOL_NAMES.GET_THREAD,
      { emailId: "x" },
    );
    expect(result).toEqual({
      content: [{ type: "text", text: "No email found with id x" }],
      isError: true,
    });
  });

  it("masks unexpected failures", async () => {
    readTools.getThread.mockRejectedValue(
      new Error("connection refused 10.0.0.5"),
    );
    const result = await service.callTool(
      contextWith([PAT_SCOPES.MAIL_READ]),
      MCP_TOOL_NAMES.GET_THREAD,
      { emailId: "x" },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain("10.0.0.5");
  });

  it("treats an unknown tool as a protocol error", async () => {
    await expect(
      service.callTool(
        contextWith(ALL_PAT_SCOPES.slice()),
        "delete_everything",
        {},
      ),
    ).rejects.toBeInstanceOf(JsonRpcError);
  });
});
