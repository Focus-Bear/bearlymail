import { gmail_v1 } from "googleapis";

import { GmailSearchResult } from "../../email-search.types";
import {
  EmailAttachment,
  RawEmailMessage,
} from "../../interfaces/email-provider.interface";

/**
 * Parse Gmail message to RawEmailMessage format
 */
export function parseGmailMessage(
  messageData: gmail_v1.Schema$Message,
): RawEmailMessage | null {
  if (!messageData.id || !messageData.threadId) return null;

  const headers = messageData.payload?.headers || [];
  const subject =
    headers.find(
      (header: { name?: string; value?: string }) => header.name === "Subject",
    )?.value || "(No Subject)";
  const from =
    headers.find(
      (header: { name?: string; value?: string }) => header.name === "From",
    )?.value || "";
  const to =
    headers.find(
      (header: { name?: string; value?: string }) => header.name === "To",
    )?.value || undefined;
  const cc =
    headers.find(
      (header: { name?: string; value?: string }) => header.name === "Cc",
    )?.value || undefined;
  const labelIds = messageData.labelIds || [];
  const starCount = labelIds.includes("STARRED") ? 3 : 0;

  const fromMatch = from.match(/(.*)<(.+)>/);
  const fromName = fromMatch ? fromMatch[1].trim() : undefined;
  const fromEmail = fromMatch ? fromMatch[2].trim() : from;

  const { body, htmlBody } = extractBodyFromPayload(
    messageData.payload,
    messageData.snippet,
  );

  const attachments = extractAttachmentsFromPayload(messageData.payload);

  return {
    messageId: messageData.id,
    threadId: messageData.threadId,
    subject,
    from: fromEmail,
    fromName,
    to,
    cc,
    body,
    htmlBody,
    starCount,
    receivedAt: messageData.internalDate
      ? new Date(parseInt(messageData.internalDate, 10))
      : new Date(),
    isRead: !labelIds.includes("UNREAD"),
    labelIds,
    attachments,
  };
}

/**
 * Extract body content from Gmail message payload
 */
export function extractBodyFromPayload(
  payload: gmail_v1.Schema$MessagePart | undefined,
  snippet: string | null | undefined,
): { body: string; htmlBody?: string } {
  let body = "";
  let htmlBody: string | undefined;

  if (!payload) {
    return { body: snippet || "(No content)", htmlBody: undefined };
  }

  // Helper function to recursively find body parts
  const findBodyParts = (part: gmail_v1.Schema$MessagePart): void => {
    if (part.mimeType === "text/plain" && part.body?.data) {
      const decoded = Buffer.from(part.body.data, "base64").toString("utf-8");
      if (!body) body = decoded;
    } else if (part.mimeType === "text/html" && part.body?.data) {
      const decoded = Buffer.from(part.body.data, "base64").toString("utf-8");
      if (!htmlBody) htmlBody = decoded;
    }

    // Recursively check parts
    if (part.parts) {
      for (const subPart of part.parts) {
        findBodyParts(subPart);
      }
    }
  };

  // Check if payload has direct body
  if (payload.body?.data && payload.mimeType === "text/plain") {
    body = Buffer.from(payload.body.data, "base64").toString("utf-8");
  } else if (payload.body?.data && payload.mimeType === "text/html") {
    htmlBody = Buffer.from(payload.body.data, "base64").toString("utf-8");
  }

  // Check parts recursively
  if (payload.parts) {
    for (const part of payload.parts) {
      findBodyParts(part);
    }
  }

  // Ensure body is never empty (DB constraint)
  if (!body || body.trim() === "") {
    if (htmlBody) {
      body = htmlBody.replace(/<[^>]*>/g, "").trim();
    }
    if (!body || body.trim() === "") {
      body = snippet || "(No content)";
    }
  }

  return { body, htmlBody };
}

/**
 * Extract attachment metadata from Gmail message payload
 */
export function extractAttachmentsFromPayload(
  payload: gmail_v1.Schema$MessagePart | undefined,
): EmailAttachment[] | undefined {
  if (!payload) return undefined;

  const attachments: EmailAttachment[] = [];

  const findAttachments = (part: gmail_v1.Schema$MessagePart): void => {
    // Check if this part is an attachment
    if (part.filename && part.filename !== "" && part.body?.attachmentId) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
      });
    }

    // Recursively check parts
    if (part.parts) {
      for (const subPart of part.parts) {
        findAttachments(subPart);
      }
    }
  };

  findAttachments(payload);

  return attachments.length > 0 ? attachments : undefined;
}

/**
 * Parse a Gmail message fetched with format:"metadata" into a GmailSearchResult.
 * This is ~10x faster than parseGmailMessage because it skips body/attachment parsing.
 *
 * @param messageData - The Gmail API message resource (metadata format)
 * @returns GmailSearchResult or null if messageId / threadId are missing
 */
export function parseGmailMetadata(
  messageData: gmail_v1.Schema$Message,
): GmailSearchResult | null {
  if (!messageData.id || !messageData.threadId) return null;

  const headers = messageData.payload?.headers || [];

  const getHeader = (name: string): string =>
    headers.find(
      (header: { name?: string; value?: string }) =>
        header.name?.toLowerCase() === name.toLowerCase(),
    )?.value ?? "";

  const subject = getHeader("Subject") || "(No Subject)";
  const from = getHeader("From");
  const dateHeader = getHeader("Date");

  // Parse "Name <email>" or plain email
  const fromMatch = from.match(/(.*)<(.+)>/);
  const fromName = fromMatch ? fromMatch[1].trim() : undefined;
  const fromEmail = fromMatch ? fromMatch[2].trim() : from;

  const labelIds = messageData.labelIds || [];

  // Parse date — prefer internalDate (epoch ms) over the Date header string
  let date: string;
  if (messageData.internalDate) {
    date = new Date(parseInt(messageData.internalDate, 10)).toISOString();
  } else if (dateHeader) {
    date = new Date(dateHeader).toISOString();
  } else {
    date = new Date().toISOString();
  }

  return {
    messageId: messageData.id,
    threadId: messageData.threadId,
    subject,
    from: fromEmail,
    fromName: fromName || undefined,
    date,
    snippet: messageData.snippet || "",
    isRead: !labelIds.includes("UNREAD"),
    labelIds,
    enrichmentStatus: "pending",
  };
}
