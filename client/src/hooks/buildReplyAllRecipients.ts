import { Email } from 'types/email';
import { formatRecipientToken, parseAddressHeader, ParsedRecipient } from 'utils/recipientParser';

export type IsCurrentUserFn = (addr: string) => boolean;

type ReplySourceEmail = Pick<Email, 'from' | 'to' | 'cc' | 'replyTo'>;

const joinRecipients = (recipients: ParsedRecipient[]): string =>
  recipients.map(recipient => formatRecipientToken(recipient.name, recipient.email)).join(', ');

/**
 * Drops the current user and any address already in `includedAddresses`
 * (compared case-insensitively), recording the ones it keeps. Sharing the set
 * across To and Cc stops a Cc chip repeating someone already in To.
 */
const keepNewRecipients = (
  recipients: ParsedRecipient[],
  isCurrentUser: IsCurrentUserFn,
  includedAddresses: Set<string>
): ParsedRecipient[] =>
  recipients.filter(recipient => {
    const address = recipient.email.toLowerCase();
    if (isCurrentUser(recipient.email) || includedAddresses.has(address)) {
      return false;
    }
    includedAddresses.add(address);
    return true;
  });

// Pure helper: builds recipients for reply-all mode for **the message being replied to**
// (not necessarily the newest message in the thread).
// Headers are parsed as RFC 5322 address lists, so the empty group
// "undisclosed-recipients:;" on BCC'd mail never becomes a recipient chip.
// No Vite/import.meta dependencies — safe for use in unit tests.
export function buildReplyAllRecipients(
  targetEmail: ReplySourceEmail,
  isCurrentUser: IsCurrentUserFn,
  isTargetFromCurrentUser: boolean | '' | undefined
): { recipients: string; cc: string | null } {
  const includedAddresses = new Set<string>();
  const senderRecipients = isTargetFromCurrentUser ? [] : parseAddressHeader(targetEmail.replyTo || targetEmail.from);
  const toRecipients = keepNewRecipients(
    [...senderRecipients, ...parseAddressHeader(targetEmail.to)],
    isCurrentUser,
    includedAddresses
  );
  const ccRecipients = keepNewRecipients(parseAddressHeader(targetEmail.cc), isCurrentUser, includedAddresses);
  return {
    recipients: joinRecipients(toRecipients),
    cc: ccRecipients.length > 0 ? joinRecipients(ccRecipients) : null,
  };
}

/**
 * Plain reply to a message the user sent themselves: address the first person
 * it went to. Mail the user sent only by BCC has no such person (its To is an
 * empty group), so fall back to the sender rather than echoing the group back.
 */
export function buildReplyToOwnEmailRecipient(
  targetEmail: Pick<Email, 'from' | 'to'>,
  isCurrentUser: IsCurrentUserFn
): string {
  const firstOtherRecipient = parseAddressHeader(targetEmail.to).find(recipient => !isCurrentUser(recipient.email));
  return firstOtherRecipient
    ? formatRecipientToken(firstOtherRecipient.name, firstOtherRecipient.email)
    : targetEmail.from;
}
