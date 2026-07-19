import { gmail_v1 } from "googleapis";

const GMAIL_ID_BYTES = 8;
const GMAIL_COMPOUND_ID_THREAD_END = GMAIL_ID_BYTES;
const GMAIL_COMPOUND_ID_MESSAGE_END = GMAIL_ID_BYTES * 2;

export interface GmailLookupAttempt {
  id: string;
  kind: "message" | "thread";
  success: boolean;
  errorCode?: number;
  errorMessage?: string;
}

export interface GmailLookupHit {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  receivedAt: Date | null;
}

function coerceErrorCode(rawCode: unknown): number | undefined {
  if (typeof rawCode === "number") return rawCode;
  if (typeof rawCode === "string") {
    const parsed = parseInt(rawCode, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function extractAttemptError(error: unknown): {
  errorCode?: number;
  errorMessage: string;
} {
  if (error && typeof error === "object") {
    const candidate = error as {
      code?: number | string;
      status?: number | string;
      message?: string;
      response?: { status?: number | string };
    };
    const rawCode =
      candidate.code ?? candidate.status ?? candidate.response?.status;
    const errorCode = coerceErrorCode(rawCode);
    const baseMessage = candidate.message ?? "unknown Gmail API error";
    // Preserve non-numeric codes (e.g. 'ECONNREFUSED') in the message so the
    // diagnostic info is not lost when we drop them from the numeric field.
    const message =
      typeof rawCode === "string" && errorCode === undefined
        ? `${rawCode}: ${baseMessage}`
        : baseMessage;
    return errorCode !== undefined
      ? { errorCode, errorMessage: message }
      : { errorMessage: message };
  }
  return { errorMessage: String(error) };
}

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
    const decoded = Buffer.from(padded, "base64");
    const hexId = decoded.toString("hex");
    if (hexId && hexId !== urlId) idsToTry.push(hexId);

    // Gmail search/label URL IDs (e.g. #search/{query}/{id}) use a compound
    // 24-byte encoding where the first 8 bytes are the thread ID and bytes
    // 8-15 are the message ID. The full 48-char hex above is not a valid
    // Gmail API ID, so we also try the individual 8-byte slices.
    if (decoded.length > GMAIL_COMPOUND_ID_THREAD_END) {
      const threadId = decoded
        .subarray(0, GMAIL_COMPOUND_ID_THREAD_END)
        .toString("hex");
      if (!idsToTry.includes(threadId)) idsToTry.push(threadId);
    }
    if (decoded.length > GMAIL_COMPOUND_ID_MESSAGE_END) {
      const messageId = decoded
        .subarray(GMAIL_COMPOUND_ID_THREAD_END, GMAIL_COMPOUND_ID_MESSAGE_END)
        .toString("hex");
      if (!idsToTry.includes(messageId)) idsToTry.push(messageId);
    }
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
  attempts?: GmailLookupAttempt[],
): Promise<GmailLookupHit | null> {
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
        attempts?.push({ id, kind: "message", success: true });
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
      attempts?.push({
        id,
        kind: "message",
        success: false,
        errorMessage: "response missing id/threadId",
      });
    } catch (error: unknown) {
      attempts?.push({
        id,
        kind: "message",
        success: false,
        ...extractAttemptError(error),
      });
    }
  }
  return null;
}

export async function lookupGmailThreadByIds(
  gmail: gmail_v1.Gmail,
  idsToTry: string[],
  attempts?: GmailLookupAttempt[],
): Promise<GmailLookupHit | null> {
  for (const id of idsToTry) {
    try {
      const response = await gmail.users.threads.get({
        userId: "me",
        id,
        format: "metadata",
      });
      const thread = response.data;
      if (thread.id) {
        attempts?.push({ id, kind: "thread", success: true });
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
      attempts?.push({
        id,
        kind: "thread",
        success: false,
        errorMessage: "response missing thread id",
      });
    } catch (error: unknown) {
      attempts?.push({
        id,
        kind: "thread",
        success: false,
        ...extractAttemptError(error),
      });
    }
  }
  return null;
}
