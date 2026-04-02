import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { gmail_v1 } from "googleapis";

import { formatGaxiosError } from "../../types/common";
import { EmailsService } from "../emails.service";
import { EmailAttachment } from "../interfaces/email-provider.interface";
import { GmailProvider } from "./gmail.provider";
import { parseGmailMessage } from "./gmail/gmail-message-parser";

/**
 * Re-fetches the Gmail message (format full), parses attachment metadata, and
 * overwrites the stored `attachments` JSON. Used by admin debug when DB rows
 * are missing attachments that exist in Gmail (e.g. older sync/parser gaps).
 */
export async function refreshAttachmentsFromGmailForUser(
  deps: {
    emailsService: EmailsService;
    gmailProvider: GmailProvider;
    logger: Logger;
  },
  userId: string,
  emailId: string,
): Promise<{
  gmailMessageId: string;
  attachments: EmailAttachment[] | null;
}> {
  const { emailsService, gmailProvider, logger } = deps;
  const email = await emailsService.getEmailById(userId, emailId);
  if (!email) {
    throw new NotFoundException("Email not found");
  }
  if (!email.messageId?.trim()) {
    throw new BadRequestException("Email has no Gmail message ID");
  }

  const gmail = await gmailProvider.createGmailClientPublic(userId);
  if (!gmail) {
    throw new ServiceUnavailableException(
      "Gmail is not connected for this account",
    );
  }

  let messagePayload: gmail_v1.Schema$Message;
  try {
    const apiResponse = await gmail.users.messages.get({
      userId: "me",
      id: email.messageId,
      format: "full",
    });
    messagePayload = apiResponse.data;
  } catch (error) {
    logger.warn(
      `refreshAttachmentsFromGmail: Gmail API get failed for messageId=${email.messageId}: ${formatGaxiosError(error)}`,
    );
    throw new BadRequestException(
      "Could not load this message from Gmail. It may have been deleted or the ID may be invalid.",
    );
  }

  const rawEmail = parseGmailMessage(messagePayload);
  if (!rawEmail) {
    throw new BadRequestException("Could not parse Gmail message payload");
  }

  const attachments = rawEmail.attachments ?? null;
  await emailsService.updateEmail(email.id, { attachments });

  return {
    gmailMessageId: email.messageId,
    attachments,
  };
}
