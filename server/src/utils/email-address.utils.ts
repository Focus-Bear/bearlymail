import { EmailRecipient } from "../emails/interfaces/email-provider.interface";

// Address-parsing patterns are length-bounded so adversarial input can't drive
// super-linear regex backtracking (CWE-1333 ReDoS). 320 = RFC 5321 maximum
// address length.
const ANGLE_ADDR_RE = /<([^>]{1,320})>/;
const OPTIONAL_ANGLE_ADDR_RE = /<([^>]{0,320})>/;
const NAME_AND_ANGLE_ADDR_RE = /^(.{0,320}?)\s*<([^>]{1,320})>$/;
// Cap the parse loop so a huge recipient string can't hang the parser
// (CWE-834 loop bound from untrusted input). Real headers are far shorter.
const MAX_RECIPIENT_LIST_LENGTH = 100_000;

/**
 * Extract the bare email address from a "Name <email>" or raw-address string,
 * lower-cased and trimmed. Returns "" for empty input.
 */
export function extractEmailAddress(from: string | undefined | null): string {
  if (!from) return "";
  const match = from.match(ANGLE_ADDR_RE);
  if (match) return match[1].toLowerCase().trim();
  return from.toLowerCase().trim();
}

/**
 * Split an RFC 5322 address list on commas that are NOT inside a double-quoted
 * display name. A display name such as `"Lastname, Firstname"` legally contains
 * a comma; a naive `split(",")` would shatter it into invalid fragments (a
 * recipient with no `@`), which Gmail rejects with "Invalid To header".
 */
function splitAddressList(recipientStr: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  const limit = Math.min(recipientStr.length, MAX_RECIPIENT_LIST_LENGTH);
  for (let i = 0; i < limit; i++) {
    const ch = recipientStr[i];
    if (ch === "\\" && inQuotes && i + 1 < recipientStr.length) {
      // Preserve an escaped character (\" or \\) verbatim inside a quoted name.
      current += ch + recipientStr[i + 1];
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (ch === "," && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/**
 * Strip the surrounding double-quotes from a quoted display name and unescape
 * `\"` / `\\` sequences. Unquoted names are returned unchanged.
 */
function unquoteDisplayName(name: string): string {
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    return name.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return name;
}

/**
 * True for RFC 5322 group syntax with no members, e.g. "undisclosed-recipients:;"
 * or "Undisclosed recipients:". Bulk senders put this in the To header; it is not
 * a routable address, and echoing it back (e.g. on reply-all) makes Gmail reject
 * the whole message with HTTP 400 "Invalid To header".
 */
function isEmptyGroupSyntax(part: string): boolean {
  return /^[^<>@"]*:\s*;?$/.test(part);
}

export interface SanitizedRecipientList {
  /** The list with unroutable entries removed, original formatting preserved. */
  sanitized: string;
  /** Entries whose addr-spec has no "@" — likely typos the sender should fix. */
  invalid: string[];
}

/**
 * Clean a raw comma-separated recipient list before handing it to a provider.
 * Empty-group tokens are dropped silently (they can never receive mail);
 * remaining entries without an "@" in the addr-spec are reported as invalid so
 * callers can reject the send with a clear message instead of surfacing an
 * opaque provider error.
 */
export function sanitizeRecipientList(
  recipientStr: string,
): SanitizedRecipientList {
  const kept: string[] = [];
  const invalid: string[] = [];
  for (const rawPart of splitAddressList(recipientStr)) {
    const part = rawPart.trim();
    if (!part) continue;
    if (isEmptyGroupSyntax(part)) continue;
    const angleMatch = part.match(OPTIONAL_ANGLE_ADDR_RE);
    const addrSpec = angleMatch ? angleMatch[1] : part;
    if (!addrSpec.includes("@")) {
      invalid.push(part);
      continue;
    }
    kept.push(part);
  }
  return { sanitized: kept.join(", "), invalid };
}

/**
 * Parse a comma-separated recipient string (supports "Name <email>" format,
 * including RFC 5322 quoted display names that contain commas) into an array of
 * EmailRecipient objects.
 *
 * Examples:
 *   "alice@example.com" → [{ email: "alice@example.com" }]
 *   "Alice <alice@example.com>" → [{ name: "Alice", email: "alice@example.com" }]
 *   "alice@a.com, Bob <bob@b.com>" → [{ email: "alice@a.com" }, { name: "Bob", email: "bob@b.com" }]
 *   '"Doe, Jane" <jane@x.com>' → [{ name: "Doe, Jane", email: "jane@x.com" }]
 */
export function parseRecipientsFromString(
  recipientStr: string,
): EmailRecipient[] {
  return splitAddressList(recipientStr)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const match = part.match(NAME_AND_ANGLE_ADDR_RE);
      if (match) {
        const name = unquoteDisplayName(match[1].trim());
        const email = match[2].trim();
        return name ? { name, email } : { email };
      }
      return { email: part };
    });
}

/**
 * Best-effort display name for the first recipient of a "to" header, for use
 * when no reply from that recipient exists yet to source a name from (e.g. a
 * follow-up on a thread the other party hasn't answered). Prefers the display
 * name from the header; falls back to title-casing the email's local part
 * (e.g. "sudhir.kumar@x.com" -> "Sudhir Kumar").
 */
export function deriveRecipientDisplayName(
  to: string | undefined | null,
): string | null {
  if (!to) return null;
  const [firstRecipient] = parseRecipientsFromString(to);
  if (!firstRecipient) return null;
  if (firstRecipient.name) return firstRecipient.name;

  // Strip a plus-addressing suffix (e.g. "sudhir+test@x.com") before deriving
  // a name, so it doesn't leak into the result (e.g. "Sudhir+test").
  const localPart = firstRecipient.email.split("@")[0]?.split("+")[0];
  if (!localPart) return null;

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
