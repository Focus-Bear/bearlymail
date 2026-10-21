/**
 * Constants for Mailtrack-style open tracking (see TrackedEmailSender,
 * EmailOpenRecorderService and TrackingPixelController).
 */

import { MILLISECONDS } from "./time-constants";

/** Route prefix of the public tracking controller (`/t/o/<token>.gif`). */
export const TRACKING_PIXEL_ROUTE_PREFIX = "t";
/** Sub-path for open pixels, leaving room for click tracking later. */
export const TRACKING_PIXEL_OPEN_SEGMENT = "o";
export const TRACKING_PIXEL_EXTENSION = ".gif";

/** 16 random bytes = 128 bits, base64url-encoded to 22 characters. */
export const TRACKING_TOKEN_BYTES = 16;
export const TRACKING_TOKEN_LENGTH = 22;
export const TRACKING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/**
 * Matches any of our pixels inside an HTML body, whatever host served it —
 * BACKEND_URL can change between environments, but the path shape cannot.
 * Capture group 1 is the token.
 */
export const TRACKING_PIXEL_IMG_PATTERN =
  /<img\b[^>]{0,2048}?src=["'][^"']{0,2048}?\/t\/o\/([A-Za-z0-9_-]{22})\.gif["'][^>]{0,2048}>/gi;

/** A transparent 1x1 GIF (the canonical 43-byte image). */
export const TRANSPARENT_GIF_BASE64 =
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export const TRACKING_PIXEL_RESPONSE_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "Referrer-Policy": "no-referrer",
} as const;

/**
 * Opens this soon after the send are the sender's own client rendering the
 * message it just sent (or the provider's post-send processing), not the
 * recipient reading it.
 */
export const OPEN_GRACE_WINDOW_MS = 10 * MILLISECONDS.SECOND;

/**
 * Mail clients often re-request an image several times while rendering one
 * message; repeated hits inside this window count as a single open.
 */
export const OPEN_DEDUPE_WINDOW_MS = MILLISECONDS.MINUTE;

/** Upper bound on stored open events per message — counters keep counting. */
export const MAX_OPEN_EVENTS_PER_MESSAGE = 50;

/** How many recent open times the thread view lists in its tooltip. */
export const RECENT_OPENS_LIMIT = 10;

/** Longest user-agent we keep; anything beyond is noise. */
export const MAX_STORED_USER_AGENT_LENGTH = 512;

/** Where an open came from, as far as the request tells us. */
export const OPEN_SOURCE = {
  /** The recipient's own mail client fetched the image. */
  DIRECT: "direct",
  /** Gmail fetched it through its image proxy — a real open, via Gmail. */
  GMAIL_PROXY: "gmail_proxy",
  /**
   * Apple Mail Privacy Protection prefetches every image on delivery, whether
   * or not the message is read, so this is not a reliable open.
   */
  APPLE_PRIVACY_PROXY: "apple_privacy_proxy",
} as const;

export type OpenSource = (typeof OPEN_SOURCE)[keyof typeof OPEN_SOURCE];

export const GMAIL_IMAGE_PROXY_USER_AGENT_MARKER = "GoogleImageProxy";
/** MPP fetches with this bare user agent and nothing after it. */
export const APPLE_PRIVACY_PROXY_USER_AGENT = "Mozilla/5.0";
/** Apple owns 17.0.0.0/8; MPP prefetches originate there. */
export const APPLE_IP_PREFIX = "17.";

/** Whether a sent message carried a pixel. */
export const EMAIL_TRACKING_STATUS = {
  TRACKED: "tracked",
  UNTRACKED: "untracked",
} as const;

export type EmailTrackingStatus =
  (typeof EMAIL_TRACKING_STATUS)[keyof typeof EMAIL_TRACKING_STATUS];

/** Why a user-originated send went out without a pixel. */
export const UNTRACKED_REASON = {
  SETTING_DISABLED: "setting_disabled",
  MESSAGE_OPT_OUT: "message_opt_out",
  /** The message has no HTML part to carry an image. */
  PLAIN_TEXT: "plain_text",
  /** The provider only sends plain text (Apple Mail local mode). */
  PROVIDER_PLAIN_TEXT: "provider_plain_text",
  /** Recipients could not reach the pixel (backend on localhost). */
  NO_PUBLIC_URL: "no_public_url",
  /** The sender's plan doesn't include email tracking (Starter, free). */
  PLAN_EXCLUDES_TRACKING: "plan_excludes_tracking",
} as const;

export type UntrackedReason =
  (typeof UNTRACKED_REASON)[keyof typeof UNTRACKED_REASON];

/** Which send path produced the message. */
export const TRACKED_SEND_SOURCE = {
  REPLY: "reply",
  FORWARD: "forward",
  NEW: "new",
  SCHEDULED_REPLY: "scheduled_reply",
  SCHEDULED_FORWARD: "scheduled_forward",
  SCHEDULED_NEW: "scheduled_new",
  FOLLOW_UP: "follow_up",
} as const;

export type TrackedSendSource =
  (typeof TRACKED_SEND_SOURCE)[keyof typeof TRACKED_SEND_SOURCE];

/** Hosts recipients can never reach, so a pixel pointing at them is useless. */
export const NON_PUBLIC_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
  "0.0.0.0",
]);
