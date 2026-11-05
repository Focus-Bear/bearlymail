import { MILLISECONDS } from "./time-constants";

/**
 * BearlyMail's own MCP server (`POST /mcp`), which lets Claude and other MCP
 * clients read and send the user's mail. Not to be confused with `src/mcp/`,
 * the MCP *client* BearlyMail uses to call other servers from workflows.
 */
export const MCP_SERVER = {
  ROUTE: "mcp",
  SERVER_NAME: "bearlymail",
  SERVER_TITLE: "BearlyMail",
  SERVER_VERSION: "1.0.0",
  /** Newest first; the first entry is offered when the client's is unknown. */
  SUPPORTED_PROTOCOL_VERSIONS: ["2025-06-18", "2025-03-26", "2024-11-05"],
  JSONRPC_VERSION: "2.0",
  /** Requests per user per window, across all MCP methods and tokens. */
  RATE_LIMIT: 120,
  RATE_WINDOW_MS: MILLISECONDS.MINUTE,
  /** Hard cap on messages sent through MCP per user per hour. */
  SEND_LIMIT_PER_HOUR: 30,
  SEND_LIMIT_WINDOW_MS: MILLISECONDS.HOUR,
  /** Advisory lock name; holds one user's MCP sends to one at a time. */
  SEND_LOCK_PREFIX: "mcp-send:",
  DEFAULT_LIST_LIMIT: 20,
  MAX_LIST_LIMIT: 50,
  MAX_THREAD_EMAILS: 20,
  /** Per-message body cap in get_thread, to keep tool results a sane size. */
  MAX_BODY_CHARS: 6000,
  MAX_FOLLOW_UP_DAYS: 90,
  MAX_RECIPIENTS: 50,
  MAX_SUBJECT_LENGTH: 998,
  MAX_SEND_BODY_LENGTH: 100_000,
  AUDIT_ACTIONS: {
    SEND_REPLY: "MCP_SEND_REPLY",
    SEND_EMAIL: "MCP_SEND_EMAIL",
  },
  AUDIT_TARGET_TYPE: "email_send_attempt",
} as const;

export const MCP_TOOL_NAMES = {
  LIST_IMPORTANT_EMAILS: "list_important_emails",
  GET_THREAD: "get_thread",
  SEARCH_EMAILS: "search_emails",
  LIST_FOLLOW_UPS: "list_follow_ups",
  SEND_REPLY: "send_reply",
  SEND_EMAIL: "send_email",
} as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[keyof typeof MCP_TOOL_NAMES];

export const MCP_METHODS = {
  INITIALIZE: "initialize",
  PING: "ping",
  TOOLS_LIST: "tools/list",
  TOOLS_CALL: "tools/call",
} as const;

/** Standard JSON-RPC 2.0 error codes. */
export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/** Inbox modes the MCP tools expose (the web app also has "blocked"). */
export const MCP_INBOX_MODES = ["triage", "action", "follow-up"] as const;
export type McpInboxMode = (typeof MCP_INBOX_MODES)[number];
