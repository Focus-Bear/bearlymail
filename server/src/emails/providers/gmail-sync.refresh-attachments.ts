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

/**
 * Re-fetches attachment metadata from Gmail for ALL emails in the same thread.
 * Used by the "Refresh attachments from Gmail" debug feature when users expect
 * the entire thread's attachments to be refreshed, not just one email.
 */
export async function refreshAttachmentsFromGmailForThread(
  deps: {
    emailsService: EmailsService;
    gmailProvider: GmailProvider;
    logger: Logger;
  },
  userId: string,
  emailId: string,
): Promise<{
  threadId: string;
  results: Array<{
    emailId: string;
    gmailMessageId: string;
    attachments: EmailAttachment[] | null;
    error?: string;
  }>;
}> {
  const { emailsService, gmailProvider, logger } = deps;

  // 1. Find the trigger email to get the thread
  const triggerEmail = await emailsService.getEmailById(userId, emailId);
  if (!triggerEmail) {
    throw new NotFoundException("Email not found");
  }
  if (!triggerEmail.emailThreadId) {
    throw new BadRequestException("Email is not linked to a thread");
  }

  // 2. Find all emails in this thread using the provider thread ID (not the internal UUID)
  const threadEmails = await emailsService.getThreadEmails(
    userId,
    triggerEmail.threadId,
  );

  // 3. Create Gmail client once (not per email)
  const gmail = await gmailProvider.createGmailClientPublic(userId);
  if (!gmail) {
    throw new ServiceUnavailableException(
      "Gmail is not connected for this account",
    );
  }

  // 4. Process each email sequentially to avoid rate limits
  const results = [];
  for (const threadEmail of threadEmails) {
    if (!threadEmail.messageId?.trim()) {
      results.push({
        emailId: threadEmail.id,
        gmailMessageId: "",
        attachments: null,
        error: "No Gmail message ID",
      });
      continue;
    }

    let attachments = null;
    try {
      const apiResponse = await gmail.users.messages.get({
        userId: "me",
        id: threadEmail.messageId,
        format: "full",
      });
      const rawEmail = parseGmailMessage(apiResponse.data);
      attachments = rawEmail?.attachments ?? null;
    } catch (error) {
      logger.warn(
        `refreshAttachmentsFromGmailForThread: Gmail API failed for messageId=${threadEmail.messageId}: ${formatGaxiosError(error)}`,
      );
      results.push({
        emailId: threadEmail.id,
        gmailMessageId: threadEmail.messageId,
        attachments: null,
        error:
          "Could not load from Gmail. It may have been deleted or the ID may be invalid.",
      });
      continue;
    }

    try {
      await emailsService.updateEmail(threadEmail.id, { attachments });
    } catch (error) {
      logger.warn(
        `refreshAttachmentsFromGmailForThread: updateEmail failed for emailId=${threadEmail.id}: ${error}`,
      );
      results.push({
        emailId: threadEmail.id,
        gmailMessageId: threadEmail.messageId,
        attachments: null,
        error: "Failed to update email in database.",
      });
      continue;
    }

    results.push({
      emailId: threadEmail.id,
      gmailMessageId: threadEmail.messageId,
      attachments,
    });
  }

  return { threadId: triggerEmail.threadId, results };
}
