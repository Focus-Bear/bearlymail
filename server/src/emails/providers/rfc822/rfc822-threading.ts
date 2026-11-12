/**
 * RFC-822 threading shared by providers that expose no native thread ID
 * (Apple Mail, generic IMAP). BearlyMail thread IDs for these providers are
 * the root message ID of the References chain.
 */

/** Strips enclosing angle brackets from an RFC-822 message ID. */
export function normalizeMessageId(id: string): string {
  return (id || "").replace(/^</, "").replace(/>$/, "").trim();
}

/** Extracts all <id> tokens from a References / In-Reply-To header value. */
export function extractMessageIdTokens(
  headerValue: string | null | undefined,
): string[] {
  if (!headerValue) return [];
  const tokens = headerValue.match(/<[^<>]+>/g) || [];
  return tokens.map(normalizeMessageId);
}

/**
 * The first entry of References is the thread root; failing that In-Reply-To
 * (parent == root for two-message threads); failing that the message is its
 * own root.
 */
export function deriveThreadIdFromChain(chain: {
  references: string[];
  inReplyTo: string[];
  messageId: string;
}): string {
  if (chain.references.length > 0) return chain.references[0];
  if (chain.inReplyTo.length > 0) return chain.inReplyTo[0];
  return normalizeMessageId(chain.messageId);
}

/**
 * The References value for a reply: the parent's chain plus the parent itself
 * (RFC 5322 §3.6.4), so every client — and our own deriveThreadIdFromChain —
 * resolves the reply to the same thread root.
 */
export function buildReplyReferences(
  parentReferences: string[],
  parentMessageId: string,
): string[] {
  const parent = normalizeMessageId(parentMessageId);
  return [...parentReferences.filter((id) => id !== parent), parent];
}

/** Formats bare message IDs for a References / In-Reply-To header. */
export function formatMessageIdHeader(ids: string[]): string {
  return ids.map((id) => `<${normalizeMessageId(id)}>`).join(" ");
}
