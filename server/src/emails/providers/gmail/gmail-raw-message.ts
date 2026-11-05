/**
 * `users.messages.get` format that returns the whole RFC 822 message in the
 * `raw` field instead of a parsed MIME tree.
 */
export const GMAIL_RAW_MESSAGE_FORMAT = "raw";

/**
 * Decodes the base64url `raw` field of a Gmail message into the original
 * RFC 822 bytes. Kept as bytes rather than a string so 8-bit and non-UTF-8
 * parts survive untouched. An empty payload is an error, not an empty file —
 * a download that silently produced a zero-byte `.eml` would look successful.
 */
export function decodeGmailRawMessage(raw: string | null | undefined): Buffer {
  if (!raw) {
    throw new Error("Gmail returned no raw content for the message");
  }
  return Buffer.from(raw, "base64url");
}
