/**
 * HMAC-based email address fingerprinting for SQL-level contact-thread lookup.
 *
 * Because email addresses on the Email entity are AES-GCM encrypted with a
 * random IV per write, they cannot be filtered in SQL.  We store a
 * deterministic HMAC-SHA256 fingerprint alongside each encrypted value so that
 * the contacts service can do an indexed SQL lookup instead of a full table
 * scan with in-memory decryption.
 *
 * The HMAC key is the same ENCRYPTION_KEY already required at boot time.
 * Both sender and recipient HMACs should be populated whenever an email is
 * ingested (see emails.service.ts createEmail / saveBlockedEmail, and
 * replies.service.ts storeSentReply).
 */
import { createHmac } from "crypto";

const HMAC_KEY = process.env.ENCRYPTION_KEY ?? "";

/**
 * Return the HMAC-SHA256 hex fingerprint of a single normalised email address.
 * Returns an empty string when the input is blank.
 */
export function computeEmailHmac(email: string): string {
  const normalised = email.toLowerCase().trim();
  if (!normalised) return "";
  return createHmac("sha256", HMAC_KEY).update(normalised).digest("hex");
}

/**
 * Build the recipient HMAC column value from a raw `to` or `cc` field that
 * may contain multiple comma-separated addresses.
 *
 * Stored format: `,<hmac1>,<hmac2>,` — the leading/trailing commas allow
 * unambiguous LIKE matching (`LIKE '%,<target>,%'`) so an HMAC can never be a
 * substring of another stored HMAC entry.
 *
 * Returns null when the field is empty or null.
 */
export function computeRecipientsHmac(
  rawField: string | null | undefined,
): string | null {
  if (!rawField) return null;
  const addresses = rawField
    .split(",")
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);
  if (addresses.length === 0) return null;
  const hmacs = addresses.map((addr) => computeEmailHmac(addr));
  return `,${hmacs.join(",")},`;
}

/**
 * Build the LIKE pattern used to search for a contact HMAC inside the
 * recipientEmailsHmac column (stored as `,hmac1,hmac2,`).
 */
export function buildRecipientHmacPattern(email: string): string {
  return `%,${computeEmailHmac(email)},%`;
}
