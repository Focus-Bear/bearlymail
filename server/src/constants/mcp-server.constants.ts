import { BYTE_CONVERSIONS } from "./service-constants";
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
  /**
   * Most JSON-RPC messages one POST may batch. Each still counts against
   * RATE_LIMIT; without a cap, one request could run hundreds of tool calls.
   */
  MAX_BATCH_MESSAGES: 10,
  /** Hard cap on messages sent through MCP per user per hour. */
  SEND_LIMIT_PER_HOUR: 30,
  SEND_LIMIT_WINDOW_MS: MILLISECONDS.HOUR,
  /** Most addresses one message may have across to, cc and bcc together. */
  MAX_RECIPIENTS_PER_MESSAGE: 50,
  /** Hard cap on addresses mailed through MCP per user per hour. */
  SEND_RECIPIENTS_PER_HOUR: 150,
  /** Failed authentications per client address before /mcp answers 429. */
  AUTH_FAILURE_LIMIT: 30,
  AUTH_FAILURE_WINDOW_MS: MILLISECONDS.MINUTE,
  /** Most client addresses tracked for failed authentication at once. */
  AUTH_FAILURE_MAX_TRACKED: 10_000,
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
  /**
   * JSON body cap for `POST /mcp`, above the app-wide 100kb default because
   * draft attachments arrive base64-encoded (4/3 of their size) in the call.
   */
  MAX_REQUEST_BODY: "15mb",
} as const;

const MAX_DRAFT_ATTACHMENT_TOTAL_MB = 10;

/** Limits and links for the draft tools (create/update/list/delete_draft). */
export const MCP_DRAFTS = {
  MAX_ATTACHMENTS: 10,
  /** Decoded size of all of a draft's attachments together. */
  MAX_ATTACHMENT_TOTAL_MB: MAX_DRAFT_ATTACHMENT_TOTAL_MB,
  MAX_ATTACHMENT_TOTAL_BYTES:
    MAX_DRAFT_ATTACHMENT_TOTAL_MB * BYTE_CONVERSIONS.MB,
  MAX_FILENAME_LENGTH: 255,
  MAX_MIME_TYPE_LENGTH: 255,
  MAX_LIST_LIMIT: 50,
  /** Web-app routes a draft opens in; must match the client's routes. */
  COMPOSE_PATH: "/compose",
  COMPOSE_DRAFT_PARAM: "draftId",
  EMAIL_DETAIL_PATH: "/email",
} as const;

/** Limits and audit names for the category/rule settings tools. */
export const MCP_SETTINGS = {
  /** Most rules one bulk call (delete_rules, set_rules_enabled) may touch. */
  MAX_RULE_IDS_PER_CALL: 50,
  /** Hard cap on category/rule changes through MCP per user per hour. */
  WRITE_LIMIT_PER_HOUR: 60,
  WRITE_LIMIT_WINDOW_MS: MILLISECONDS.HOUR,
  MAX_CATEGORY_DESCRIPTION_LENGTH: 1000,
  /**
   * Categories are stored as "Name - Description", so a name containing this
   * separator would be split into a shorter name plus a description.
   */
  CATEGORY_VALUE_SEPARATOR: " - ",
  AUDIT_ACTIONS: {
    CATEGORY_CREATED: "MCP_CATEGORY_CREATED",
    CATEGORY_UPDATED: "MCP_CATEGORY_UPDATED",
    CATEGORY_DELETED: "MCP_CATEGORY_DELETED",
    RULE_CREATED: "MCP_RULE_CREATED",
    RULE_UPDATED: "MCP_RULE_UPDATED",
    RULES_ENABLED_CHANGED: "MCP_RULES_ENABLED_CHANGED",
    RULES_DELETED: "MCP_RULES_DELETED",
  },
  AUDIT_TARGET_TYPES: {
    CATEGORY: "email_category",
    RULE: "category_rule",
  },
} as const;

export type McpSettingsAuditAction =
  (typeof MCP_SETTINGS.AUDIT_ACTIONS)[keyof typeof MCP_SETTINGS.AUDIT_ACTIONS];

export type McpSettingsAuditTargetType =
  (typeof MCP_SETTINGS.AUDIT_TARGET_TYPES)[keyof typeof MCP_SETTINGS.AUDIT_TARGET_TYPES];

export const MCP_TOOL_NAMES = {
  LIST_IMPORTANT_EMAILS: "list_important_emails",
  GET_THREAD: "get_thread",
  SEARCH_EMAILS: "search_emails",
  LIST_FOLLOW_UPS: "list_follow_ups",
  SEND_REPLY: "send_reply",
  SEND_EMAIL: "send_email",
  CREATE_DRAFT: "create_draft",
  UPDATE_DRAFT: "update_draft",
  LIST_DRAFTS: "list_drafts",
  DELETE_DRAFT: "delete_draft",
  LIST_CATEGORIES: "list_categories",
  GET_CATEGORY: "get_category",
  CREATE_CATEGORY: "create_category",
  UPDATE_CATEGORY: "update_category",
  DELETE_CATEGORY: "delete_category",
  LIST_RULES: "list_rules",
  GET_RULE: "get_rule",
  CREATE_RULE: "create_rule",
  UPDATE_RULE: "update_rule",
  SET_RULES_ENABLED: "set_rules_enabled",
  DELETE_RULES: "delete_rules",
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
