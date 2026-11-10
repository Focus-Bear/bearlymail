import { HTTP_STATUS } from "./http-status";
import { MILLISECONDS } from "./time-constants";

/**
 * The Focus Bear API BearlyMail calls with the user's own Focus Bear access token
 * (created in the Focus Bear dashboard under Integrations, scope `tasks:read`).
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

/** Focus Bear refuses a token it doesn't know (401) or one without the scope (401 too). */
export const FOCUS_BEAR_REJECTED_TOKEN_STATUSES: readonly number[] = [
  HTTP_STATUS.UNAUTHORIZED,
  HTTP_STATUS.FORBIDDEN,
];

export const FOCUS_BEAR_LIMITS = {
  MAX_TOKEN_LENGTH: 512,
  MAX_TITLE_LENGTH: 500,
  MAX_DESCRIPTION_LENGTH: 4000,
  MAX_EMAIL_SUBJECT_LENGTH: 500,
  MAX_SENDER_LENGTH: 320,
} as const;

/** Per-user limits on the BearlyMail side, under Focus Bear's own per-token ones. */
export const FOCUS_BEAR_THROTTLES = {
  SUGGESTIONS: { default: { limit: 30, ttl: MILLISECONDS.MINUTE } },
  CONNECTION: { default: { limit: 10, ttl: MILLISECONDS.MINUTE } },
} as const;
