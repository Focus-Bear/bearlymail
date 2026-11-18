import axios, { AxiosResponse } from "axios";

import { safeAxiosConfig } from "../common/safe-http/safe-http";
import { assertSafeOutboundUrl } from "../common/url-validation.utils";
import { SAFE_HTTP } from "../constants/safe-http.constants";

const REQUEST_TIMEOUT_MS = 30_000;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FIRST_ERROR = 400;
const HTTP_STATUS_FIRST_REDIRECT = 300;

/** Public addresses only, redirects never followed, bounded response size. */
const requestConfig = () =>
  safeAxiosConfig({
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxResponseBytes: SAFE_HTTP.MCP_MAX_RESPONSE_BYTES,
  });
const JSON_RPC_VERSION = "2.0";
/** Newest MCP revision we speak; the server may negotiate an older one. */
const CLIENT_PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "BearlyMail", version: "1.0.0" };

const HEADERS = {
  ACCEPT: "Accept",
  CONTENT_TYPE: "Content-Type",
  SESSION_ID: "Mcp-Session-Id",
  PROTOCOL_VERSION: "MCP-Protocol-Version",
  WWW_AUTHENTICATE: "www-authenticate",
} as const;

/** Streamable HTTP servers reject POSTs that don't accept both (406). */
const ACCEPT_JSON_AND_SSE = "application/json, text/event-stream";
const EVENT_STREAM_CONTENT_TYPE = "text/event-stream";
const SSE_DATA_PREFIX = "data:";

const METHODS = {
  INITIALIZE: "initialize",
  INITIALIZED: "notifications/initialized",
} as const;

/** RFC 9728 parameter an MCP server puts in its 401 challenge when it supports OAuth. */
const RESOURCE_METADATA_CHALLENGE_PARAM = "resource_metadata";

interface JsonRpcError {
  code: number;
  message: string;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | string | null;
  result?: Record<string, unknown>;
  error?: JsonRpcError;
}

interface MCPSession {
  sessionId: string | null;
  protocolVersion: string;
}

/**
 * Thrown when the MCP server rejects the request with 401. `supportsOAuth` is
 * true when the challenge advertises RFC 9728 protected-resource metadata, i.e.
 * the user can fix it by signing in through the MCP OAuth flow.
 */
export class MCPAuthorizationRequiredError extends Error {
  constructor(readonly supportsOAuth: boolean) {
    super(
      supportsOAuth
        ? "MCP server requires sign-in (OAuth authorization)"
        : "MCP server rejected the credentials (401 Unauthorized)",
    );
    this.name = MCPAuthorizationRequiredError.name;
  }
}

/** Thrown when the MCP server answers with a JSON-RPC error object. */
export class MCPJsonRpcError extends Error {
  constructor(readonly rpcError: JsonRpcError) {
    super(`MCP error ${rpcError.code}: ${rpcError.message}`);
    this.name = MCPJsonRpcError.name;
  }
}

/**
 * Minimal MCP Streamable HTTP client (spec 2025-03-26+): performs the
 * `initialize` handshake, carries the session id, accepts both JSON and SSE
 * responses, and runs exactly one request per session.
 *
 * Servers such as Zoho MCP refuse `tools/list` without a prior `initialize`,
 * so every call goes through {@link MCPStreamableHttpClient.request}.
 */
export class MCPStreamableHttpClient {
  private nextRequestId = 1;

  constructor(
    private readonly serverUrl: string,
    private readonly authHeaders: Record<string, string>,
  ) {
    // Guard against SSRF: only allow https:// and reject private/loopback hosts.
    assertSafeOutboundUrl(serverUrl, "MCP server URL");
  }

