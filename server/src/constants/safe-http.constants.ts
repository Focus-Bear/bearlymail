/**
 * Outbound HTTP to user-supplied URLs (workflow webhooks, MCP servers and
 * their OAuth endpoints). See `src/common/safe-http/`.
 */
const KIB = 1024;
const MIB = KIB * KIB;
const WEBHOOK_RESPONSE_KIB = 64;
const MCP_RESPONSE_MIB = 10;

export const SAFE_HTTP = {
  /**
   * Lets outbound requests reach private/loopback hosts over http or https.
   * Honoured only when NODE_ENV is development or test, for local MCP servers
   * and webhook receivers; ignored in production.
   */
  ALLOW_PRIVATE_ENV_KEY: "ALLOW_PRIVATE_OUTBOUND_URLS",
  DEFAULT_TIMEOUT_MS: 15_000,
  DEFAULT_MAX_RESPONSE_BYTES: MIB,
  /** Webhook responses are only read for a status and a short snippet. */
  WEBHOOK_MAX_RESPONSE_BYTES: WEBHOOK_RESPONSE_KIB * KIB,
  WEBHOOK_RESPONSE_SNIPPET_CHARS: 500,
  /** MCP tool results (e.g. file contents) can be sizeable. */
  MCP_MAX_RESPONSE_BYTES: MCP_RESPONSE_MIB * MIB,
  MAX_REQUEST_BODY_BYTES: MIB,
} as const;
