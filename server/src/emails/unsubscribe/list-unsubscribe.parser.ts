/**
 * Turns a message's List-Unsubscribe / List-Unsubscribe-Post headers (RFC 2369,
 * RFC 8058) — or, when it has none, an unsubscribe link in its body — into the
 * targets BearlyMail may use to unsubscribe the user.
 *
 * Only https URLs and single-recipient mailto: addresses survive parsing:
 * http, javascript:, data: and anything malformed are dropped here so no later
 * step can follow them.
 */
import {
  UNSUBSCRIBE,
  UNSUBSCRIBE_METHODS,
  UNSUBSCRIBE_SOURCES,
  UnsubscribeMethod,
  UnsubscribeSource,
} from "../../constants/unsubscribe.constants";

export interface MailtoTarget {
  address: string;
  subject?: string;
  body?: string;
}

export interface UnsubscribeOptions {
  httpsUrl?: string;
  mailto?: MailtoTarget;
  /** RFC 8058 one-click is advertised for `httpsUrl`. Never true for a body link. */
  oneClick: boolean;
  source: UnsubscribeSource;
}

export interface UnsubscribeSourceFields {
  listUnsubscribe?: string | null;
  listUnsubscribePost?: string | null;
  htmlBody?: string | null;
  body?: string | null;
}

const HTTPS_PROTOCOL = "https:";
const MAILTO_PROTOCOL = "mailto:";
const MAILTO_SUBJECT_PARAM = "subject";
const MAILTO_BODY_PARAM = "body";
const BRACKETED_URI_PATTERN = /<([^<>]*)>/g;
/** A single address: no list separators, whitespace or header-injection bytes. */
const SINGLE_ADDRESS_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+$/;
const UNSUBSCRIBE_TEXT_PATTERN = /unsubscribe|opt[-\s]?out/i;
/** Anchor text is capped so a missing `</a>` can't make the scan quadratic. */
const ANCHOR_PATTERN =
  /<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]{0,2000}?)<\/a>/gi;
const TAG_PATTERN = /<[^>]*>/g;
const HTTPS_URL_IN_TEXT_PATTERN = /https:\/\/[^\s<>"'()]+/i;
const HTML_ENTITY_AMPERSAND = /&amp;/gi;

/** The URL as an https URL with no userinfo, or null. */
export function toSafeHttpsUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== HTTPS_PROTOCOL) return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  return parsed.href;
}

function decodeMailtoPart(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** A mailto: URI with exactly one recipient, or null. */
export function parseMailtoUri(raw: string): MailtoTarget | null {
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith(MAILTO_PROTOCOL)) return null;
  const [addressPart, query = ""] = trimmed
    .slice(MAILTO_PROTOCOL.length)
    .split("?", 2);
  const address = decodeMailtoPart(addressPart);
  if (!address || !SINGLE_ADDRESS_PATTERN.test(address)) return null;
  const params = new URLSearchParams(query);
  const subject = params.get(MAILTO_SUBJECT_PARAM)?.trim();
  const body = params.get(MAILTO_BODY_PARAM)?.trim();
  return {
    address,
    ...(subject ? { subject } : {}),
    ...(body ? { body } : {}),
  };
}

function isOneClickPost(listUnsubscribePost: string | null | undefined) {
  return (
    listUnsubscribePost?.trim().toLowerCase() ===
    UNSUBSCRIBE.ONE_CLICK_POST_VALUE.toLowerCase()
  );
}

/** Parses the two headers; null when they hold no usable target. */
export function parseListUnsubscribe(
  listUnsubscribe: string | null | undefined,
  listUnsubscribePost?: string | null,
): UnsubscribeOptions | null {
  if (!listUnsubscribe) return null;
  let httpsUrl: string | undefined;
  let mailto: MailtoTarget | undefined;
  for (const [, uri] of listUnsubscribe.matchAll(BRACKETED_URI_PATTERN)) {
    httpsUrl ??= toSafeHttpsUrl(uri) ?? undefined;
    mailto ??= parseMailtoUri(uri) ?? undefined;
  }
  if (!httpsUrl && !mailto) return null;
  return {
    ...(httpsUrl ? { httpsUrl } : {}),
    ...(mailto ? { mailto } : {}),
    oneClick: !!httpsUrl && isOneClickPost(listUnsubscribePost),
    source: UNSUBSCRIBE_SOURCES.HEADER,
  };
}

