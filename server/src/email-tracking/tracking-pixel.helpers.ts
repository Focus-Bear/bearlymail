import { randomBytes } from "crypto";

import {
  APPLE_IP_PREFIX,
  APPLE_PRIVACY_PROXY_USER_AGENT,
  GMAIL_IMAGE_PROXY_USER_AGENT_MARKER,
  NON_PUBLIC_HOSTNAMES,
  OPEN_SOURCE,
  OpenSource,
  TRACKING_PIXEL_EXTENSION,
  TRACKING_PIXEL_IMG_PATTERN,
  TRACKING_PIXEL_OPEN_SEGMENT,
  TRACKING_PIXEL_ROUTE_PREFIX,
  TRACKING_TOKEN_BYTES,
  TRACKING_TOKEN_PATTERN,
} from "../constants/email-tracking.constants";

const CLOSING_BODY_TAG = /<\/body\s*>/i;
const IPV4_MAPPED_IPV6_PREFIX = "::ffff:";

/** A fresh unguessable pixel token (128 random bits, base64url). */
export function generateTrackingToken(): string {
  return randomBytes(TRACKING_TOKEN_BYTES).toString("base64url");
}

export function isWellFormedTrackingToken(token: string): boolean {
  return TRACKING_TOKEN_PATTERN.test(token);
}

/**
 * Recipients' mail clients must be able to fetch the pixel, so a backend that
 * only listens on a loopback address can't track anything.
 */
export function isPubliclyReachableBaseUrl(baseUrl: string): boolean {
  try {
    return !NON_PUBLIC_HOSTNAMES.has(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

export function buildTrackingPixelUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/${TRACKING_PIXEL_ROUTE_PREFIX}/${TRACKING_PIXEL_OPEN_SEGMENT}/${token}${TRACKING_PIXEL_EXTENSION}`;
}

/** Recovers the token from the `:file` route param (`<token>.gif`). */
export function parseTrackingPixelFilename(filename: string): string | null {
  if (!filename.endsWith(TRACKING_PIXEL_EXTENSION)) return null;
  const token = filename.slice(0, -TRACKING_PIXEL_EXTENSION.length);
  return isWellFormedTrackingToken(token) ? token : null;
}

/** Every pixel token embedded in an HTML body, in document order. */
export function extractTrackingTokens(
  html: string | null | undefined,
): string[] {
  if (!html) return [];
  return Array.from(
    html.matchAll(TRACKING_PIXEL_IMG_PATTERN),
    (match) => match[1],
  );
}

/**
 * Removes every one of our pixels from an HTML body. Used before display (so
 * the user viewing their own sent mail — or a reply quoting it — never counts
 * as an open) and before injecting a new pixel (so quoted history can't carry
 * an older message's pixel out again).
 */
export function stripTrackingPixels<T extends string | null | undefined>(
  html: T,
): T {
  if (!html) return html;
  return html.replace(TRACKING_PIXEL_IMG_PATTERN, "") as T;
}

/**
 * Strips our pixels from both body fields of an email about to be shown to its
 * owner. Sent messages sometimes keep their HTML in `body`, so both are cleaned.
 */
export function stripTrackingPixelsFromEmail<
  T extends { body?: string | null; htmlBody?: string | null },
>(email: T): T {
  return {
    ...email,
    body: stripTrackingPixels(email.body),
    htmlBody: stripTrackingPixels(email.htmlBody),
  };
}

/**
 * Appends exactly one pixel to an HTML body, inside `</body>` when there is
 * one. Any pixel already present (e.g. in quoted history) is removed first.
 * The image is 1x1 and borderless rather than `display:none`, which several
 * clients refuse to fetch.
 */
export function injectTrackingPixel(html: string, pixelUrl: string): string {
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="width:1px;height:1px;border:0;" />`;
  const clean = stripTrackingPixels(html);
  if (CLOSING_BODY_TAG.test(clean)) {
    return clean.replace(CLOSING_BODY_TAG, (closing) => `${pixel}${closing}`);
  }
  return `${clean}${pixel}`;
}

function isAppleAddress(ipAddress: string | null): boolean {
  if (!ipAddress) return false;
  const normalized = ipAddress.startsWith(IPV4_MAPPED_IPV6_PREFIX)
    ? ipAddress.slice(IPV4_MAPPED_IPV6_PREFIX.length)
    : ipAddress;
  return normalized.startsWith(APPLE_IP_PREFIX);
}

/**
 * Best-effort guess at who fetched the pixel. Gmail's proxy is a genuine open
 * (Gmail only fetches images when the message is displayed); Apple Mail
 * Privacy Protection fetches on delivery, so it says nothing about reading.
 */
export function classifyOpenSource(
  userAgent: string | null,
  ipAddress: string | null,
): OpenSource {
  if (userAgent?.includes(GMAIL_IMAGE_PROXY_USER_AGENT_MARKER)) {
    return OPEN_SOURCE.GMAIL_PROXY;
  }
  if (
    userAgent?.trim() === APPLE_PRIVACY_PROXY_USER_AGENT ||
    isAppleAddress(ipAddress)
  ) {
    return OPEN_SOURCE.APPLE_PRIVACY_PROXY;
  }
  return OPEN_SOURCE.DIRECT;
}
