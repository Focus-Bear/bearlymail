import {
  JSON_RPC_ERROR_CODES,
  MCP_SERVER,
} from "../constants/mcp-server.constants";
import { PAT_SCOPES } from "../constants/personal-access-tokens.constants";
import { JsonRpcError, McpCallContext } from "./mcp-server.types";
import {
  McpServerProtocolService,
  negotiateProtocolVersion,
} from "./mcp-server-protocol.service";
import { McpServerToolsService } from "./mcp-server-tools.service";

const CONTEXT: McpCallContext = {
  principal: {
    userId: "user-1",
    tokenId: "token-1",
    scopes: [PAT_SCOPES.MAIL_READ],
  },
  ipAddress: null,
  userAgent: null,
};

describe("McpServerProtocolService", () => {
  let listTools: jest.Mock;
  let callTool: jest.Mock;
  let service: McpServerProtocolService;

  beforeEach(() => {
    listTools = jest.fn().mockReturnValue([{ name: "get_thread" }]);
    callTool = jest
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    service = new McpServerProtocolService({
      listTools,
      callTool,
    } as unknown as McpServerToolsService);
  });

  it("answers initialize with the client's protocol version when supported", async () => {
    const response = await service.handle(CONTEXT, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {} },
    });
    expect(response).toMatchObject({
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: MCP_SERVER.SERVER_NAME },
      },
    });
  });

  it("offers its newest protocol version when the client's is unknown", () => {
    expect(negotiateProtocolVersion("1999-01-01")).toBe(
      MCP_SERVER.SUPPORTED_PROTOCOL_VERSIONS[0],
    );
  });

  it("returns null (HTTP 202) for a notification", async () => {
    await expect(
      service.handle(CONTEXT, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    ).resolves.toBeNull();
  });

  it("lists tools for the token's scopes", async () => {
    const response = await service.handle(CONTEXT, {
      jsonrpc: "2.0",
      id: "a",
      method: "tools/list",
    });
    expect(listTools).toHaveBeenCalledWith([PAT_SCOPES.MAIL_READ]);
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: "a",
      result: { tools: [{ name: "get_thread" }] },
    });
  });

  it("passes tool name and arguments through to tools/call", async () => {
    await service.handle(CONTEXT, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "get_thread", arguments: { emailId: "x" } },
    });
    expect(callTool).toHaveBeenCalledWith(CONTEXT, "get_thread", {
      emailId: "x",
    });
  });

  it("rejects non-object tool arguments", async () => {
    const response = await service.handle(CONTEXT, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_thread", arguments: ["x"] },
    });
    expect(response).toMatchObject({
      error: { code: JSON_RPC_ERROR_CODES.INVALID_PARAMS },
    });
    expect(callTool).not.toHaveBeenCalled();
  });

  it("maps a JsonRpcError from a tool to a JSON-RPC error", async () => {
    callTool.mockRejectedValue(
      new JsonRpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, "Unknown tool: x"),
    );
    const response = await service.handle(CONTEXT, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "x" },
    });
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 4,
      error: {
        code: JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        message: "Unknown tool: x",
      },
    });
  });

  it("hides unexpected failures behind a generic internal error", async () => {
    callTool.mockRejectedValue(new Error("database password is hunter2"));
    const response = await service.handle(CONTEXT, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "get_thread" },
    });
    expect(response).toMatchObject({
      error: {
        code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message: "Internal error",
      },
    });
  });

  it("reports unknown methods", async () => {
    const response = await service.handle(CONTEXT, {
      jsonrpc: "2.0",
      id: 6,
      method: "resources/list",
    });
    expect(response).toMatchObject({
      error: { code: JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND },
    });
  });

  it("rejects malformed messages", async () => {
    await expect(service.handle(CONTEXT, "hello")).resolves.toMatchObject({
      id: null,
      error: { code: JSON_RPC_ERROR_CODES.INVALID_REQUEST },
    });
    await expect(
      service.handle(CONTEXT, { jsonrpc: "1.0", id: 1, method: "ping" }),
    ).resolves.toMatchObject({
      id: 1,
      error: { code: JSON_RPC_ERROR_CODES.INVALID_REQUEST },
    });
  });

  it("answers a batch, skipping notifications", async () => {
    const response = await service.handle(CONTEXT, [
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 7, method: "ping" },
    ]);
    expect(response).toEqual([{ jsonrpc: "2.0", id: 7, result: {} }]);
  });
});
