import { Email } from 'types/email';

import { LAST_INBOX_MODE_STORAGE_KEY } from 'constants/strings';

export interface SuggestRepliesRequest {
  originalEmail: Pick<Email, 'from' | 'fromName' | 'to' | 'subject' | 'body'>;
  emailId: string;
  emailThreadId?: string;
  inboxMode?: string;
  userInstructions?: string;
}

/** The inbox mode the user is replying from, or undefined when unknown. */
export function readLastInboxMode(): string | undefined {
  try {
    return sessionStorage.getItem(LAST_INBOX_MODE_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
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
