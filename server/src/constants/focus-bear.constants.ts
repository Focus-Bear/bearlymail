import { HTTP_STATUS } from "./http-status";
import { MILLISECONDS } from "./time-constants";

/**
 * The Focus Bear API BearlyMail calls on the user's behalf. These paths are the
 * contract with the Focus Bear backend. A user connected with Focus Bear sign-in
 * (OAuth) holds an ordinary Focus Bear access token, accepted on the `/to-do`
 * routes; a user who pasted an access token before sign-in existed holds an MCP
 * token, accepted only on the `/mcp/tasks` routes.
 */
export const FOCUS_BEAR_API = {
  BASE_URL_ENV: "FOCUS_BEAR_API_URL",
  DEFAULT_BASE_URL: "https://api.focusbear.io",
  OAUTH_PATHS: {
    SUGGEST_PROJECT: "/to-do/suggest-project",
    NEXT_FREE_DATE: "/to-do/next-free-date",
  },
  PASTED_TOKEN_PATHS: {
    SUGGEST_PROJECT: "/mcp/tasks/suggest-project",
    NEXT_FREE_DATE: "/mcp/tasks/next-free-date",
  },
  DURATION_QUERY_PARAM: "duration",
  /** Suggestions are a nicety on a save: past this the save goes ahead without them. */
  REQUEST_TIMEOUT_MS: 4 * MILLISECONDS.SECOND,
} as const;

/** How BearlyMail holds the user's Focus Bear access. */
export const FOCUS_BEAR_CONNECTION_METHODS = {
  OAUTH: "oauth",
  /** A token the user created in Focus Bear and pasted in, before sign-in existed. */
  PASTED_TOKEN: "pasted_token",
} as const;

export type FocusBearConnectionMethod =
  (typeof FOCUS_BEAR_CONNECTION_METHODS)[keyof typeof FOCUS_BEAR_CONNECTION_METHODS];

/**
 * "Connect Focus Bear": authorization code + PKCE against Focus Bear's Auth0
 * tenant, for the Focus Bear API audience. Every value that identifies the
 * tenant or the app comes from the environment; without the required ones the
 * Connect button is unavailable rather than half-working.
 */
export const FOCUS_BEAR_OAUTH_ENV = {
  /** Auth0 domain, e.g. `auth.focusbear.io`. */
  DOMAIN: "FOCUS_BEAR_OAUTH_DOMAIN",
  CLIENT_ID: "FOCUS_BEAR_OAUTH_CLIENT_ID",
  CLIENT_SECRET: "FOCUS_BEAR_OAUTH_CLIENT_SECRET",
  /** The Focus Bear API identifier (the backend's `AUTH0_IDENTIFIER`). */
  AUDIENCE: "FOCUS_BEAR_OAUTH_AUDIENCE",
  /** Optional: defaults to {@link FOCUS_BEAR_OAUTH.DEFAULT_SCOPE}. */
  SCOPE: "FOCUS_BEAR_OAUTH_SCOPE",
  /** Optional: defaults to this API's origin + {@link FOCUS_BEAR_OAUTH.CALLBACK_PATH}. */
  REDIRECT_URI: "FOCUS_BEAR_OAUTH_REDIRECT_URI",
} as const;

export const FOCUS_BEAR_OAUTH = {
  CALLBACK_PATH: "/focus-bear/oauth/callback",
  AUTHORIZE_PATH: "/authorize",
  TOKEN_PATH: "/oauth/token",
  REVOKE_PATH: "/oauth/revoke",
  /** `offline_access` is what makes Auth0 issue a refresh token. */
  DEFAULT_SCOPE: "openid offline_access",
  RESPONSE_TYPE: "code",
  CODE_CHALLENGE_METHOD: "S256",
  GRANT_TYPES: {
    AUTHORIZATION_CODE: "authorization_code",
    REFRESH_TOKEN: "refresh_token",
  },
  /** The token endpoint's answer to a refresh token that was revoked or died idle. */
  INVALID_GRANT_ERROR: "invalid_grant",
  /** What Auth0 sends back when the user cancels or declines consent. */
  ACCESS_DENIED_ERROR: "access_denied",
  CODE_VERIFIER_BYTES: 32,
  /** HttpOnly cookie holding the PKCE verifier for the browser that started the flow. */
  VERIFIER_COOKIE: "bm_focus_bear_oauth",
  /** Sign-in and consent take minutes at most; the cookie bounds how long a started flow stays usable. */
  VERIFIER_COOKIE_MAX_AGE_MS: 10 * MILLISECONDS.MINUTE,
  /**
   * Renewing at least daily keeps the refresh token in use: Auth0 kills one that
   * sits idle, and Focus Bear access tokens last far longer than that idle window.
   */
  MAX_ACCESS_TOKEN_AGE_MS: MILLISECONDS.DAY,
  /** Renew this long before the access token's own expiry. */
  EXPIRY_SKEW_MS: MILLISECONDS.MINUTE,
  REQUEST_TIMEOUT_MS: 10 * MILLISECONDS.SECOND,
} as const;

/** `?focusBear=` on the Settings page after the callback, read by the Focus Bear card. */
export const FOCUS_BEAR_CONNECT_RESULT_PARAM = "focusBear";

export const FOCUS_BEAR_CONNECT_RESULTS = {
  CONNECTED: "connected",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  FAILED: "failed",
} as const;

export type FocusBearConnectResult =
  (typeof FOCUS_BEAR_CONNECT_RESULTS)[keyof typeof FOCUS_BEAR_CONNECT_RESULTS];

/** The Settings section the callback returns to (the client's `SETTINGS_ANCHORS.FOCUS_BEAR`). */
export const FOCUS_BEAR_SETTINGS_PATH = "/settings";
export const FOCUS_BEAR_SETTINGS_ANCHOR = "focus-bear";
export const DEFAULT_FRONTEND_URL = "http://localhost:3000";

/** Focus Bear refuses a token it doesn't know or no longer accepts with 401, sometimes 403. */
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

/** Per-user limits on the BearlyMail side, under Focus Bear's own per-user ones. */
export const FOCUS_BEAR_THROTTLES = {
  SUGGESTIONS: { default: { limit: 30, ttl: MILLISECONDS.MINUTE } },
  CONNECTION: { default: { limit: 10, ttl: MILLISECONDS.MINUTE } },
} as const;
