import { EMAIL_IMPORTANCE } from "../../../constants/domain-types";
import { MS_PER_SECOND } from "../../../constants/time-constants";
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
  /** Comma-separated "Name <email>" or "email" format */
  toAddress?: string;
  /** Comma-separated "Name <email>" or "email" format */
  ccAddress?: string;
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

function importanceToStarCount(
  importance: ZohoMailMessage["importance"],
): number {
  if (importance === EMAIL_IMPORTANCE.HIGH) return 3;
  if (importance === EMAIL_IMPORTANCE.LOW) return 1;
  return 0;
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
  const starCount = importanceToStarCount(messageData.importance || "normal");

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
    to: messageData.toAddress || undefined,
    cc: messageData.ccAddress || undefined,
    body,
    htmlBody: htmlBody || undefined,
    starCount,
    receivedAt: messageData.receivedTime
      ? new Date(messageData.receivedTime * MS_PER_SECOND)
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
