import { Logger } from "@nestjs/common";
import { AxiosInstance } from "axios";

import { HTTP_STATUS } from "../../../constants/http-status";
import { QUERY_LIMITS } from "../../../constants/query-limits";
import { isApiError } from "../../../types/common";
import { EmailAttachmentData } from "../../interfaces/email-provider.interface";
import { MicrosoftGraphMessage } from "./office365-message-parser";

/**
 * Maps our attachment shape onto Microsoft Graph `fileAttachment` resources,
 * which carry the file inline as base64 `contentBytes` on the sendMail message.
 */
function buildOffice365Attachments(
  attachments: EmailAttachmentData[],
): Array<Record<string, unknown>> {
  return attachments.map((attachment) => {
    // Live sends pass a Buffer; scheduled sends replay base64 strings from the
    // DB (already in the contentBytes format Graph expects).
    const content = attachment.content as Buffer | string;
    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: attachment.filename,
      contentType: attachment.mimeType,
      contentBytes: Buffer.isBuffer(content)
        ? content.toString("base64")
        : content,
      ...(attachment.contentId
        ? { contentId: attachment.contentId, isInline: true }
        : {}),
    };
  });
}

const logger = new Logger("Office365Operations");

/**
 * Archive a thread in Office365 by marking messages as read and moving to archive
 */
export async function archiveThreadInOffice365(
  userId: string,
  threadId: string,
  graphClient: AxiosInstance,
): Promise<{ success: boolean; archivedCount: number; totalCount: number }> {
  logger.log(
    `[Office365 Archive] Fetching messages for conversation: userId=${userId}, threadId=${threadId}`,
  );

  const response = await graphClient.get("/me/messages", {
    params: {
      $filter: `conversationId eq '${threadId}'`,
      $select: "id",
    },
  });

  const messages = response.data.value || [];
  logger.log(
    `[Office365 Archive] Found ${messages.length} messages in conversation: userId=${userId}, threadId=${threadId}`,
  );

  // Mark messages as read and move to archive folder
  let archivedCount = 0;
  for (const msg of messages) {
    try {
      // First mark the message as read
      logger.log(
        `[Office365 Archive] Marking message as read: userId=${userId}, threadId=${threadId}, messageId=${msg.id}`,
      );
      await graphClient.patch(`/me/messages/${msg.id}`, {
        isRead: true,
      });

      // Then move to archive folder
      logger.log(
        `[Office365 Archive] Moving message to archive: userId=${userId}, threadId=${threadId}, messageId=${msg.id}`,
      );
      await graphClient.post(`/me/messages/${msg.id}/move`, {
        destinationId: "archive",
      });
      archivedCount++;
    } catch (error) {
      logger.error(
        `[Office365 Archive] Failed to archive message ${msg.id}:`,
        error,
      );
    }
  }

  logger.log(
    `[Office365 Archive] Marked as read and moved ${archivedCount}/${messages.length} messages to archive: userId=${userId}, threadId=${threadId}`,
  );

  return {
    success: archivedCount > 0 || messages.length === 0,
    archivedCount,
    totalCount: messages.length,
  };
}

/**
 * Unarchive a thread in Office365 by moving messages back to inbox
 */
export async function unarchiveThreadInOffice365(
  userId: string,
  threadId: string,
  graphClient: AxiosInstance,
): Promise<{ success: boolean; movedCount: number; totalCount: number }> {
  // Get all messages in the conversation from archive
  const archiveResponse = await graphClient.get(
    "/me/mailFolders/archive/messages",
    {
      params: {
        $filter: `conversationId eq '${threadId}'`,
        $select: "id",
      },
    },
  );

  const messages = archiveResponse.data.value || [];
  let movedCount = 0;

  // Move messages back to inbox
  for (const msg of messages) {
    try {
      await graphClient.post(`/me/messages/${msg.id}/move`, {
        destinationId: "inbox",
      });
      movedCount++;
    } catch (error) {
      logger.error(`Failed to unarchive message ${msg.id}:`, error);
    }
  }

  return {
    success: movedCount > 0 || messages.length === 0,
    movedCount,
    totalCount: messages.length,
  };
}

/**
 * Parse a comma-separated recipient string (supports "Name <email>" format)
 * into an array of Office365 emailAddress objects.
 */
function parseRecipientsToOffice365(
  recipientStr: string,
): Array<{ emailAddress: { address: string; name?: string } }> {
  return recipientStr
    .split(",")
    .map((recipient) => recipient.trim())
    .filter((recipient) => recipient.length > 0)
    .map((recipient) => {
      const match = recipient.match(/^(.*?)\s*<([^>]+)>$/);
      if (match) {
        const name = match[1].trim();
        const address = match[2].trim();
        return { emailAddress: name ? { address, name } : { address } };
      }
      return { emailAddress: { address: recipient } };
    });
}

