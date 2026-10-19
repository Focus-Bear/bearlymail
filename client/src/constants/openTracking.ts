/** What the sent/opened indicator shows for one tracked message. */
export const OPEN_TRACKING_STATE = {
  SENT: 'sent',
  OPENED: 'opened',
  /** Only Apple Mail Privacy Protection prefetches — may not have been read. */
  MAYBE_AUTOMATIC: 'maybe_automatic',
} as const;

export type OpenTrackingState = (typeof OPEN_TRACKING_STATE)[keyof typeof OPEN_TRACKING_STATE];

export const OPEN_SOURCE_GMAIL_PROXY = 'gmail_proxy' as const;

/**
 * Matches the server's open-tracking pixel (`/t/o/<22-char token>.gif`) on any
 * host. Kept in sync with TRACKING_PIXEL_IMG_PATTERN on the server.
 */
export const TRACKING_PIXEL_IMG_PATTERN =
  /<img\b[^>]{0,2048}?src=["'][^"']{0,2048}?\/t\/o\/[A-Za-z0-9_-]{22}\.gif["'][^>]{0,2048}>/gi;

/** Settings anchor for the open-tracking section. */
export const OPEN_TRACKING_SETTINGS_ANCHOR = 'email-tracking';
