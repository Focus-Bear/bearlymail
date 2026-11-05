import { BYTE_CONVERSIONS } from "./service-constants";
import { DAYS, MILLISECONDS, MS_PER_SECOND, SECONDS } from "./time-constants";

/** Client ID Metadata Documents are a few hundred bytes; 16 KiB is generous. */
const CLIENT_METADATA_MAX_KIB = 16;

/**
 * BearlyMail's OAuth 2.1 authorization server for the MCP endpoint, so Claude
 * (claude.ai web/mobile, Claude Code) can connect without a pasted token.
 * Follows the MCP authorization spec (2025-11-25): RFC 9728 protected-resource
 * metadata, RFC 8414 server metadata, Client ID Metadata Documents first and
 * RFC 7591 dynamic registration as the fallback, authorization code + S256 PKCE.
 */
export const MCP_OAUTH = {
  PATHS: {
    PROTECTED_RESOURCE_METADATA: "/.well-known/oauth-protected-resource",
    AUTHORIZATION_SERVER_METADATA: "/.well-known/oauth-authorization-server",
    AUTHORIZE: "/oauth/authorize",
    TOKEN: "/oauth/token",
    REGISTER: "/oauth/register",
    REVOKE: "/oauth/revoke",
  },
  /** Frontend route that shows the consent screen for a pending request. */
  CONSENT_PAGE_PATH: "/oauth/consent",
  CONSENT_REQUEST_PARAM: "request",

  ACCESS_TOKEN_PREFIX: "bm_oat_",
  REFRESH_TOKEN_PREFIX: "bm_ort_",
  AUTHORIZATION_CODE_PREFIX: "bm_oac_",
  /** 256 bits, so the unsalted SHA-256 lookup hash is safe (as for PATs). */
  SECRET_RANDOM_BYTES: 32,

  ACCESS_TOKEN_TTL_SECONDS: SECONDS.HOUR,
  /** Idle lifetime: every refresh rotates the token and restarts this window. */
  REFRESH_TOKEN_TTL_MS: DAYS.MONTH * MILLISECONDS.DAY,
  /** A client retrying a refresh this soon is a retry, not a stolen token. */
  REFRESH_REUSE_GRACE_MS: MILLISECONDS.THIRTY_SECONDS,
  /** How long the user has to log in and answer the consent screen. */
  AUTHORIZATION_REQUEST_TTL_MS: SECONDS.FIFTEEN_MINUTES * MS_PER_SECOND,
  AUTHORIZATION_CODE_TTL_MS: MILLISECONDS.MINUTE,
  /** Finished or abandoned requests are kept this long, then pruned. */
  AUTHORIZATION_ROW_RETENTION_MS: MILLISECONDS.DAY,
  /** A registered client with no live connection is removed after this long. */
  UNUSED_CLIENT_RETENTION_MS: DAYS.MONTH * MILLISECONDS.DAY,

  CODE_CHALLENGE_METHOD_S256: "S256",
  /** RFC 7636 §4.1: the verifier is 43–128 unreserved characters. */
  CODE_VERIFIER_PATTERN: /^[A-Za-z0-9\-._~]{43,128}$/,
  CODE_CHALLENGE_PATTERN: /^[A-Za-z0-9\-_]{43}$/,

  RESPONSE_TYPE_CODE: "code",
  GRANT_TYPES: {
    AUTHORIZATION_CODE: "authorization_code",
    REFRESH_TOKEN: "refresh_token",
  },
  TOKEN_TYPE_BEARER: "Bearer",
  /** Public clients only: PKCE stands in for the client secret. */
  TOKEN_ENDPOINT_AUTH_METHOD_NONE: "none",
  /**
   * Requested by Claude when advertised, to get a refresh token. Refresh tokens
   * are always issued, so it's accepted and dropped rather than granted.
   */
  OFFLINE_ACCESS_SCOPE: "offline_access",

  /** Client ID Metadata Document fetch limits (the URL is attacker-supplied). */
  CLIENT_METADATA_FETCH_TIMEOUT_MS: 5 * MILLISECONDS.SECOND,
  CLIENT_METADATA_MAX_BYTES: CLIENT_METADATA_MAX_KIB * BYTE_CONVERSIONS.KB,
  CLIENT_METADATA_CACHE_TTL_MS: 5 * MILLISECONDS.MINUTE,
  CLIENT_METADATA_CACHE_MAX_ENTRIES: 200,

  MAX_CLIENT_NAME_LENGTH: 100,
  MAX_REDIRECT_URIS: 10,
  MAX_REDIRECT_URI_LENGTH: 2000,
  MAX_STATE_LENGTH: 2000,

  /** Registration is unauthenticated, so keep it tight. */
  REGISTER_RATE_LIMIT: 30,
  RATE_WINDOW_MS: MILLISECONDS.MINUTE,

  AUDIT_ACTIONS: {
    GRANTED: "MCP_OAUTH_GRANTED",
    DENIED: "MCP_OAUTH_DENIED",
    CODE_REPLAYED: "MCP_OAUTH_CODE_REPLAYED",
    REFRESH_REPLAYED: "MCP_OAUTH_REFRESH_REPLAYED",
  },
  AUDIT_TARGET_TYPE: "oauth_client",
} as const;

/** RFC 6749 §5.2 / RFC 7591 §3.2.2 / RFC 8707 error codes. */
export const OAUTH_ERROR_CODES = {
  INVALID_REQUEST: "invalid_request",
  INVALID_CLIENT: "invalid_client",
  INVALID_GRANT: "invalid_grant",
  UNAUTHORIZED_CLIENT: "unauthorized_client",
  UNSUPPORTED_GRANT_TYPE: "unsupported_grant_type",
  UNSUPPORTED_RESPONSE_TYPE: "unsupported_response_type",
  INVALID_SCOPE: "invalid_scope",
  ACCESS_DENIED: "access_denied",
  INVALID_TARGET: "invalid_target",
  INVALID_REDIRECT_URI: "invalid_redirect_uri",
  INVALID_CLIENT_METADATA: "invalid_client_metadata",
  INVALID_TOKEN: "invalid_token",
  SERVER_ERROR: "server_error",
} as const;

export type OAuthErrorCode =
  (typeof OAUTH_ERROR_CODES)[keyof typeof OAUTH_ERROR_CODES];

/** How a client identified itself to the authorization server. */
export const OAUTH_CLIENT_KINDS = {
  /** client_id is an HTTPS URL to a Client ID Metadata Document. */
  METADATA_DOCUMENT: "metadata_document",
  /** client_id was issued by POST /oauth/register (RFC 7591). */
  DYNAMIC: "dynamic",
} as const;

export type OAuthClientKind =
  (typeof OAUTH_CLIENT_KINDS)[keyof typeof OAUTH_CLIENT_KINDS];
