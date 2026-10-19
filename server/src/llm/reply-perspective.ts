import { INBOX_MODES } from "../constants/query-limits";
import {
  deriveRecipientDisplayName,
  extractEmailAddress,
  parseRecipientsFromString,
} from "../utils/email-address.utils";

/** Greeting name when nobody's name can be found (matches the follow-up prompt). */
export const UNKNOWN_RECIPIENT_NAME = "there";

export interface ReplyPerspectiveMessage {
  from: string;
  fromName?: string | null;
  to?: string | null;
}

export interface ReplyPerspectiveThreadMessage extends ReplyPerspectiveMessage {
  receivedAt: Date;
}

/**
 * Who the suggested reply is from and who it goes to. The reply prompts get
 * this explicitly because, given only a raw "From:" header, the model could not
 * tell that the latest email was the user's own and answered it ("Hi Jeremy,
 * thanks for the follow-up…") instead of chasing the other party.
 */
export interface ReplyPerspective {
  /** The user is waiting on the other party: suggest follow-ups, not replies. */
  isFollowUp: boolean;
  userEmail: string;
  /** The person the suggested email is addressed to (never the user). */
  recipientName: string;
  recipientEmail: string;
}

export interface ResolveReplyPerspectiveInput {
  /** Messages of the thread, in any order. Empty when the thread is unknown. */
  threadMessages: ReplyPerspectiveThreadMessage[];
  /** The email the user asked to reply to; stands in for an unknown thread. */
  replyTarget: ReplyPerspectiveMessage;
  userEmail: string;
  /** Inbox mode the user is replying from, when the client knows it. */
  inboxMode?: string | null;
}

interface Counterparty {
  name: string;
  email: string;
}

export function isFromUserAddress(
  address: string | null | undefined,
  userEmail: string | null | undefined,
): boolean {
  const normalizedUserEmail = extractEmailAddress(userEmail);
  return (
    normalizedUserEmail.length > 0 &&
    extractEmailAddress(address) === normalizedUserEmail
  );
}

function sortByNewestFirst(
  messages: ReplyPerspectiveThreadMessage[],
): ReplyPerspectiveThreadMessage[] {
  return [...messages].sort(
    (first, second) =>
      new Date(second.receivedAt).getTime() -
      new Date(first.receivedAt).getTime(),
  );
}

function nameUsedBy(
  messagesNewestFirst: ReplyPerspectiveMessage[],
  email: string,
): string | null {
  const ownMessage = messagesNewestFirst.find(
    (message) =>
      extractEmailAddress(message.from) === email && message.fromName,
  );
  return ownMessage?.fromName ?? null;
}

/**
 * The other party the user is waiting on: the first non-user address the user's
 * latest email went to, else whoever last wrote to the user. Their own display
 * name (as they sign their emails) wins over the header name.
 */
function resolveFollowUpCounterparty(
  messagesNewestFirst: ReplyPerspectiveMessage[],
  userEmail: string,
): Counterparty {
  const lastUserMessage = messagesNewestFirst.find((message) =>
    isFromUserAddress(message.from, userEmail),
  );
  const addressee = parseRecipientsFromString(lastUserMessage?.to ?? "").find(
    (recipient) => !isFromUserAddress(recipient.email, userEmail),
  );
  if (addressee) {
    const email = extractEmailAddress(addressee.email);
    const name =
      nameUsedBy(messagesNewestFirst, email) ||
      addressee.name ||
      deriveRecipientDisplayName(addressee.email) ||
      UNKNOWN_RECIPIENT_NAME;
    return { name, email };
  }

  const lastOtherPartyMessage = messagesNewestFirst.find(
    (message) => !isFromUserAddress(message.from, userEmail),
  );
  if (!lastOtherPartyMessage) {
    return { name: UNKNOWN_RECIPIENT_NAME, email: "" };
  }
  return {
    name: lastOtherPartyMessage.fromName || lastOtherPartyMessage.from,
    email: extractEmailAddress(lastOtherPartyMessage.from),
  };
}

function senderOf(message: ReplyPerspectiveMessage): Counterparty {
  return {
    name: message.fromName || message.from || UNKNOWN_RECIPIENT_NAME,
    email: extractEmailAddress(message.from),
  };
}

/**
 * Decides whether suggestions should be follow-ups (the user sent the latest
 * message, or is replying from the Follow-Up inbox, which only holds threads
 * awaiting the other party) or normal replies, and who they are addressed to.
 */
export function resolveReplyPerspective({
  threadMessages,
  replyTarget,
  userEmail,
  inboxMode,
}: ResolveReplyPerspectiveInput): ReplyPerspective {
  const messagesNewestFirst: ReplyPerspectiveMessage[] =
    threadMessages.length > 0
      ? sortByNewestFirst(threadMessages)
      : [replyTarget];
  const latestMessage = messagesNewestFirst[0];
  const isFollowUp =
    isFromUserAddress(latestMessage.from, userEmail) ||
    inboxMode === INBOX_MODES.FOLLOW_UP;
  const recipient = isFollowUp
    ? resolveFollowUpCounterparty(messagesNewestFirst, userEmail)
    : senderOf(latestMessage);

  return {
    isFollowUp,
    userEmail: extractEmailAddress(userEmail),
    recipientName: recipient.name,
    recipientEmail: recipient.email,
  };
}

interface StoredThreadEmail {
  id: string;
  from?: string | null;
  fromName?: string | null;
  body?: string | null;
  receivedAt: Date;
}

/**
 * Conversation history for the reply prompts, oldest first, without the email
 * being replied to (the prompt shows that one separately).
 */
export function toReplyThreadHistory(
  threadEmailsNewestFirst: StoredThreadEmail[],
  replyTargetId: string | null | undefined,
  userEmail: string,
) {
  return threadEmailsNewestFirst
    .filter((threadEmail) => threadEmail.id !== replyTargetId)
    .reverse()
    .map((threadEmail) => ({
      from: threadEmail.from || "",
      fromName: threadEmail.fromName || undefined,
      body: threadEmail.body || "",
      receivedAt: threadEmail.receivedAt,
      isFromUser: isFromUserAddress(threadEmail.from, userEmail),
    }));
}
