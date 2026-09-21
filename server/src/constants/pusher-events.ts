/**
 * Names of the realtime events published on a user's private Pusher channel.
 *
 * Server and client must agree on these strings exactly, so they live in one
 * registry here (mirrored in `client/src/constants/pusher-events.ts`) rather
 * than being typed inline at each `trigger()` / `bind()` call site.
 */
export const PUSHER_EVENTS = {
  CONTACTS_SYNC_STARTED: "contacts-sync-started",
  CONTACTS_SYNC_COMPLETE: "contacts-sync-complete",
  CONTACTS_SYNC_FAILED: "contacts-sync-failed",
  /** A background send reached the provider; carries the real messageId/threadId. */
  EMAIL_SEND_SUCCEEDED: "email-send-succeeded",
  /** A background send failed for good; the message was NOT delivered. */
  EMAIL_SEND_FAILED: "email-send-failed",
} as const;

/**
 * Pusher treats the `private-` prefix as load-bearing: only channels named with
 * it require an authorization call before a client may subscribe. Without it the
 * channel is public and anyone who knows a user id can read that user's events.
 */
export const PUSHER_PRIVATE_CHANNEL_PREFIX = "private-";

/** Private per-user channel every realtime event for a user is published on. */
export function userChannel(userId: string): string {
  return `${PUSHER_PRIVATE_CHANNEL_PREFIX}user-${userId}`;
}
