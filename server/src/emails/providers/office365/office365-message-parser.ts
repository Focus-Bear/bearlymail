import { RawEmailMessage } from "../../interfaces/email-provider.interface";

/**
 * Microsoft Graph API message interface
 */
export interface MicrosoftGraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: {
    emailAddress?: {
      address?: string;
      name?: string;
    };
  };
  receivedDateTime?: string;
  isRead?: boolean;
  body?: {
    contentType?: string;
    content?: string;
  };
  bodyPreview?: string;
  importance?: "low" | "normal" | "high";
  parentFolderId?: string;
  webLink?: string;
}

/**
 * Parse Microsoft Graph message to RawEmailMessage format
 */
export function parseOffice365Message(
  messageData: MicrosoftGraphMessage,
): RawEmailMessage | null {
  if (!messageData.id) {
    return null;
  }

  const from = messageData.from?.emailAddress?.address || "";
  const fromName = messageData.from?.emailAddress?.name || "";
  const subject = messageData.subject || "(No Subject)";
  const threadId = messageData.conversationId || messageData.id;
  const importance = messageData.importance || "normal";
  const starCount = importance === "high" ? 3 : importance === "low" ? 1 : 0;

  // Extract body content
  const bodyContent =
    messageData.body?.content || messageData.bodyPreview || "";
  const isHtml = messageData.body?.contentType === "html";
  const htmlBody = isHtml ? bodyContent : undefined;
  const body = isHtml
    ? bodyContent.replace(/<[^>]*>/g, "").trim() ||
      messageData.bodyPreview ||
      "(No content)"
    : bodyContent || "(No content)";

  return {
    messageId: messageData.id,
    threadId,
    subject,
    from,
    fromName,
    body,
    htmlBody,
    starCount,
    receivedAt: messageData.receivedDateTime
      ? new Date(messageData.receivedDateTime)
      : new Date(),
    isRead: messageData.isRead || false,
  };
}

/**
 * Extract body content from Microsoft Graph message
 */
export function extractBodyFromOffice365Message(
  messageData: MicrosoftGraphMessage,
): { body: string; htmlBody?: string } {
  const bodyContent =
    messageData.body?.content || messageData.bodyPreview || "";
  const isHtml = messageData.body?.contentType === "html";

  let body = "";
  let htmlBody: string | undefined;

  if (isHtml) {
    htmlBody = bodyContent;
    // Strip HTML tags for plain text body
    body = bodyContent.replace(/<[^>]*>/g, "").trim();
  } else {
    body = bodyContent;
  }

  // Ensure body is never empty (required by DB constraint)
  if (!body || body.trim() === "") {
    if (htmlBody) {
      body = htmlBody.replace(/<[^>]*>/g, "").trim();
    }
    if (!body || body.trim() === "") {
      body = messageData.bodyPreview || "(No content)";
    }
  }

  return { body, htmlBody };
}
