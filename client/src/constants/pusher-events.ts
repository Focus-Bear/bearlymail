/**
 * Realtime event names published on the user's private Pusher channel.
 * Mirrors `server/src/constants/pusher-events.ts` — the two must stay in step.
 */
export const PUSHER_EVENTS = {
  CONTACTS_SYNC_STARTED: 'contacts-sync-started',
  CONTACTS_SYNC_COMPLETE: 'contacts-sync-complete',
  CONTACTS_SYNC_FAILED: 'contacts-sync-failed',
  EMAIL_SEND_SUCCEEDED: 'email-send-succeeded',
  EMAIL_SEND_FAILED: 'email-send-failed',
} as const;

/** Private per-user channel every realtime event for a user arrives on. */
export function userChannel(userId: string): string {
  return `user-${userId}`;
}

/** Failure codes carried by EMAIL_SEND_FAILED, mapped to translated copy. */
export const EMAIL_SEND_FAILURE_REASON = {
  PROVIDER_REJECTED: 'provider_rejected',
  UNCONFIRMED: 'unconfirmed',
} as const;

export type EmailSendFailureReason = (typeof EMAIL_SEND_FAILURE_REASON)[keyof typeof EMAIL_SEND_FAILURE_REASON];

export interface EmailSendSucceededEvent {
  sendId: string;
  sendType: 'new' | 'reply';
  emailId?: string;
  messageId: string;
  threadId: string;
}

export interface EmailSendFailedEvent {
  sendId: string;
  sendType: 'new' | 'reply';
  emailId?: string;
  reason: EmailSendFailureReason;
}
