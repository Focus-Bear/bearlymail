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
  replyTo?: Array<{
    emailAddress?: {
      address?: string;
      name?: string;
    };
  }>;
  toRecipients?: Array<{
    emailAddress?: {
      address?: string;
      name?: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress?: {
      address?: string;
      name?: string;
    };
  }>;
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
  categories?: string[];
}

/**
 * Format an array of Microsoft Graph recipients into a comma-separated
 * RFC-style string: "Name <address>" or just "address".
 */
function formatRecipients(
  recipients?: Array<{ emailAddress?: { address?: string; name?: string } }>,
): string | undefined {
  if (!recipients || recipients.length === 0) return undefined;
  const formatted = recipients
    .map((recipient) => {
      const addr = recipient.emailAddress?.address;
      const name = recipient.emailAddress?.name;
      if (!addr) return null;
      return name ? `${name} <${addr}>` : addr;
    })
    .filter(Boolean)
    .join(", ");
  return formatted || undefined;
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
  const replyTo = messageData.replyTo?.[0]?.emailAddress?.address || undefined;
  const subject = messageData.subject || "(No Subject)";
  const threadId = messageData.conversationId || messageData.id;
  const importance = messageData.importance || "normal";
  let starCount: number;
  if (importance === "high") {
    starCount = 3;
  } else if (importance === "low") {
    starCount = 1;
  } else {
    starCount = 0;
  }

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
    replyTo,
    to: formatRecipients(messageData.toRecipients),
    cc: formatRecipients(messageData.ccRecipients),
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
