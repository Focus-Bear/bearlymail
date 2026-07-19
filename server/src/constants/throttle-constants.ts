/**
 * Named constants for the user-throttler guard.
 *
 * All throttle tier identifiers, PostHog event names, and route patterns
 * are defined here so no magic strings appear in the guard itself.
 */

export const THROTTLE_TIERS = {
  FEEDBACK: "feedback",
  POLLING: "polling",
  DEFAULT: "default",
} as const;

export const POSTHOG_EVENTS = {
  RATE_LIMIT_EXCEEDED: "rate_limit_exceeded",
} as const;

/** Exact path suffixes that are classified as feedback routes. */
export const FEEDBACK_PATHS = ["/priority/star-feedback"] as const;

/** Matches any `/priority/<id>/feedback` style path. */
export const FEEDBACK_PATH_PATTERN = /\/priority\/[^/]+\/feedback/;

/** Matches polling/streaming endpoint URL patterns. */
export const POLLING_PATH_PATTERN = /progress|poll|status|stream|updates/i;
