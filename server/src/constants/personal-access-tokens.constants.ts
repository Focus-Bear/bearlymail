import { DAYS, MILLISECONDS } from "./time-constants";

/**
 * Scopes a personal access token can carry. Read and send are split so a user
 * can hand an assistant a read-only token: email bodies are untrusted input,
 * and a token that cannot send cannot be talked into sending.
 */
export const PAT_SCOPES = {
  MAIL_READ: "mail:read",
  MAIL_SEND: "mail:send",
} as const;

export type PatScope = (typeof PAT_SCOPES)[keyof typeof PAT_SCOPES];

export const ALL_PAT_SCOPES: readonly PatScope[] = Object.values(PAT_SCOPES);

/**
 * Rows in `personal_access_tokens`: a token the user created by hand, or a
 * connection granted to an OAuth client (claude.ai) on the consent screen.
 * Both resolve to the same principal, so `/mcp` treats them identically.
 */
export const ACCESS_TOKEN_KINDS = {
  PERSONAL: "personal",
  OAUTH: "oauth",
} as const;

export type AccessTokenKind =
  (typeof ACCESS_TOKEN_KINDS)[keyof typeof ACCESS_TOKEN_KINDS];

export const PERSONAL_ACCESS_TOKENS = {
  /**
   * Prefix on every issued token. Makes tokens recognisable to secret scanners
   * and lets the guard reject JWTs and other bearer strings without a DB hit.
   */
  TOKEN_PREFIX: "bm_pat_",
  /** 32 random bytes = 256 bits, so an unsalted SHA-256 lookup hash is safe. */
  TOKEN_RANDOM_BYTES: 32,
  /** Characters of the token kept in clear text so users can tell tokens apart. */
  DISPLAY_PREFIX_LENGTH: 12,
  MAX_NAME_LENGTH: 100,
  MAX_ACTIVE_TOKENS_PER_USER: 20,
  /** Expiry choices offered when creating a token; null means never expires. */
  ALLOWED_EXPIRY_DAYS: [
    DAYS.WEEK,
    DAYS.MONTH,
    DAYS.NINETY,
    DAYS.YEAR,
  ] as readonly number[],
  /** Writing lastUsedAt on every MCP call would make each read a DB write. */
  LAST_USED_WRITE_INTERVAL_MS: 5 * MILLISECONDS.MINUTE,
  AUDIT_ACTIONS: {
    CREATED: "PERSONAL_ACCESS_TOKEN_CREATED",
    REVOKED: "PERSONAL_ACCESS_TOKEN_REVOKED",
  },
  AUDIT_TARGET_TYPE: "personal_access_token",
} as const;
