import type { AddressObject, Attachment, ParsedMail } from "mailparser";

import { MAIL_HEADER_NAMES } from "../../../constants/mail-server.constants";
import { STAR_COUNTS } from "../../../constants/priority-constants";
import { parseAuthenticationResults } from "../../../utils/authentication-results.util";
import {
  EmailAttachment,
  RawEmailMessage,
} from "../../interfaces/email-provider.interface";
import { buildUnsubscribeOptions } from "../../unsubscribe/list-unsubscribe.parser";
import {
  deriveThreadIdFromChain,
  extractMessageIdTokens,
  normalizeMessageId,
} from "../rfc822/rfc822-threading";

const NO_SUBJECT = "(no subject)";
export const DEFAULT_ATTACHMENT_MIME = "application/octet-stream";

/** `type/subtype` made only of MIME token characters. */
const MIME_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

/**
 * A message's own Content-Type for a part is sender-controlled, so anything
 * that is not a plain `type/subtype` is replaced with the generic binary type
 * before it is stored or sent to the client.
 */
export function safeAttachmentMimeType(
  contentType: string | null | undefined,
): string {
  const candidate = (contentType ?? "").trim().toLowerCase();
  return MIME_TYPE_PATTERN.test(candidate)
    ? candidate
    : DEFAULT_ATTACHMENT_MIME;
}
const ATTACHMENT_PART_PREFIX = "part-";

/** IMAP state that lives outside the RFC-822 source. */
export interface ImapMessageState {
  isRead: boolean;
  isFlagged: boolean;
  /** Server receipt time; the Date header is sender-controlled and may lie. */
  internalDate?: Date;
}

/**
 * The first (topmost) value of a header. mailparser keys headers in lower case
 * and collects a repeated header into an array in message order.
 */
function firstHeaderValue(
  parsed: ParsedMail,
  headerName: string,
): string | undefined {
  const value = parsed.headers.get(headerName.toLowerCase());
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first : undefined;
}

const HEADER_FOLD_PATTERN = /\r?\n[ \t]+/g;
const HEADER_NAME_SEPARATOR = ":";

/**
 * A header's unfolded raw value. mailparser merges every List-* header into one
 * structured `list` entry, so those are read from the raw header lines instead.
 */
function rawHeaderValue(
  parsed: ParsedMail,
  headerName: string,
): string | undefined {
  const wanted = headerName.toLowerCase();
  const line = parsed.headerLines?.find(({ key }) => key === wanted)?.line;
  if (!line) return undefined;
  return line
    .slice(line.indexOf(HEADER_NAME_SEPARATOR) + 1)
    .replace(HEADER_FOLD_PATTERN, " ")
    .trim();
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
    mimeType: safeAttachmentMimeType(attachment.contentType),
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
    senderAuthResults: parseAuthenticationResults(
      firstHeaderValue(parsed, MAIL_HEADER_NAMES.AUTHENTICATION_RESULTS),
    ),
    unsubscribeOptions: buildUnsubscribeOptions({
      listUnsubscribe: rawHeaderValue(
        parsed,
        MAIL_HEADER_NAMES.LIST_UNSUBSCRIBE,
      ),
      listUnsubscribePost: rawHeaderValue(
        parsed,
        MAIL_HEADER_NAMES.LIST_UNSUBSCRIBE_POST,
      ),
      htmlBody: parsed.html || undefined,
      body: parsed.text,
    }),
    body: parsed.text || "",
    htmlBody: parsed.html || undefined,
    starCount: state.isFlagged ? STAR_COUNTS.HIGH : STAR_COUNTS.NONE,
    receivedAt: state.internalDate || parsed.date || new Date(),
    isRead: state.isRead,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}