/**
 * Send a reply email via Office365
 */
export async function sendReplyViaOffice365(
  graphClient: AxiosInstance,
  params: {
    to: string;
    subject: string;
    htmlBody: string;
    cc?: string;
    bcc?: string;
  },
): Promise<{ messageId: string }> {
  const { to, subject, htmlBody, cc, bcc } = params;
  const message: Record<string, unknown> = {
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    body: {
      contentType: "HTML",
      content: htmlBody,
    },
    toRecipients: parseRecipientsToOffice365(to),
  };

  if (cc) {
    message.ccRecipients = parseRecipientsToOffice365(cc);
  }

  if (bcc) {
    message.bccRecipients = parseRecipientsToOffice365(bcc);
  }

  const response = await graphClient.post("/me/sendMail", { message });

  return {
    messageId: response?.data?.id || `office365-${Date.now()}`,
  };
}

/**
 * Send a new email via Office365
 */
export async function sendEmailViaOffice365(
  graphClient: AxiosInstance,
  params: {
    to: Array<{ email: string; name?: string }>;
    subject: string;
    htmlBody: string;
    cc?: Array<{ email: string; name?: string }>;
    bcc?: Array<{ email: string; name?: string }>;
    attachments?: EmailAttachmentData[];
  },
): Promise<{ messageId: string; threadId: string }> {
  const { to, subject, htmlBody, cc, bcc, attachments } = params;
  interface Office365Recipient {
    emailAddress: { address: string; name?: string };
  }
  interface Office365MessageBody {
    subject: string;
    body: { contentType: string; content: string };
    toRecipients: Office365Recipient[];
    ccRecipients?: Office365Recipient[];
    bccRecipients?: Office365Recipient[];
    attachments?: Array<Record<string, unknown>>;
  }
  const message: Office365MessageBody = {
    subject,
    body: {
      contentType: "HTML",
      content: htmlBody,
    },
    toRecipients: to.map((recipient) => ({
      emailAddress: {
        address: recipient.email,
        name: recipient.name,
      },
    })),
  };

  if (cc && cc.length > 0) {
    message.ccRecipients = cc.map((recipient) => ({
      emailAddress: {
        address: recipient.email,
        name: recipient.name,
      },
    }));
  }

  if (bcc && bcc.length > 0) {
    message.bccRecipients = bcc.map((recipient) => ({
      emailAddress: {
        address: recipient.email,
        name: recipient.name,
      },
    }));
  }

  if (attachments && attachments.length > 0) {
    message.attachments = buildOffice365Attachments(attachments);
  }

  await graphClient.post("/me/sendMail", {
    message,
  });

  // Microsoft Graph doesn't return messageId directly, so we'll use a generated one
  const messageId = `msg-${Date.now()}-${Math.random().toString(QUERY_LIMITS.RANDOM_BASE_36).substr(QUERY_LIMITS.RANDOM_STRING_START, QUERY_LIMITS.RANDOM_STRING_LENGTH)}`;
  // Microsoft uses conversationId, but we'll use messageId as fallback
  const threadId = messageId;

  return { messageId, threadId };
}

/**
 * Search emails via Office365
 */
export async function searchEmailsViaOffice365(
  graphClient: AxiosInstance,
  query: string,
  maxResults: number,
): Promise<MicrosoftGraphMessage[]> {
  // Microsoft Graph search syntax
  const searchQuery =
    query.includes("from:") || query.includes("subject:")
      ? query
      : `subject:"${query}" OR from:"${query}" OR body:"${query}"`;

  const response = await graphClient.get("/me/messages", {
    params: {
      $search: searchQuery,
      $top: maxResults,
      $select:
        "id,subject,from,receivedDateTime,isRead,body,bodyPreview,conversationId,importance",
    },
  });

  return response.data.value || [];
}

/**
 * Fetch all messages in a thread via Office365 using conversationId filter.
 */
export async function fetchThreadMessagesViaOffice365(
  graphClient: AxiosInstance,
  threadId: string,
  limit: number,
): Promise<MicrosoftGraphMessage[]> {
  const response = await graphClient.get("/me/messages", {
    params: {
      $filter: `conversationId eq '${threadId}'`,
      $top: limit,
      $select:
        "id,subject,from,receivedDateTime,isRead,body,bodyPreview,conversationId,importance",
    },
  });

  return response.data.value || [];
}

/**
 * Handle auth error with retry using refreshed token
 */
export function isAuthError(error: unknown): boolean {
  const apiError = isApiError(error) ? error : null;
  return (
    apiError?.code === HTTP_STATUS.UNAUTHORIZED ||
    (apiError?.response &&
      apiError.response.status === HTTP_STATUS.UNAUTHORIZED)
  );
}
