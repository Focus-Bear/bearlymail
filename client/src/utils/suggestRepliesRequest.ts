import { Email } from 'types/email';

import { ROUTE_FOCUSED_INBOX, ROUTE_INBOX } from 'constants/strings';

export interface SuggestRepliesRequest {
  originalEmail: Pick<Email, 'from' | 'fromName' | 'to' | 'subject' | 'body'>;
  emailId: string;
  emailThreadId?: string;
  inboxMode?: string;
  userInstructions?: string;
}

/** `/inbox/:mode[/…]` and `/focused-inbox/:mode[/…]`; captures the mode segment. */
const INBOX_MODE_PATH_PATTERN = new RegExp(`^(?:${ROUTE_INBOX}|${ROUTE_FOCUSED_INBOX})/([^/]+)`);

/**
 * The inbox mode the user is replying from, only when it is actually known: the
 * mode in the URL (replying in the inbox split view), else the mode the inbox
 * list passed when opening the email full-page (`location.state.fromMode`).
 *
 * Deliberately not the last-visited mode in sessionStorage: an email opened from
 * search, a contact page or a link would inherit a stale "follow-up" and get
 * nudges instead of replies. Undefined lets the server decide from the thread.
 */
export function resolveReplyInboxMode(pathname: string | undefined, locationState: unknown): string | undefined {
  const routeMode = pathname ? INBOX_MODE_PATH_PATTERN.exec(pathname)?.[1] : undefined;
  if (routeMode) {
    return routeMode;
  }
  const fromMode = (locationState as { fromMode?: unknown } | null)?.fromMode;
  return typeof fromMode === 'string' && fromMode ? fromMode : undefined;
}

/**
 * Body for POST /llm/suggest-replies. The thread id and inbox mode let the
 * server see when the user sent the latest message (Follow-Up), so it suggests
 * follow-ups to the other party instead of replying to the user's own email.
 */
export function buildSuggestRepliesRequest(
  email: Email,
  options: { inboxMode?: string; userInstructions?: string } = {}
): SuggestRepliesRequest {
  const { inboxMode, userInstructions } = options;
  return {
    originalEmail: {
      from: email.from,
      fromName: email.fromName,
      to: email.to,
      subject: email.subject,
      body: email.body,
    },
    emailId: email.id,
    ...(email.emailThreadId ? { emailThreadId: email.emailThreadId } : {}),
    ...(inboxMode ? { inboxMode } : {}),
    ...(userInstructions ? { userInstructions } : {}),
  };
}
