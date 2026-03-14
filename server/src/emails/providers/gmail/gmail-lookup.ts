import { gmail_v1 } from "googleapis";

/**
 * Returns true if the given ID is a Gmail API hex thread/message ID.
 * Hex thread IDs are exactly 16 lowercase hexadecimal characters.
 * Legacy message IDs from Gmail web URLs are base64url-encoded and do not
 * match this pattern, so they must be resolved via the Gmail API first.
 */
export function isHexThreadId(id: string): boolean {
  return /^[0-9a-f]{16}$/i.test(id);
}

export function buildGmailUrlIdsToTry(urlId: string): string[] {
  // Hex thread IDs can be used directly — no need to decode
  if (isHexThreadId(urlId)) {
    return [urlId];
  }

  const idsToTry: string[] = [urlId];
  try {
    const base64 = urlId.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const hexId = Buffer.from(padded, "base64").toString("hex");
    if (hexId && hexId !== urlId) idsToTry.push(hexId);
  } catch {
    // ignore decode errors
  }
  return idsToTry;
}

export function extractEmailMetadata(
  headers: Array<{ name?: string | null; value?: string | null }>,
) {
  return {
    subject: headers.find((header) => header.name === "Subject")?.value || "",
    from: headers.find((header) => header.name === "From")?.value || "",
    dateStr: headers.find((header) => header.name === "Date")?.value || "",
  };
}

export async function lookupGmailMessageByIds(
  gmail: gmail_v1.Gmail,
  idsToTry: string[],
): Promise<{
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  receivedAt: Date | null;
} | null> {
  for (const id of idsToTry) {
    try {
      const response = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });
      const message = response.data;
      if (message.id && message.threadId) {
        const { subject, from, dateStr } = extractEmailMetadata(
          message.payload?.headers || [],
        );
        return {
          messageId: message.id,
          threadId: message.threadId,
          subject,
          from,
          receivedAt: dateStr ? new Date(dateStr) : null,
        };
      }
    } catch {
      // Try next ID variant
    }
  }
  return null;
}

export async function lookupGmailThreadByIds(
  gmail: gmail_v1.Gmail,
  idsToTry: string[],
): Promise<{
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  receivedAt: Date | null;
} | null> {
  for (const id of idsToTry) {
    try {
      const response = await gmail.users.threads.get({
        userId: "me",
        id,
        format: "metadata",
      });
      const thread = response.data;
      if (thread.id) {
        const latestMsg = thread.messages?.[thread.messages.length - 1] ?? null;
        const { subject, from, dateStr } = extractEmailMetadata(
          latestMsg?.payload?.headers || [],
        );
        return {
          messageId: latestMsg?.id || thread.id,
          threadId: thread.id,
          subject,
          from,
          receivedAt: dateStr ? new Date(dateStr) : null,
        };
      }
    } catch {
      // Try next ID variant
    }
  }
  return null;
}
