export type IsCurrentUserFn = (addr: string) => boolean;

// Pure helper: builds recipients for reply-all mode.
// No Vite/import.meta dependencies — safe for use in Jest tests.
export function buildReplyAllRecipients(
  latestEmail: any,
  isCurrentUser: IsCurrentUserFn,
  isLatestFromCurrentUser: boolean | '' | undefined
): { recipients: string; cc: string | null } {
  const recipients: string[] = [];
  if (isLatestFromCurrentUser) {
    if (latestEmail.to) {
      const toRecipients = latestEmail.to
        .split(',')
        .map((recipientStr: string) => recipientStr.trim())
        .filter((recipientStr: string) => recipientStr && !isCurrentUser(recipientStr));
      recipients.push(...toRecipients);
    }
  } else {
    const replyToAddress = latestEmail.replyTo || latestEmail.from;
    recipients.push(replyToAddress);
    if (latestEmail.to) {
      const toRecipients = latestEmail.to
        .split(',')
        .map((recipientStr: string) => recipientStr.trim())
        .filter((recipientStr: string) => recipientStr && !isCurrentUser(recipientStr));
      recipients.push(...toRecipients);
    }
  }
  const uniqueRecipients = [...new Set(recipients)];
  let cc: string | null = null;
  if (latestEmail.cc) {
    const ccRecipients = latestEmail.cc
      .split(',')
      .map((recipientStr: string) => recipientStr.trim())
      .filter((recipientStr: string) => recipientStr && !isCurrentUser(recipientStr));
    if (ccRecipients.length > 0) {
      cc = ccRecipients.join(', ');
    }
  }
  return { recipients: uniqueRecipients.join(', '), cc };
}
