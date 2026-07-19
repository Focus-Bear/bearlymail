import {
  CONTENT_TYPES,
  EMAIL_IMPORTANCE,
} from "../../../constants/domain-types";
import {
  EmailAttachment,
  RawEmailMessage,
} from "../../interfaces/email-provider.interface";

/**
 * Microsoft Graph API file attachment
 */
export interface MicrosoftGraphAttachment {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentId?: string;
  /** base64-encoded; present only when fetched individually */
  contentBytes?: string;
  "@odata.type"?: string;
}

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
  hasAttachments?: boolean;
  attachments?: MicrosoftGraphAttachment[];
}

/**
 * Strip angle brackets from a Content-ID value, mirroring Gmail's normalizeContentId.
 * e.g. "<image001.png@01D...>" → "image001.png@01D..."
 */
export function normalizeContentId(contentId: string): string {
  return contentId.replace(/^<|>$/g, "");
}

/**
 * Convert a Microsoft Graph attachment list into EmailAttachment[].
 * Only fileAttachments are included; referenceAttachments and itemAttachments are skipped.
 * Inline images carry a contentId so the client can resolve cid: references.
 */
export function extractAttachmentsFromGraphAttachments(
  attachments: MicrosoftGraphAttachment[],
): EmailAttachment[] | undefined {
  const result: EmailAttachment[] = [];
  for (const att of attachments) {
    if (!att.id) continue;
    const odataType = att["@odata.type"] ?? "";
    if (odataType && !odataType.includes("fileAttachment")) continue;

    const attachment: EmailAttachment = {
      attachmentId: att.id,
      filename: att.name || "attachment",
      mimeType: att.contentType || "application/octet-stream",
      size: att.size ?? 0,
    };

    if (att.isInline && att.contentId) {
      attachment.contentId = normalizeContentId(att.contentId);
    }

    result.push(attachment);
  }
  return result.length > 0 ? result : undefined;
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
  if (importance === EMAIL_IMPORTANCE.HIGH) {
    starCount = 3;
  } else if (importance === EMAIL_IMPORTANCE.LOW) {
    starCount = 1;
  } else {
    starCount = 0;
  }

  // Extract body content
  const bodyContent =
    messageData.body?.content || messageData.bodyPreview || "";
  const isHtml = messageData.body?.contentType === CONTENT_TYPES.HTML;
  const htmlBody = isHtml ? bodyContent : undefined;
  const body = isHtml
    ? bodyContent.replace(/<[^>]*>/g, "").trim() ||
      messageData.bodyPreview ||
      "(No content)"
    : bodyContent || "(No content)";

  const attachments = messageData.attachments
    ? extractAttachmentsFromGraphAttachments(messageData.attachments)
    : undefined;

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
    attachments,
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
  const isHtml = messageData.body?.contentType === CONTENT_TYPES.HTML;

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
