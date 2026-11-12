import { PatPrincipal } from "../personal-access-tokens/personal-access-tokens.service";

/** Who is calling and from where, threaded through to tool handlers for auditing. */
export interface McpCallContext {
  principal: PatPrincipal;
  ipAddress: string | null;
  userAgent: string | null;
}

export type JsonRpcId = string | number;

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: { code: number; message: string };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export interface McpCallToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** A protocol-level failure, reported as a JSON-RPC error rather than a tool error. */
export class JsonRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}
