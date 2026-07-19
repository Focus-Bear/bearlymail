import {
  AppleMailMessageDetail,
  AppleMailMessageSummary,
} from "../../../apple-mail-accounts/apple-mail-script.service";
import {
  EmailAttachment,
  RawEmailMessage,
} from "../../interfaces/email-provider.interface";

/** Strips enclosing angle brackets from an RFC-822 message ID. */
export function normalizeMessageId(id: string): string {
  return (id || "").replace(/^</, "").replace(/>$/, "").trim();
}

/** Parses "Display Name <user@host>" (or a bare address) into parts. */
export function parseAddress(raw: string): { email: string; name?: string } {
  const match = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(raw || "");
  if (match) {
    const name = match[1].trim();
    return { email: match[2].trim(), name: name || undefined };
  }
  return { email: (raw || "").trim() };
}

/**
 * Extracts a header value from Mail.app's `allHeaders` blob, unfolding
 * RFC-5322 continuation lines (lines starting with whitespace).
 */
export function extractHeader(
  allHeaders: string,
  headerName: string,
): string | null {
  if (!allHeaders) return null;
  const lines = allHeaders.split(/\r\n|\r|\n/);
  const prefix = `${headerName.toLowerCase()}:`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().startsWith(prefix)) {
      let value = lines[i].substring(prefix.length);
      for (let j = i + 1; j < lines.length; j++) {
        if (/^[ \t]/.test(lines[j])) {
          value += ` ${lines[j].trim()}`;
        } else {
          break;
        }
      }
      return value.trim();
    }
  }
  return null;
}

/** Extracts all <id> tokens from a References / In-Reply-To header value. */
function extractMessageIdTokens(headerValue: string | null): string[] {
  if (!headerValue) return [];
  const tokens = headerValue.match(/<[^<>]+>/g) || [];
  return tokens.map(normalizeMessageId);
}

/**
 * Derives a stable thread ID for a message. Apple Mail exposes no thread /
 * conversation ID via AppleScript, so we use the RFC-822 chain: the first
 * entry of References is the thread root; failing that In-Reply-To (parent ==
 * root for two-message threads); failing that the message is its own root.
 */
export function deriveThreadId(allHeaders: string, messageId: string): string {
  const references = extractMessageIdTokens(
    extractHeader(allHeaders, "References"),
  );
  if (references.length > 0) return references[0];
  const inReplyTo = extractMessageIdTokens(
    extractHeader(allHeaders, "In-Reply-To"),
  );
  if (inReplyTo.length > 0) return inReplyTo[0];
  return normalizeMessageId(messageId);
}

/**
 * Combines a summary row and its detail fetch into the provider-neutral
 * RawEmailMessage shape. Mail.app only exposes the plain-text rendering of
 * the body via AppleScript, so htmlBody is never populated. The RFC-822
 * message ID comes from the detail fetch (summaries omit it — reading it is
 * ~300ms/message), falling back to the raw Message-Id header.
 */
export function parseAppleMailMessage(
  summary: AppleMailMessageSummary,
  detail: AppleMailMessageDetail,
): RawEmailMessage | null {
  const messageId = normalizeMessageId(
    detail.messageId || extractHeader(detail.allHeaders, "Message-Id") || "",
  );
  if (!messageId) return null;

  const sender = parseAddress(summary.sender);
  const attachments: EmailAttachment[] = (detail.attachments || [])
    .filter((attachment) => attachment.name)
    .map((attachment) => ({
      attachmentId: attachment.id || attachment.name,
      filename: attachment.name,
      mimeType: attachment.mimeType || "application/octet-stream",
      size: attachment.fileSize || 0,
    }));

  return {
    messageId,
    threadId: deriveThreadId(detail.allHeaders, messageId),
    subject: summary.subject || "(no subject)",
    from: sender.email,
    fromName: sender.name,
    to: extractHeader(detail.allHeaders, "To") || undefined,
    cc: extractHeader(detail.allHeaders, "Cc") || undefined,
    replyTo: extractHeader(detail.allHeaders, "Reply-To") || undefined,
    body: detail.content || "",
    starCount: summary.isFlagged ? 3 : 0,
    receivedAt: new Date(summary.dateReceivedMs),
    isRead: summary.isRead,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}