function findUnsubscribeUrlInHtml(htmlBody: string): string | null {
  for (const [, , href, inner] of htmlBody.matchAll(ANCHOR_PATTERN)) {
    const text = inner.replace(TAG_PATTERN, " ");
    if (
      !UNSUBSCRIBE_TEXT_PATTERN.test(text) &&
      !UNSUBSCRIBE_TEXT_PATTERN.test(href)
    ) {
      continue;
    }
    const url = toSafeHttpsUrl(href.replace(HTML_ENTITY_AMPERSAND, "&"));
    if (url) return url;
  }
  return null;
}

/** "Unsubscribe: https://…", or the URL on the line after "Unsubscribe". */
function findUnsubscribeUrlInText(body: string): string | null {
  const lines = body.split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (!UNSUBSCRIBE_TEXT_PATTERN.test(lines[index])) continue;
    const candidates = [lines[index], lines[index + 1] ?? ""];
    for (const candidate of candidates) {
      const url = toSafeHttpsUrl(
        candidate.match(HTTPS_URL_IN_TEXT_PATTERN)?.[0],
      );
      if (url) return url;
    }
  }
  return null;
}

/** An https unsubscribe link in the message body, or null. */
export function findBodyUnsubscribeUrl(
  htmlBody: string | null | undefined,
  body: string | null | undefined,
): string | null {
  return (
    (htmlBody ? findUnsubscribeUrlInHtml(htmlBody) : null) ??
    (body ? findUnsubscribeUrlInText(body) : null)
  );
}

/**
 * The headers win; a body link is only a fallback for mail that has no usable
 * List-Unsubscribe header.
 */
export function buildUnsubscribeOptions(
  fields: UnsubscribeSourceFields,
): UnsubscribeOptions | null {
  const fromHeaders = parseListUnsubscribe(
    fields.listUnsubscribe,
    fields.listUnsubscribePost,
  );
  if (fromHeaders) return fromHeaders;
  const bodyUrl = findBodyUnsubscribeUrl(fields.htmlBody, fields.body);
  return bodyUrl
    ? { httpsUrl: bodyUrl, oneClick: false, source: UNSUBSCRIBE_SOURCES.BODY }
    : null;
}

/** One-click beats mailto, which beats sending the user to a web page. */
export function preferredUnsubscribeMethod(
  options: UnsubscribeOptions | null | undefined,
): UnsubscribeMethod | null {
  if (!options) return null;
  if (options.oneClick && options.httpsUrl)
    return UNSUBSCRIBE_METHODS.ONE_CLICK;
  if (options.mailto) return UNSUBSCRIBE_METHODS.MAILTO;
  if (options.httpsUrl) return UNSUBSCRIBE_METHODS.LINK;
  return null;
}

/** Narrows a decrypted JSON column value to stored unsubscribe options. */
export function isUnsubscribeOptions(
  value: unknown,
): value is UnsubscribeOptions {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UnsubscribeOptions>;
  return (
    typeof candidate.oneClick === "boolean" &&
    (candidate.httpsUrl === undefined ||
      typeof candidate.httpsUrl === "string") &&
    (candidate.mailto === undefined ||
      typeof candidate.mailto?.address === "string")
  );
}

/** The method a stored (decrypted) column value allows, or null. */
export function unsubscribeMethodFromStored(
  value: unknown,
): UnsubscribeMethod | null {
  return isUnsubscribeOptions(value) ? preferredUnsubscribeMethod(value) : null;
}
