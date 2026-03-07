import { EmailRecipient } from "../emails/interfaces/email-provider.interface";

/**
 * Parse a comma-separated recipient string (supports "Name <email>" format)
 * into an array of EmailRecipient objects.
 *
 * Examples:
 *   "alice@example.com" → [{ email: "alice@example.com" }]
 *   "Alice <alice@example.com>" → [{ name: "Alice", email: "alice@example.com" }]
 *   "alice@a.com, Bob <bob@b.com>" → [{ email: "alice@a.com" }, { name: "Bob", email: "bob@b.com" }]
 */
export function parseRecipientsFromString(
  recipientStr: string,
): EmailRecipient[] {
  return recipientStr
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const match = part.match(/^(.*?)\s*<([^>]+)>$/);
      if (match) {
        const name = match[1].trim();
        const email = match[2].trim();
        return name ? { name, email } : { email };
      }
      return { email: part };
    });
}
