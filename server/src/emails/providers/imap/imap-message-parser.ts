import type { AddressObject, Attachment, ParsedMail } from "mailparser";

import { STAR_COUNTS } from "../../../constants/priority-constants";
import {
  EmailAttachment,
  RawEmailMessage,
} from "../../interfaces/email-provider.interface";
import {
  deriveThreadIdFromChain,
  extractMessageIdTokens,
  normalizeMessageId,
} from "../rfc822/rfc822-threading";

const NO_SUBJECT = "(no subject)";
export const DEFAULT_ATTACHMENT_MIME = "application/octet-stream";
const ATTACHMENT_PART_PREFIX = "part-";

/** IMAP state that lives outside the RFC-822 source. */
export interface ImapMessageState {
  isRead: boolean;
  isFlagged: boolean;
  /** Server receipt time; the Date header is sender-controlled and may lie. */
  internalDate?: Date;
}

/** Formats one or more parsed address headers as "Name <addr>, addr". */
export function formatAddressList(
  addresses: AddressObject | AddressObject[] | undefined,
): string | undefined {
  if (!addresses) return undefined;
  const list = Array.isArray(addresses) ? addresses : [addresses];
  const formatted = list
    .flatMap((group) => group.value)
    .filter((entry) => entry.address)
    .map((entry) =>
      entry.name ? `${entry.name} <${entry.address}>` : entry.address,
    )
    .join(", ");
  return formatted || undefined;
}

/**
 * Stable per-attachment id. IMAP has no attachment ids, and part numbers shift
 * if a server re-encodes the message, so the content checksum identifies the
 * attachment when we re-download the message to serve it.
 */
export function attachmentIdFor(attachment: Attachment, index: number): string {
  return attachment.checksum || `${ATTACHMENT_PART_PREFIX}${index}`;
}

function headerTokens(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return extractMessageIdTokens(Array.isArray(value) ? value.join(" ") : value);
}

function toAttachments(parsed: ParsedMail): EmailAttachment[] {
  return parsed.attachments.map((attachment, index) => ({
    attachmentId: attachmentIdFor(attachment, index),
    filename: attachment.filename || `${ATTACHMENT_PART_PREFIX}${index}`,
    mimeType: attachment.contentType || DEFAULT_ATTACHMENT_MIME,
    size: attachment.size || 0,
    contentId: attachment.related
      ? normalizeMessageId(attachment.cid || "") || undefined
      : undefined,
  }));
}

/** The References chain of a parsed message, as bare message IDs. */
export function referencesOf(parsed: ParsedMail): string[] {
  return headerTokens(parsed.references);
}

/**
 * Converts a parsed IMAP message to the provider-neutral shape. Messages
 * without a Message-ID header get `fallbackMessageId` (derived from the
 * mailbox UID) so they can still be stored and threaded on their own.
 */
export function parseImapMessage(
  parsed: ParsedMail,
  state: ImapMessageState,
  fallbackMessageId: string,
): RawEmailMessage {
  const messageId = normalizeMessageId(parsed.messageId || fallbackMessageId);
  const sender = parsed.from?.value[0];
  const attachments = toAttachments(parsed);
  return {
    messageId,
    threadId: deriveThreadIdFromChain({
      references: referencesOf(parsed),
      inReplyTo: headerTokens(parsed.inReplyTo),
      messageId,
    }),
    subject: parsed.subject || NO_SUBJECT,
    from: sender?.address || "",
    fromName: sender?.name || undefined,
    to: formatAddressList(parsed.to),
    cc: formatAddressList(parsed.cc),
    replyTo: formatAddressList(parsed.replyTo),
    body: parsed.text || "",
    htmlBody: parsed.html || undefined,
    starCount: state.isFlagged ? STAR_COUNTS.HIGH : STAR_COUNTS.NONE,
    receivedAt: state.internalDate || parsed.date || new Date(),
    isRead: state.isRead,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}
