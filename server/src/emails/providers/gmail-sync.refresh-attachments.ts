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
  await emailsService.updateEmail(userId, email.id, { attachments });

  return {
    gmailMessageId: email.messageId,
    attachments,
  };
}

type EmailRefreshResult = {
  emailId: string;
  gmailMessageId: string;
  attachments: EmailAttachment[] | null;
  gmailCount: number | null;
  dbCount: number | null;
  dbError?: string;
  error?: string;
};

async function verifyDbAttachments(
  emailsService: EmailsService,
  logger: Logger,
  userId: string,
  emailId: string,
  gmailCount: number,
): Promise<{ dbCount: number | null; dbError?: string }> {
  try {
    const verified = await emailsService.getEmailById(userId, emailId);
    const verifiedAttachments = verified?.attachments;
    let dbCount: number | null = null;
    if (Array.isArray(verifiedAttachments)) {
      dbCount = verifiedAttachments.length;
    } else if (verifiedAttachments === null) {
      dbCount = 0;
    }
    logger.log(
      `refreshAttachmentsFromGmailForThread: emailId=${emailId} save_verified: gmail=${gmailCount} db=${dbCount !== null ? dbCount : "non-array/null"}`,
    );
    return { dbCount };
  } catch (verifyError) {
    logger.warn(
      `refreshAttachmentsFromGmailForThread: DB verification read failed for emailId=${emailId}: ${verifyError}`,
    );
    return { dbCount: null, dbError: String(verifyError) };
  }
}

async function processEmailRefresh(
  emailsService: EmailsService,
  logger: Logger,
  gmail: gmail_v1.Gmail,
  userId: string,
  threadEmail: { id: string; messageId: string },
): Promise<EmailRefreshResult> {
  if (!threadEmail.messageId?.trim()) {
    logger.warn(
      `refreshAttachmentsFromGmailForThread: emailId=${threadEmail.id} has no Gmail messageId — skipping`,
    );
    return {
      emailId: threadEmail.id,
      gmailMessageId: "",
      attachments: null,
      gmailCount: null,
      dbCount: null,
      error: "No Gmail message ID",
    };
  }

  let attachments: EmailAttachment[] | null = null;
  try {
    const apiResponse = await gmail.users.messages.get({
      userId: "me",
      id: threadEmail.messageId,
      format: "full",
    });
    const rawEmail = parseGmailMessage(apiResponse.data);
    if (!rawEmail) {
      logger.warn(
        `refreshAttachmentsFromGmailForThread: Could not parse Gmail message for emailId=${threadEmail.id}`,
      );
      return {
        emailId: threadEmail.id,
        gmailMessageId: threadEmail.messageId,
        attachments: null,
        gmailCount: null,
        dbCount: null,
        error: "Could not parse Gmail message payload",
      };
    }
    attachments = rawEmail.attachments ?? null;
    logger.log(
      `refreshAttachmentsFromGmailForThread: emailId=${threadEmail.id} messageId=${threadEmail.messageId} gmail_attachments=${attachments?.length ?? 0}`,
    );
  } catch (error) {
    logger.warn(
      `refreshAttachmentsFromGmailForThread: Gmail API failed for messageId=${threadEmail.messageId}: ${formatGaxiosError(error)}`,
    );
    return {
      emailId: threadEmail.id,
      gmailMessageId: threadEmail.messageId,
      attachments: null,
      gmailCount: null,
      dbCount: null,
      error:
        "Could not load from Gmail. It may have been deleted or the ID may be invalid.",
    };
  }

  try {
    await emailsService.updateEmail(userId, threadEmail.id, { attachments });
  } catch (error) {
    logger.warn(
      `refreshAttachmentsFromGmailForThread: updateEmail failed for emailId=${threadEmail.id}: ${error}`,
    );
    return {
      emailId: threadEmail.id,
      gmailMessageId: threadEmail.messageId,
      attachments,
      gmailCount: attachments?.length ?? 0,
      dbCount: null,
      error: "Failed to update email in database.",
    };
  }

  const { dbCount, dbError } = await verifyDbAttachments(
    emailsService,
    logger,
    userId,
    threadEmail.id,
    attachments?.length ?? 0,
  );

  return {
    emailId: threadEmail.id,
    gmailMessageId: threadEmail.messageId,
    attachments,
    gmailCount: attachments?.length ?? 0,
    dbCount,
    dbError,
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
  threadEmailCount: number;
  results: EmailRefreshResult[];
}> {
  const { emailsService, gmailProvider, logger } = deps;

  const triggerEmail = await emailsService.getEmailById(userId, emailId);
  if (!triggerEmail) {
    throw new NotFoundException("Email not found");
  }
  if (!triggerEmail.emailThreadId) {
    throw new BadRequestException("Email is not linked to a thread");
  }

  const threadEmails = await emailsService.getThreadEmails(
    userId,
    triggerEmail.threadId,
  );
  logger.log(
    `refreshAttachmentsFromGmailForThread: userId=${userId} threadId=${triggerEmail.threadId} found ${threadEmails.length} emails in thread`,
  );

  const gmail = await gmailProvider.createGmailClientPublic(userId);
  if (!gmail) {
    throw new ServiceUnavailableException(
      "Gmail is not connected for this account",
    );
  }

  const results: EmailRefreshResult[] = [];
  for (const threadEmail of threadEmails) {
    results.push(
      await processEmailRefresh(
        emailsService,
        logger,
        gmail,
        userId,
        threadEmail,
      ),
    );
  }

  return {
    threadId: triggerEmail.threadId,
    threadEmailCount: threadEmails.length,
    results,
  };
}
