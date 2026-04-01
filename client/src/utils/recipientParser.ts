/**
 * Utility for parsing messy paste strings into individual recipient objects.
 * Supports RFC 5322 display-name + angle-addr, bare emails, Outlook ALLCAPS names,
 * and separator variants: semicolons, commas, newlines.
 *
 * @module recipientParser
 */

export interface ParsedRecipient {
  email: string;
  name?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns true if the given string is a syntactically valid email address.
 * Extracted from RecipientFields.tsx to be shared with the parser.
 */
export const isValidEmail = (email: string): boolean => {
  const extractedEmail = email.match(/<([^>]+)>/)?.[1] || email;
  return EMAIL_REGEX.test(extractedEmail.trim());
};

/**
 * Splits a raw paste string into individual recipient tokens while
 * preserving quoted strings and angle-bracket groups.
 *
 * Strategy:
 *  1. Split naïvely on /[,;\n]+/ — this is safe because angle-bracket groups
 *     and quoted strings do not normally contain raw commas/semicolons/newlines
 *     in practice. (Full RFC 5321 quoted-strings can, but that's vanishingly rare
 *     in copy-paste scenarios; a simple split is the right trade-off here.)
 *  2. Trim each token.
 *  3. Drop empty tokens.
 */
const splitTokens = (raw: string): string[] =>
  raw
    .split(/[,;\n]+/)
    .map(token => token.trim())
    .filter(token => token.length > 0);

/**
 * Parses a single token such as:
 *   "John Doe <john@example.com>"
 *   "JOHN DOE <john@example.com>"
 *   "john@example.com"
 *   "<john@example.com>"
 *
 * Returns null if no valid email can be extracted.
 */
const parseToken = (token: string): ParsedRecipient | null => {
  const angleMatch = token.match(/^(.*?)<([^>]+)>\s*$/);
  if (angleMatch) {
    const rawName = angleMatch[1].trim();
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
