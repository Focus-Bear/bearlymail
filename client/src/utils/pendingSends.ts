/**
 * Local record of sends the server has accepted but not yet confirmed.
 *
 * The send endpoints return before the mail provider has been contacted, so the
 * UI's "sent" state is optimistic until a Pusher outcome event arrives. This
 * keeps just enough of the message around to put the user back where they were
 * if that outcome turns out to be a failure — otherwise a failed send would
 * leave a false "sent" and no way to recover the text.
 *
 * Backed by localStorage so a reload (or a crash) between sending and the
 * outcome event doesn't lose the draft.
 */

const STORAGE_KEY = 'bearlymail.pendingSends';

/** Which composer produced a pending send. */
export const PENDING_SEND_KIND = {
  REPLY: 'reply',
  COMPOSE: 'compose',
} as const;

export interface PendingReplySend {
  sendId: string;
  kind: typeof PENDING_SEND_KIND.REPLY;
  /** Message the reply was composed against — where Retry navigates back to. */
  emailId: string;
  /** Thread the server-side draft is keyed by, so it can be restored. */
  threadId?: string;
  draft: string;
  recipients: string;
  cc: string | null;
  bcc: string | null;
  subject?: string;
  replyMode: string;
}

export interface PendingComposeSend {
  sendId: string;
  kind: typeof PENDING_SEND_KIND.COMPOSE;
  to: { email: string; name?: string }[];
  cc: { email: string; name?: string }[];
  bcc: { email: string; name?: string }[];
  subject: string;
  body: string;
}

export type PendingSend = PendingReplySend | PendingComposeSend;

function readAll(): Record<string, PendingSend> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PendingSend>) : {};
  } catch {
    return {};
  }
}

function writeAll(entries: Record<string, PendingSend>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked — the optimistic UX still works, only the
    // restore-on-failure convenience is lost.
  }
}

export function rememberPendingSend(pending: PendingSend): void {
  const entries = readAll();
  entries[pending.sendId] = pending;
  writeAll(entries);
}

/** Reads and removes a pending send; returns null if it was never recorded. */
export function takePendingSend(sendId: string): PendingSend | null {
  const entries = readAll();
  const pending = entries[sendId];
  if (!pending) {
    return null;
  }
  delete entries[sendId];
  writeAll(entries);
  return pending;
}
