import { EmailRecipient } from "../emails/interfaces/email-provider.interface";

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
  for (let i = 0; i < recipientStr.length; i++) {
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
      const match = part.match(/^(.*?)\s*<([^>]+)>$/);
      if (match) {
        const name = unquoteDisplayName(match[1].trim());
        const email = match[2].trim();
        return name ? { name, email } : { email };
      }
      return { email: part };
    });
}
