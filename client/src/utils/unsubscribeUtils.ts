/**
 * Utility functions for extracting unsubscribe links from emails
 */
import { Email } from 'types/email';

import { HTTPS_PROTOCOL, UNSUBSCRIBE_METHODS, UnsubscribeMethod } from 'constants/unsubscribe';

const UNSUBSCRIBE_PATTERNS = [
  /unsubscribe/i,
  /opt[-\s]?out/i,
  /preferences/i,
  /manage\s+subscription/i,
  /email\s+preferences/i,
  /update\s+preferences/i,
  /subscription\s+preferences/i,
  /manage\s+your\s+subscription/i,
  /unsubscribe\s+from\s+this\s+list/i,
];

const URL_PATTERN = /(https:\/\/[^\s<>"{}|\\^`[\]]+)/gi;

function matchesUnsubscribePattern(text: string): boolean {
  return UNSUBSCRIBE_PATTERNS.some(pattern => pattern.test(text));
}

function sanitizeHtmlForUnsubscribe(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/(src|href)=["']cid:[^"']*["']/gi, '$1=""')
    .replace(/background[^:]*:\s*url\(["']?cid:[^"')]*["']?\)/gi, '');
}

/**
 * True only for an absolute https URL without userinfo. http, javascript:, data:, mailto: and
 * relative links are never opened from an email.
 */
export function isSafeHttpsUrl(raw: string | null | undefined): raw is string {
  if (!raw) {
    return false;
  }
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === HTTPS_PROTOCOL && parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}

function findUnsubscribeLinkInHtml(htmlBody: string): string | null {
  const sanitized = sanitizeHtmlForUnsubscribe(htmlBody);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitized;

  for (const link of Array.from(tempDiv.querySelectorAll('a[href]'))) {
    const href = link.getAttribute('href');
    const text = link.textContent || '';
    if (!href) {
      continue;
    }
    if (!matchesUnsubscribePattern(text) && !matchesUnsubscribePattern(href)) {
      continue;
    }
    if (isSafeHttpsUrl(href)) {
      return href.trim();
    }
  }

  const htmlText = tempDiv.textContent || '';
  const urls = htmlText.match(URL_PATTERN) || [];
  for (const url of urls) {
    if (matchesUnsubscribePattern(url) && isSafeHttpsUrl(url)) {
      return url;
    }
  }

  return null;
}

function findUnsubscribeLinkInText(body: string): string | null {
  const urls = body.match(URL_PATTERN) || [];
  for (const url of urls) {
    if (matchesUnsubscribePattern(url)) {
      return url;
    }
  }

  const lines = body.split('\n');
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    if (!matchesUnsubscribePattern(line)) {
      continue;
    }

    const urlMatch = line.match(URL_PATTERN);
    if (urlMatch?.[0]) {
      return urlMatch[0];
    }

    const nextLine = lines[lineIdx + 1] || '';
    const nextUrlMatch = nextLine.match(URL_PATTERN);
    if (nextUrlMatch?.[0]) {
      return nextUrlMatch[0];
    }
  }

  return null;
}

/**
 * Extracts unsubscribe link from email HTML or plain text.
 * Looks for common unsubscribe patterns in links and text.
 *
 * @param htmlBody - HTML content of the email (optional)
 * @param body - Plain text content of the email (optional)
 * @returns The first valid unsubscribe URL found, or null if none found
 */
export function extractUnsubscribeLink(htmlBody?: string | null, body?: string | null): string | null {
  if (htmlBody) {
    const linkFromHtml = findUnsubscribeLinkInHtml(htmlBody);
    if (linkFromHtml) {
      return linkFromHtml;
    }
  }

  if (body) {
    return findUnsubscribeLinkInText(body);
  }

  return null;
}

export interface UnsubscribeAction {
  method: UnsubscribeMethod;
  /** Set when only the body offers a link (mail synced before List-Unsubscribe was stored). */
  bodyUrl: string | null;
}

/**
 * How this email can be unsubscribed from: the server's method (from List-Unsubscribe) when it
 * has one, else an https unsubscribe link found in the loaded body. Inbox cards carry no body, so
 * for them only the server's method counts.
 */
export function resolveUnsubscribeAction(
  email: Pick<Email, 'unsubscribeMethod' | 'htmlBody' | 'body'>
): UnsubscribeAction | null {
  if (email.unsubscribeMethod) {
    return { method: email.unsubscribeMethod, bodyUrl: null };
  }
  const bodyUrl = extractUnsubscribeLink(email.htmlBody, email.body);
  return bodyUrl ? { method: UNSUBSCRIBE_METHODS.LINK, bodyUrl } : null;
}
