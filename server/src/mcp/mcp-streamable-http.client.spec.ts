import axios from "axios";

import {
  MCPAuthorizationRequiredError,
  MCPJsonRpcError,
  MCPStreamableHttpClient,
  parseSseMessages,
} from "./mcp-streamable-http.client";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

const SERVER_URL = "https://acme.zohomcp.com/mcp/secret-key/message";
const SESSION_ID = "session-123";
const TOOLS = [{ name: "search_contacts" }];

interface FakeResponse {
  status: number;
  data: string;
  headers: Record<string, string>;
}

const jsonResponse = (
  body: unknown,
  headers: Record<string, string> = {},
): FakeResponse => ({
  status: 200,
  data: JSON.stringify(body),
  headers: { "content-type": "application/json", ...headers },
});

const sseResponse = (body: unknown): FakeResponse => ({
  status: 200,
  data: `event: message\ndata: ${JSON.stringify(body)}\n\n`,
  headers: { "content-type": "text/event-stream" },
});

const ACCEPTED: FakeResponse = { status: 202, data: "", headers: {} };

const initializeResult = (id = 1) => ({
  jsonrpc: "2.0",
  id,
  result: { protocolVersion: "2025-03-26", capabilities: {} },
});

describe("MCPStreamableHttpClient", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedAxios.delete.mockResolvedValue({ status: 200 });
  });

  it("initializes a session, then calls the method with the session headers", async () => {
    mockedAxios.post
      .mockResolvedValueOnce(
        jsonResponse(initializeResult(), { "mcp-session-id": SESSION_ID }),
      )
      .mockResolvedValueOnce(ACCEPTED)
      .mockResolvedValueOnce(
        sseResponse({ jsonrpc: "2.0", id: 2, result: { tools: TOOLS } }),
      );

    const client = new MCPStreamableHttpClient(SERVER_URL, {
      Authorization: "Bearer token",
    });
    const result = await client.request("tools/list", {});

    expect(result).toEqual({ tools: TOOLS });
    const [initCall, notifyCall, listCall] = mockedAxios.post.mock.calls;
    expect(initCall[1]).toMatchObject({ method: "initialize" });
    expect(initCall[2]?.headers).toMatchObject({
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer token",
    });
    expect(notifyCall[1]).toMatchObject({
      method: "notifications/initialized",
    });
    expect(listCall[1]).toMatchObject({ method: "tools/list" });
    expect(listCall[2]?.headers).toMatchObject({
      "Mcp-Session-Id": SESSION_ID,
      "MCP-Protocol-Version": "2025-03-26",
    });
    expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
  });

  it("flags a 401 with an RFC 9728 challenge as OAuth-capable", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      status: 401,
      data: "Authentication required",
      headers: {
        "www-authenticate":
          'Bearer resource_metadata="https://acme.zohomcp.com/.well-known/oauth-protected-resource"',
      },
    });

    const client = new MCPStreamableHttpClient(SERVER_URL, {});
    const error = await client.request("tools/list", {}).catch((err) => err);

    expect(error).toBeInstanceOf(MCPAuthorizationRequiredError);
    expect((error as MCPAuthorizationRequiredError).supportsOAuth).toBe(true);
  });

  it("treats a bare 401 as bad credentials, not an OAuth prompt", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      status: 401,
      data: "",
      headers: { "www-authenticate": 'Bearer realm="api"' },
    });

    const client = new MCPStreamableHttpClient(SERVER_URL, {});
    const error = await client.request("tools/list", {}).catch((err) => err);

    expect((error as MCPAuthorizationRequiredError).supportsOAuth).toBe(false);
  });

  it("falls back to a sessionless call when the server doesn't implement initialize", async () => {
    mockedAxios.post
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32601, message: "Method not found" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ jsonrpc: "2.0", id: 2, result: { tools: TOOLS } }),
      );

    const client = new MCPStreamableHttpClient(SERVER_URL, {});
    const result = await client.request("tools/list", {});

    expect(result).toEqual({ tools: TOOLS });
    expect(mockedAxios.post.mock.calls[1][2]?.headers).not.toHaveProperty(
      "Mcp-Session-Id",
    );
    expect(mockedAxios.delete).not.toHaveBeenCalled();
  });

  it("surfaces JSON-RPC errors from the actual call", async () => {
    mockedAxios.post
      .mockResolvedValueOnce(jsonResponse(initializeResult()))
      .mockResolvedValueOnce(ACCEPTED)
      .mockResolvedValueOnce(
        jsonResponse({
          jsonrpc: "2.0",
          id: 2,
          error: { code: -32602, message: "Unknown tool" },
        }),
      );

    const client = new MCPStreamableHttpClient(SERVER_URL, {});

    await expect(client.request("tools/call", {})).rejects.toBeInstanceOf(
      MCPJsonRpcError,
    );
  });

  it("rejects private hosts before sending anything", () => {
    expect(
      () => new MCPStreamableHttpClient("https://127.0.0.1/mcp", {}),
    ).toThrow("private/internal hosts");
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});

describe("parseSseMessages", () => {
  it("joins multi-line data and skips non-JSON events", () => {
    const body = [
      ": keep-alive",
      "",
      "event: message",
      'data: {"jsonrpc":"2.0",',
      'data: "id":2,"result":{}}',
      "",
      "data: not-json",
      "",
    ].join("\n");

    expect(parseSseMessages(body)).toEqual([
      { jsonrpc: "2.0", id: 2, result: {} },
    ]);
  });
});
