import { gmail_v1 } from "googleapis";

import { decodeRfc2047HeaderValue } from "../../../utils/rfc2047-header.util";
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
  const rawSubject =
    headers.find(
      (header: { name?: string; value?: string }) => header.name === "Subject",
    )?.value || "(No Subject)";
  const subject = decodeRfc2047HeaderValue(rawSubject);
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

function getPartHeader(
  part: gmail_v1.Schema$MessagePart,
  headerName: string,
): string | undefined {
  const { headers } = part;
  if (!headers) {
    return undefined;
  }
  const found = headers.find(
    (header) => header.name?.toLowerCase() === headerName.toLowerCase(),
  );
  return found?.value ?? undefined;
}

/**
 * Parse filename from Content-Disposition (RFC 2183 / RFC 5987 filename*).
 */
export function filenameFromContentDisposition(
  contentDisposition: string | undefined,
): string | undefined {
  if (!contentDisposition) {
    return undefined;
  }
  const starMatch = contentDisposition.match(
    /filename\*=(?:UTF-8''|utf-8'')([^;\s]+)/i,
  );
  if (starMatch) {
    try {
      return decodeURIComponent(starMatch[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return starMatch[1];
    }
  }
  const quotedMatch = contentDisposition.match(
    /filename\s*=\s*"((?:\\.|[^"\\])*)"/i,
  );
  if (quotedMatch) {
    return quotedMatch[1].replace(/\\"/g, '"');
  }
  const plainMatch = contentDisposition.match(/filename\s*=\s*([^;\s]+)/i);
  if (plainMatch) {
    return plainMatch[1].replace(/^"|"$/g, "");
  }
  return undefined;
}

function resolveAttachmentFilename(part: gmail_v1.Schema$MessagePart): string {
  const fromApi = part.filename?.trim();
  if (fromApi) {
    return fromApi;
  }
  return (
    filenameFromContentDisposition(
      getPartHeader(part, "Content-Disposition"),
    )?.trim() || ""
  );
}

/**
 * Skip inline CID images and similar parts that are not user-visible attachments.
 */
function shouldSkipLikelyInlinePart(
  part: gmail_v1.Schema$MessagePart,
): boolean {
  const cdRaw = getPartHeader(part, "Content-Disposition") ?? "";
  const cd = cdRaw.toLowerCase();
  const hasCid = !!getPartHeader(part, "Content-ID");
  if (hasCid && cd.includes("inline") && !cd.includes("attachment")) {
    return true;
  }
  const filename = resolveAttachmentFilename(part);
  if (filename !== "") {
    return false;
  }
  const mime = (part.mimeType ?? "").toLowerCase();
  if (!mime.startsWith("image/")) {
    return false;
  }
  if (cd.includes("attachment")) {
    return false;
  }
  return cd.includes("inline");
}

/** MIME types that represent iCalendar data. */
const CALENDAR_MIME_TYPES = new Set(["text/calendar", "application/ics"]);

/**
 * Normalise a raw `Content-ID` header into the form referenced by
 * `<img src="cid:...">` in the HTML body — surrounding angle brackets and
 * whitespace removed (`<inline-xxx@domain>` -> `inline-xxx@domain`).
 */
function normalizeContentId(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim().replace(/^<|>$/g, "").trim();
  return trimmed || undefined;
}

/**
 * Regular, user-visible attachment (or null when the part should be skipped).
 * A contentId is still captured when present so the client can resolve cid:
 * references even when Gmail reports the part with Content-Disposition:
 * attachment (common for large inline images).
 */
function buildRegularAttachment(
  part: gmail_v1.Schema$MessagePart,
): EmailAttachment | null {
  const attachmentId = part.body?.attachmentId;
  if (!attachmentId || shouldSkipLikelyInlinePart(part)) {
    return null;
  }
  const contentId = normalizeContentId(getPartHeader(part, "Content-ID"));
  return {
    attachmentId,
    filename: resolveAttachmentFilename(part) || "attachment",
    mimeType: part.mimeType || "application/octet-stream",
    size: part.body?.size ?? 0,
    ...(contentId ? { contentId } : {}),
  };
}

