/**
 * Unsubscribing from mailing lists (RFC 2369 List-Unsubscribe, RFC 8058
 * one-click). See `src/emails/unsubscribe/`.
 */
const KIB = 1024;
const ONE_CLICK_RESPONSE_KIB = 64;

/** How BearlyMail unsubscribes, in order of preference. */
export const UNSUBSCRIBE_METHODS = {
  /** RFC 8058: the server POSTs the https URL; nothing for the user to do. */
  ONE_CLICK: "one-click",
  /** Send an email to the list's mailto: address from the user's account. */
  MAILTO: "mailto",
  /** Open the sender's https unsubscribe page for the user. */
  LINK: "link",
} as const;

export type UnsubscribeMethod =
  (typeof UNSUBSCRIBE_METHODS)[keyof typeof UNSUBSCRIBE_METHODS];

/** Where an unsubscribe target was found. */
export const UNSUBSCRIBE_SOURCES = {
  HEADER: "header",
  BODY: "body",
} as const;

export type UnsubscribeSource =
  (typeof UNSUBSCRIBE_SOURCES)[keyof typeof UNSUBSCRIBE_SOURCES];

/** What the client must do after `POST /emails/:id/unsubscribe`. */
export const UNSUBSCRIBE_OUTCOMES = {
  /** BearlyMail unsubscribed (one-click POST accepted or mailto sent). */
  UNSUBSCRIBED: "unsubscribed",
  /** The user has to finish on the sender's page: open `url` in a new tab. */
  OPEN_LINK: "open-link",
} as const;

export type UnsubscribeOutcome =
  (typeof UNSUBSCRIBE_OUTCOMES)[keyof typeof UNSUBSCRIBE_OUTCOMES];

export const UNSUBSCRIBE = {
  /** The exact List-Unsubscribe-Post value (and POST body) RFC 8058 defines. */
  ONE_CLICK_POST_VALUE: "List-Unsubscribe=One-Click",
  ONE_CLICK_CONTENT_TYPE: "application/x-www-form-urlencoded",
  ONE_CLICK_TIMEOUT_MS: 10_000,
  /** Only the status matters; the response body is never read. */
  ONE_CLICK_MAX_RESPONSE_BYTES: ONE_CLICK_RESPONSE_KIB * KIB,
  /** Used when the mailto: URI carries no subject / body of its own. */
  MAILTO_DEFAULT_SUBJECT: "unsubscribe",
  MAILTO_DEFAULT_BODY: "unsubscribe",
  /** Recorded on the blocked-sender row so the settings list says why. */
  BLOCKED_SENDER_REASON: "Unsubscribed via BearlyMail",
  /** Label used in SSRF-guard error messages. */
  ONE_CLICK_URL_LABEL: "List-Unsubscribe URL",
  /** Bounds the sibling lookup so one prolific sender can't fan out. */
  MAX_SIBLING_EMAILS: 200,
  /** How far back Settings → Subscriptions counts a mailing list's mail. */
  MAILING_LIST_WINDOW_DAYS: 90,
  /** Most mailing lists Settings → Subscriptions lists at once. */
  MAX_MAILING_LISTS: 200,
} as const;
