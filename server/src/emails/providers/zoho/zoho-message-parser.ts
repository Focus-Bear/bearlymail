import { EMAIL_IMPORTANCE } from "../../../constants/domain-types";
import { MS_PER_SECOND } from "../../../constants/time-constants";
import { RawEmailMessage } from "../../interfaces/email-provider.interface";

const ZOHO_SECONDS_EPOCH_THRESHOLD =
  10 * MS_PER_SECOND * MS_PER_SECOND * MS_PER_SECOND;

/**
 * Zoho Mail API message interface
 */
export interface ZohoMailMessage {
  uid?: string;
  messageId?: string;
  threadId?: string;
  subject?: string;

  // Zoho AU uses fromAddress/sender instead of from object
  fromAddress?: string;
  sender?: string;
  displayName?: string;

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

  // Zoho AU returns receivedTime as a string of milliseconds
  receivedTime?: number | string;

  // Zoho AU uses status ("0" = unread, "1" = read) instead of isRead boolean
  status?: string;
  status2?: string;
  isRead?: boolean;

  // Zoho AU returns content as a plain HTML string, not an object
  content?:
    | string
    | {
        html?: string;
        text?: string;
      };

  body?: string;
  summary?: string;

  importance?: "low" | "normal" | "high";
  priority?: string;

  folderId?: string;
  folderName?: string;
  tags?: string[];

  // Additional Zoho AU fields
  hasAttachment?: string;
  hasInline?: string;
  flagid?: string;
  calendarType?: number;
  sentDateInGMT?: string;
  size?: string;
}

function importanceToStarCount(
  importance: ZohoMailMessage["importance"],
): number {
  if (importance === EMAIL_IMPORTANCE.HIGH) return 3;
  if (importance === EMAIL_IMPORTANCE.LOW) return 1;
  return 0;
}

/** Zoho AU returns receivedTime in either seconds or milliseconds — normalise to ms. */
export function parseReceivedTimeMs(raw: number | string | undefined): number {
  if (!raw) return Date.now();
  const parsed = typeof raw === "string" ? parseInt(raw, 10) : raw;
  return parsed < ZOHO_SECONDS_EPOCH_THRESHOLD
    ? parsed * MS_PER_SECOND
    : parsed;
}

function resolveFromAddress(messageData: ZohoMailMessage): {
  from: string;
  fromName: string;
} {
  const from =
    messageData.fromAddress ||
    messageData.sender ||
    messageData.from?.address ||
    "";
  const fromName =
    messageData.displayName || messageData.from?.personal || from;
  return { from, fromName };
}

function resolveBodyContent(messageData: ZohoMailMessage): {
  body: string;
  htmlBody: string;
} {
  const htmlBody =
    typeof messageData.content === "string"
      ? messageData.content
      : messageData.content?.html || messageData.body || "";

  const bodyText =
    typeof messageData.content === "string"
      ? messageData.content.replace(/<[^>]*>/g, "").trim()
      : messageData.content?.text || "";

  const body =
    bodyText ||
    (htmlBody ? htmlBody.replace(/<[^>]*>/g, "").trim() : "") ||
    messageData.summary ||
    "(No content)";

  return { body, htmlBody };
}

/**
 * Parse Zoho Mail message to RawEmailMessage format
 */
export function parseZohoMessage(
  messageData: ZohoMailMessage,
): RawEmailMessage | null {
  const uid = messageData.uid || messageData.messageId;
  const { threadId } = messageData;

  if (!uid || !threadId) {
    return null;
  }

  const { from, fromName } = resolveFromAddress(messageData);
  const replyTo = messageData.replyTo?.address || undefined;
  const subject = messageData.subject || "(No Subject)";
  const starCount = importanceToStarCount(messageData.importance || "normal");
  const { body, htmlBody } = resolveBodyContent(messageData);
  const receivedAt = new Date(parseReceivedTimeMs(messageData.receivedTime));

  return {
    messageId: uid,
    threadId,
    subject,
    from,
    fromName,
    replyTo,
    to: messageData.toAddress || undefined,
    cc:
      messageData.ccAddress && messageData.ccAddress !== "Not Provided"
        ? messageData.ccAddress
        : undefined,
    body,
    htmlBody: htmlBody || undefined,
    starCount,
    receivedAt,
    isRead: messageData.status === "1" || messageData.isRead || false,
  };
}
/**
 * Extract body content from Zoho Mail message
 */
export function extractBodyFromZohoMessage(messageData: ZohoMailMessage): {
  body: string;
  htmlBody?: string;
} {
  const htmlBody =
    typeof messageData.content === "string"
      ? messageData.content
      : messageData.content?.html || messageData.body || "";

  const bodyText =
    typeof messageData.content === "string"
      ? messageData.content.replace(/<[^>]*>/g, "").trim()
      : messageData.content?.text || "";

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
