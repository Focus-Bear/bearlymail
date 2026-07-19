/**
 * Utility for parsing messy paste strings into individual recipient objects.
 * Supports RFC 5322 display-name + angle-addr, bare emails, Outlook ALLCAPS names,
 * quoted display names containing commas, and separator variants: semicolons,
 * commas, newlines.
 *
 * @module recipientParser
 */

export interface ParsedRecipient {
  email: string;
  name?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Characters that force a display-name to be wrapped in a quoted-string. */
const DISPLAY_NAME_MUST_QUOTE = /[()<>[\]:;@\\,."]/;

/**
 * Returns true if the given string is a syntactically valid email address.
 * Extracted from RecipientFields.tsx to be shared with the parser.
 */
export const isValidEmail = (email: string): boolean => {
  const extractedEmail = email.match(/<([^>]+)>/)?.[1] || email;
  return EMAIL_REGEX.test(extractedEmail.trim());
};

/**
 * Split a recipient list on separators (comma, semicolon, newline) that are
 * NOT inside a double-quoted display name. RFC 5322 display names such as
 * `"Lastname, Firstname"` legally contain commas; a naive split shatters them
 * into invalid fragments, which is what produced broken recipient chips and
 * "Invalid To header" send failures.
 */
export const splitRecipientList = (raw: string): string[] => {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\' && inQuotes && i + 1 < raw.length) {
      current += ch + raw[i + 1];
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if ((ch === ',' || ch === ';' || ch === '\n' || ch === '\r') && !inQuotes) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
};

/**
 * Strip surrounding double-quotes from a quoted display name and unescape
 * `\"` / `\\`. Unquoted names are returned unchanged.
 */
const unquoteDisplayName = (name: string): string => {
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    return name.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  return name;
};

/**
 * Format a recipient as a header/token string, wrapping the display name in a
 * quoted-string when it contains RFC 5322 specials (notably commas) so it
 * survives re-parsing and is accepted by the mail provider.
 */
export const formatRecipientToken = (name: string | undefined, email: string): string => {
  if (!name) {
    return email;
  }
  if (DISPLAY_NAME_MUST_QUOTE.test(name)) {
    const escaped = name.replace(/(["\\])/g, '\\$1');
    return `"${escaped}" <${email}>`;
  }
  return `${name} <${email}>`;
};

/**
 * Splits a raw paste string into individual recipient tokens while preserving
 * quoted strings and angle-bracket groups (quote-aware, see splitRecipientList).
 */
const splitTokens = (raw: string): string[] =>
  splitRecipientList(raw)
    .map(token => token.trim())
    .filter(token => token.length > 0);

/**
 * Parses a single token such as:
 *   "John Doe <john@example.com>"
 *   "JOHN DOE <john@example.com>"
 *   '"Doe, John" <john@example.com>'
 *   "john@example.com"
 *   "<john@example.com>"
 *
 * Returns null if no valid email can be extracted.
 */
const parseToken = (token: string): ParsedRecipient | null => {
  const angleMatch = token.match(/^(.*?)<([^>]+)>\s*$/);
  if (angleMatch) {
    const rawName = unquoteDisplayName(angleMatch[1].trim());
    const email = angleMatch[2].trim();
    if (!EMAIL_REGEX.test(email)) {
      return null;
    }
    const name = rawName.length > 0 ? rawName : undefined;
    return { email, name };
  }

  // Plain email address (no angle brackets)
  const plain = token.trim();
  if (EMAIL_REGEX.test(plain)) {
    return { email: plain };
  }

  return null;
};

/**
 * Parses a raw paste string into an array of valid recipient objects.
 *
 * @param raw - The raw pasted text (may contain multiple recipients).
 * @returns Array of parsed recipients with valid email addresses.
 *          Invalid tokens are silently excluded; callers should handle the
 *          case where the array is empty (fall back to default paste).
 */
export const parseRecipientString = (raw: string): ParsedRecipient[] => {
  const tokens = splitTokens(raw);
  const results: ParsedRecipient[] = [];

  for (const token of tokens) {
    const parsed = parseToken(token);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
};
