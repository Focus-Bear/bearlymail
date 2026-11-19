import { HTTP_STATUS } from "./http-status";
import { MILLISECONDS } from "./time-constants";

/**
 * The Focus Bear API BearlyMail calls as the user, with an access token Focus Bear's
 * authorization server issued when they signed in (see FOCUS_BEAR_OAUTH).
 * These paths are the contract with the Focus Bear backend.
 */
export const FOCUS_BEAR_API = {
  BASE_URL_ENV: "FOCUS_BEAR_API_URL",
  DEFAULT_BASE_URL: "https://api.focusbear.io",
  SUGGEST_PROJECT_PATH: "/mcp/tasks/suggest-project",
  NEXT_FREE_DATE_PATH: "/mcp/tasks/next-free-date",
  DURATION_QUERY_PARAM: "duration",
  /** Suggestions are a nicety on a save: past this the save goes ahead without them. */
  REQUEST_TIMEOUT_MS: 4 * MILLISECONDS.SECOND,
} as const;

/**
 * How the user connects: they sign in to Focus Bear (Auth0, authorization code with PKCE) and
 * consent to BearlyMail reading suggestions. BearlyMail keeps the refresh token, encrypted, and
 * trades it for 15-minute access tokens. No Focus Bear credential is ever typed or pasted here.
 */
export const FOCUS_BEAR_OAUTH = {
  /** Auth0 issuer, e.g. `https://tenant.auth0.com/`. */
  ISSUER_ENV: "FOCUS_BEAR_OAUTH_ISSUER",
  CLIENT_ID_ENV: "FOCUS_BEAR_OAUTH_CLIENT_ID",
  CLIENT_SECRET_ENV: "FOCUS_BEAR_OAUTH_CLIENT_SECRET",
  /** Must be registered with Auth0 exactly: `<api origin>/focus-bear/oauth/callback`. */
  REDIRECT_URI_ENV: "FOCUS_BEAR_OAUTH_REDIRECT_URI",
  AUDIENCE_ENV: "FOCUS_BEAR_OAUTH_AUDIENCE",
  /** The Focus Bear MCP resource: the audience its API accepts these tokens for. */
  DEFAULT_AUDIENCE: "https://mcp.aws.focusbear.io/mcp",
  /**
   * `offline_access` gets the refresh token. No `openid`: Auth0 would add a second audience,
   * and Focus Bear refuses a token with more than one.
   */
  SCOPE: "mcp.suggestions.read offline_access",
  AUTHORIZE_PATH: "authorize",
  TOKEN_PATH: "oauth/token",
  REVOKE_PATH: "oauth/revoke",
  CODE_CHALLENGE_METHOD: "S256",
  CODE_VERIFIER_BYTES: 32,
  /** HttpOnly cookie holding the PKCE verifier between the redirect out and the callback. */
  CODE_VERIFIER_COOKIE: "bm_focus_bear_pkce",
  REQUEST_TIMEOUT_MS: 10 * MILLISECONDS.SECOND,
  /** An access token is treated as expired this long before it is, so one in flight is not refused. */
  EXPIRY_MARGIN_MS: MILLISECONDS.MINUTE,
} as const;

/** Auth0's answer when a refresh token is revoked, expired or already rotated away. */
export const FOCUS_BEAR_OAUTH_INVALID_GRANT = "invalid_grant";

/** Where the callback sends the browser back to, and how it says what happened. */
export const FOCUS_BEAR_CONNECT_RESULT = {
  SETTINGS_PATH: "/settings",
  QUERY_PARAM: "focusBear",
  ANCHOR: "focus-bear",
  CONNECTED: "connected",
  FAILED: "failed",
} as const;

/** Focus Bear refuses a token it doesn't know (401) or one without the scope (401 too). */
export const FOCUS_BEAR_REJECTED_TOKEN_STATUSES: readonly number[] = [
  HTTP_STATUS.UNAUTHORIZED,
  HTTP_STATUS.FORBIDDEN,
];

export const FOCUS_BEAR_LIMITS = {
  MAX_TITLE_LENGTH: 500,
  MAX_DESCRIPTION_LENGTH: 4000,
  MAX_EMAIL_SUBJECT_LENGTH: 500,
  MAX_SENDER_LENGTH: 320,
} as const;

/** Per-user limits on the BearlyMail side, under Focus Bear's own per-token ones. */
export const FOCUS_BEAR_THROTTLES = {
  SUGGESTIONS: { default: { limit: 30, ttl: MILLISECONDS.MINUTE } },
  CONNECT_START: { default: { limit: 10, ttl: MILLISECONDS.MINUTE } },
} as const;