  /** Open a session, run one JSON-RPC request, and close the session. */
  async request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const session = await this.initializeIfSupported();
    try {
      const response = await this.send(
        this.buildRequest(method, params),
        session,
      );
      return this.unwrapResult(response);
    } finally {
      if (session) await this.closeSession(session);
    }
  }

  /**
   * Older plain JSON-RPC MCP endpoints don't implement `initialize`; they
   * answer it with a JSON-RPC error, and we fall back to sessionless calls.
   */
  private async initializeIfSupported(): Promise<MCPSession | null> {
    try {
      return await this.initialize();
    } catch (err) {
      if (err instanceof MCPJsonRpcError) return null;
      throw err;
    }
  }

  private async initialize(): Promise<MCPSession> {
    const response = await this.send(
      this.buildRequest(METHODS.INITIALIZE, {
        protocolVersion: CLIENT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      }),
      null,
    );
    const result = this.unwrapResult(response);
    const negotiatedVersion =
      typeof result.protocolVersion === "string"
        ? result.protocolVersion
        : CLIENT_PROTOCOL_VERSION;
    const session: MCPSession = {
      sessionId: this.readSessionId(response),
      protocolVersion: negotiatedVersion,
    };
    await this.send(
      { jsonrpc: JSON_RPC_VERSION, method: METHODS.INITIALIZED },
      session,
    );
    return session;
  }

  /** Spec: clients SHOULD DELETE a session they no longer need. Best-effort. */
  private async closeSession(session: MCPSession): Promise<void> {
    if (!session.sessionId) return;
    try {
      await axios.delete(this.serverUrl, {
        ...requestConfig(),
        headers: this.buildHeaders(session),
      });
    } catch {
      // Servers may answer 405 when they don't allow client-terminated sessions.
    }
  }

  private buildRequest(
    method: string,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      jsonrpc: JSON_RPC_VERSION,
      id: this.nextRequestId++,
      method,
      params,
    };
  }

  private buildHeaders(session: MCPSession | null): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.authHeaders,
      [HEADERS.CONTENT_TYPE]: "application/json",
      [HEADERS.ACCEPT]: ACCEPT_JSON_AND_SSE,
    };
    if (session?.sessionId) headers[HEADERS.SESSION_ID] = session.sessionId;
    if (session) headers[HEADERS.PROTOCOL_VERSION] = session.protocolVersion;
    return headers;
  }

  private async send(
    body: Record<string, unknown>,
    session: MCPSession | null,
  ): Promise<AxiosResponse<string>> {
    const response = await axios.post<string>(this.serverUrl, body, {
      ...requestConfig(),
      headers: this.buildHeaders(session),
      responseType: "text",
      // Keep the raw body: it may be an SSE stream rather than JSON.
      transformResponse: (raw: string) => raw,
      validateStatus: () => true,
    });
    if (
      response.status >= HTTP_STATUS_FIRST_REDIRECT &&
      response.status < HTTP_STATUS_FIRST_ERROR
    ) {
      throw new Error(
        `MCP server responded with a redirect (HTTP ${response.status}), which is not followed`,
      );
    }
    if (response.status === HTTP_STATUS_UNAUTHORIZED) {
      throw new MCPAuthorizationRequiredError(
        this.challengeAdvertisesOAuth(response),
      );
    }
    if (response.status >= HTTP_STATUS_FIRST_ERROR) {
      throw new Error(`MCP server responded with HTTP ${response.status}`);
    }
    return response;
  }

  private challengeAdvertisesOAuth(response: AxiosResponse<string>): boolean {
    const challenge = response.headers[HEADERS.WWW_AUTHENTICATE];
    return (
      typeof challenge === "string" &&
      challenge.includes(RESOURCE_METADATA_CHALLENGE_PARAM)
    );
  }

  private readSessionId(response: AxiosResponse<string>): string | null {
    const value = response.headers[HEADERS.SESSION_ID.toLowerCase()];
    return typeof value === "string" && value ? value : null;
  }

  private unwrapResult(
    response: AxiosResponse<string>,
  ): Record<string, unknown> {
    const message = this.parseMessage(response);
    if (message.error) throw new MCPJsonRpcError(message.error);
    if (!message.result) throw new Error("MCP server returned no result");
    return message.result;
  }

  private parseMessage(response: AxiosResponse<string>): JsonRpcResponse {
    const contentType = String(response.headers["content-type"] ?? "");
    const raw = response.data ?? "";
    if (!contentType.includes(EVENT_STREAM_CONTENT_TYPE)) {
      return JSON.parse(raw) as JsonRpcResponse;
    }
    const message = parseSseMessages(raw).find(
      (candidate) => candidate.result !== undefined || candidate.error,
    );
    if (!message) throw new Error("MCP server SSE stream had no response");
    return message;
  }
}

/**
 * Extract the JSON-RPC messages from an SSE body. Events are separated by a
 * blank line; an event's `data:` lines are joined with newlines (SSE spec).
 */
export function parseSseMessages(body: string): JsonRpcResponse[] {
  return body
    .split(/\r?\n\r?\n/)
    .map((event) =>
      event
        .split(/\r?\n/)
        .filter((line) => line.startsWith(SSE_DATA_PREFIX))
        .map((line) => line.slice(SSE_DATA_PREFIX.length).trimStart())
        .join("\n"),
    )
    .filter((eventPayload) => eventPayload.length > 0)
    .flatMap((eventPayload) => {
      try {
        return [JSON.parse(eventPayload) as JsonRpcResponse];
      } catch {
        return [];
      }
    });
}