/**
 * Large inline image: Gmail gave it an attachmentId but it is referenced via
 * cid: in the HTML body. Store the CID so the client can resolve it via the
 * attachments API when rendering. Returns null when the part is not one.
 */
function buildLargeInlineImageAttachment(
  part: gmail_v1.Schema$MessagePart,
): EmailAttachment | null {
  const attachmentId = part.body?.attachmentId;
  if (!attachmentId || !shouldSkipLikelyInlinePart(part)) {
    return null;
  }
  const contentId = normalizeContentId(getPartHeader(part, "Content-ID"));
  if (!contentId) {
    return null;
  }
  return {
    attachmentId,
    filename: resolveAttachmentFilename(part) || "inline-image",
    mimeType: part.mimeType || "application/octet-stream",
    size: part.body?.size ?? 0,
    contentId,
  };
}

/**
 * Inline calendar part: Gmail embeds small ICS files directly in body.data
 * rather than giving them a separate attachmentId. Captured with a synthetic ID
 * so the IcsInviteCard can detect and serve them. Returns null otherwise.
 */
function buildInlineCalendarAttachment(
  part: gmail_v1.Schema$MessagePart,
  syntheticIndex: number,
): EmailAttachment | null {
  const { body } = part;
  if (body?.attachmentId || !body?.data) {
    return null;
  }
  const mimeType = (part.mimeType ?? "").toLowerCase();
  if (!CALENDAR_MIME_TYPES.has(mimeType)) {
    return null;
  }
  return {
    attachmentId: `inline-ics-${syntheticIndex}`,
    filename: resolveAttachmentFilename(part) || "invite.ics",
    mimeType: mimeType || "text/calendar",
    size: body.size ?? 0,
    inlineData: body.data,
  };
}

/**
 * Small inline image: Gmail embedded the image bytes directly in body.data.
 * Store the base64 content so the client can render it via a data: URI without
 * a round-trip. Returns null otherwise.
 */
function buildSmallInlineImageAttachment(
  part: gmail_v1.Schema$MessagePart,
  syntheticIndex: number,
): EmailAttachment | null {
  const { body } = part;
  if (body?.attachmentId || !body?.data) {
    return null;
  }
  const mimeType = (part.mimeType ?? "").toLowerCase();
  if (!mimeType.startsWith("image/")) {
    return null;
  }
  const contentId = normalizeContentId(getPartHeader(part, "Content-ID"));
  if (!contentId) {
    return null;
  }
  return {
    attachmentId: `inline-img-${syntheticIndex}`,
    filename: resolveAttachmentFilename(part) || "inline-image",
    mimeType,
    size: body.size ?? 0,
    contentId,
    inlineData: body.data,
  };
}

/**
 * Classify a single Gmail message part into an EmailAttachment, or null if the
 * part is not a user-relevant attachment.
 *
 * @param syntheticIndex - stable index for inline parts that have no Gmail
 *                         attachment ID (so each gets a unique synthetic ID).
 */
function buildAttachmentFromPart(
  part: gmail_v1.Schema$MessagePart,
  syntheticIndex: number,
): EmailAttachment | null {
  return (
    buildRegularAttachment(part) ??
    buildLargeInlineImageAttachment(part) ??
    buildInlineCalendarAttachment(part, syntheticIndex) ??
    buildSmallInlineImageAttachment(part, syntheticIndex)
  );
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
    const attachment = buildAttachmentFromPart(part, attachments.length);
    if (attachment) {
      attachments.push(attachment);
    }

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

  const subject = decodeRfc2047HeaderValue(
    getHeader("Subject") || "(No Subject)",
  );
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
