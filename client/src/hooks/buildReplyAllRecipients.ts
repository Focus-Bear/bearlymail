import { Email } from 'types/email';
import { splitRecipientList } from 'utils/recipientParser';

export type IsCurrentUserFn = (addr: string) => boolean;

// Pure helper: builds recipients for reply-all mode for **the message being replied to**
// (not necessarily the newest message in the thread).
// No Vite/import.meta dependencies — safe for use in Jest tests.
export function buildReplyAllRecipients(
  targetEmail: Pick<Email, 'from' | 'to' | 'cc' | 'replyTo'>,
  isCurrentUser: IsCurrentUserFn,
  isTargetFromCurrentUser: boolean | '' | undefined
): { recipients: string; cc: string | null } {
  const recipients: string[] = [];
  if (isTargetFromCurrentUser) {
    if (targetEmail.to) {
      const toRecipients = splitRecipientList(targetEmail.to)
        .map((recipientStr: string) => recipientStr.trim())
        .filter((recipientStr: string) => recipientStr && !isCurrentUser(recipientStr));
      recipients.push(...toRecipients);
    }
  } else {
    const replyToAddress = targetEmail.replyTo || targetEmail.from;
    recipients.push(replyToAddress);
    if (targetEmail.to) {
      const toRecipients = splitRecipientList(targetEmail.to)
        .map((recipientStr: string) => recipientStr.trim())
        .filter((recipientStr: string) => recipientStr && !isCurrentUser(recipientStr));
      recipients.push(...toRecipients);
    }
  }
  const uniqueRecipients = [...new Set(recipients)];
  let cc: string | null = null;
  if (targetEmail.cc) {
    const ccRecipients = splitRecipientList(targetEmail.cc)
      .map((recipientStr: string) => recipientStr.trim())
      .filter((recipientStr: string) => recipientStr && !isCurrentUser(recipientStr));
    if (ccRecipients.length > 0) {
      cc = ccRecipients.join(', ');
    }
  }
  return { recipients: uniqueRecipients.join(', '), cc };
}
