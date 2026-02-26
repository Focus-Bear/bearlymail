import { RawEmailMessage } from "../../interfaces/email-provider.interface";

/**
 * Zoho Mail API message interface
 */
export interface ZohoMailMessage {
  uid?: string;
  threadId?: string;
  subject?: string;
  from?: {
    address?: string;
    personal?: string;
  };
  replyTo?: {
    address?: string;
    personal?: string;
  };
  receivedTime?: number;
  isRead?: boolean;
  content?: {
    html?: string;
    text?: string;
  };
  body?: string;
  importance?: "low" | "normal" | "high";
  folderId?: string;
  folderName?: string;
  tags?: string[];
}

/**
 * Parse Zoho Mail message to RawEmailMessage format
 */
export function parseZohoMessage(
  messageData: ZohoMailMessage,
): RawEmailMessage | null {
  if (!messageData.uid || !messageData.threadId) {
    return null;
  }

  const from = messageData.from?.address || "";
  const fromName = messageData.from?.personal || "";
  const replyTo = messageData.replyTo?.address || undefined;
  const subject = messageData.subject || "(No Subject)";
  const { threadId } = messageData;
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
  const htmlBody = messageData.content?.html || messageData.body || "";
  const bodyText = messageData.content?.text || "";
  const body =
    bodyText ||
    (htmlBody ? htmlBody.replace(/<[^>]*>/g, "").trim() : "") ||
    "(No content)";

  return {
    messageId: messageData.uid,
    threadId,
    subject,
    from,
    fromName,
    replyTo,
    body,
    htmlBody: htmlBody || undefined,
    starCount,
    receivedAt: messageData.receivedTime
      ? new Date(messageData.receivedTime * 1000)
      : new Date(),
    isRead: messageData.isRead || false,
  };
}

/**
 * Extract body content from Zoho Mail message
 */
export function extractBodyFromZohoMessage(messageData: ZohoMailMessage): {
  body: string;
  htmlBody?: string;
} {
  const htmlBody = messageData.content?.html || messageData.body || "";
  const bodyText = messageData.content?.text || "";

  let body = "";
  let htmlBodyResult: string | undefined;

  if (htmlBody) {
    htmlBodyResult = htmlBody;
    body = bodyText || htmlBody.replace(/<[^>]*>/g, "").trim();
  } else {
    body = bodyText;
  }

  // Ensure body is never empty (required by DB constraint)
  if (!body || body.trim() === "") {
    if (htmlBodyResult) {
      body = htmlBodyResult.replace(/<[^>]*>/g, "").trim();
    }
    if (!body || body.trim() === "") {
      body = "(No content)";
    }
  }

  return { body, htmlBody: htmlBodyResult };
}
