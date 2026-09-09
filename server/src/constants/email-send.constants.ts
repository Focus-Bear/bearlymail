/**
 * Constants for the background email-send pipeline (see EmailSendQueueService
 * and EmailSendProcessor).
 */

/** Lifecycle of a persisted send attempt. */
export const EMAIL_SEND_STATUS = {
  /** Persisted and enqueued; no provider call has started. */
  QUEUED: "queued",
  /** Claimed by a worker; a provider call may be in flight. Never re-sent. */
  SENDING: "sending",
  /** The provider accepted the message. Terminal. */
  SENT: "sent",
  /** The send failed for good and the user has been told. Terminal. */
  FAILED: "failed",
} as const;

export type EmailSendStatus =
  (typeof EMAIL_SEND_STATUS)[keyof typeof EMAIL_SEND_STATUS];

/** Which composer produced the attempt. */
export const EMAIL_SEND_TYPE = {
  NEW: "new",
  REPLY: "reply",
} as const;

export type EmailSendType =
  (typeof EMAIL_SEND_TYPE)[keyof typeof EMAIL_SEND_TYPE];

/**
 * Machine-readable failure reasons published to the client, which maps them to
 * translated copy. Raw provider errors are logged server-side only — they leak
 * internals and are never user-safe.
 */
export const EMAIL_SEND_FAILURE_REASON = {
  /** The provider refused the message (bad address, auth, quota, …). */
  PROVIDER_REJECTED: "provider_rejected",
  /** A worker died mid-send; delivery is genuinely unknown. */
  UNCONFIRMED: "unconfirmed",
} as const;

export type EmailSendFailureReason =
  (typeof EMAIL_SEND_FAILURE_REASON)[keyof typeof EMAIL_SEND_FAILURE_REASON];

/**
 * Provider attempts before a send is declared failed. Kept at or below the
 * queue's retryLimit so this counter — not pg-boss — decides when the user is
 * told, guaranteeing exactly one failure notification.
 */
export const MAX_EMAIL_SEND_ATTEMPTS = 3;

/** pg-boss retryLimit for the send queue (one more run than we will use). */
export const EMAIL_SEND_RETRY_LIMIT = MAX_EMAIL_SEND_ATTEMPTS;

/** Seconds between send retries. */
export const EMAIL_SEND_RETRY_DELAY_SECONDS = 10;

/**
 * A `queued` row untouched for this long means its job was lost (worker crash
 * before the claim, queue wipe). The sweeper re-enqueues it; the claim guard
 * makes a duplicate job a no-op.
 */
export const STALE_QUEUED_MINUTES = 10;

/**
 * A `sending` row untouched for this long means the worker died with a provider
 * call possibly in flight. It is never re-sent — the user is told delivery could
 * not be confirmed.
 */
export const STALE_SENDING_MINUTES = 30;

/** How many stalled rows one sweep handles, so a backlog can't stall the worker. */
export const SEND_SWEEP_BATCH_SIZE = 100;

/** Cron expression for the stalled-send sweeper. */
export const SEND_SWEEP_CRON = "*/5 * * * *";
