import {
  deriveRecipientDisplayName,
  extractEmailAddress,
  parseRecipientsFromString,
} from "../utils/email-address.utils";
import {
  analyzeThreadStyle,
  ThreadStyleInfo,
} from "../utils/thread-style-extractor";

export type ThreadMessage = {
  from: string;
  fromName?: string;
  to?: string;
  body: string;
  receivedAt: Date;
  isFromUser: boolean;
};

export interface RecipientResolution {
  theirName: string;
  messagesFromCurrentRecipient: ThreadMessage[];
  threadStyleInfo: ThreadStyleInfo;
}

export function resolveFollowUpRecipient(
  threadMessages: ThreadMessage[],
  userDisplayName: string,
): RecipientResolution {
  const lastUserMessage = threadMessages
    .filter((message) => message.isFromUser)
    .sort(
      (msgA, msgB) => msgB.receivedAt.getTime() - msgA.receivedAt.getTime(),
    )[0];

  if (!lastUserMessage) {
    throw new Error("No user message found in thread");
  }

  const recipientMessages = threadMessages
    .filter((message) => !message.isFromUser)
    .sort(
      (msgA, msgB) => msgB.receivedAt.getTime() - msgA.receivedAt.getTime(),
    );

  const currentRecipientEmail = extractEmailAddress(
    parseRecipientsFromString(lastUserMessage.to ?? "")[0]?.email,
  );

  const messagesFromCurrentRecipient = currentRecipientEmail
    ? recipientMessages.filter(
        (message) =>
          extractEmailAddress(message.from) === currentRecipientEmail,
      )
    : recipientMessages;

  const lastTheirMessage = messagesFromCurrentRecipient[0];
  const theirName =
    lastTheirMessage?.fromName ||
    lastTheirMessage?.from ||
    deriveRecipientDisplayName(lastUserMessage.to) ||
    "there";

  const threadStyleInfo = analyzeThreadStyle(
    messagesFromCurrentRecipient,
    userDisplayName,
  );

  return { theirName, messagesFromCurrentRecipient, threadStyleInfo };
}
