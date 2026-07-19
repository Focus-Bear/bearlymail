import { GMAIL_LABELS } from "../constants/email-labels";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { MILLISECONDS, MINUTES_PER_HOUR } from "../constants/time-constants";
import { cleanEmailContent } from "../llm/email-content-cleaner";

export type ThreadPayload = {
  threadId?: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  receivedAt: string;
  isRead?: boolean;
  timeToReply?: number | null;
  starCount?: number;
  isArchived?: boolean;
  userReplied?: boolean;
  emailCount?: number;
  readCount?: number;
  receivedHour?: number;
};

export type RawThread = {
  id: string;
  starCount?: number;
  isArchived?: boolean;
  emails: Array<{
    from: string;
    fromName?: string;
    subject: string;
    body: string;
    htmlBody?: string;
    receivedAt: Date;
    isRead?: boolean;
    labelIds?: string[];
  }>;
};

/**
 * Map a raw Gmail thread into a ThreadPayload for LLM analysis.
 * Pure function — can be unit tested independently.
 */
export function mapThreadToAnalysisPayload(
  thread: RawThread,
  userEmail: string | undefined,
): ThreadPayload | null {
  const firstEmail = thread.emails?.sort(
    (itemA, itemB) => itemA.receivedAt.getTime() - itemB.receivedAt.getTime(),
  )[0];
  if (!firstEmail) return null;

  const userReplied = thread.emails?.some(
    (email) =>
      email.labelIds?.includes(GMAIL_LABELS.SENT) ||
      (userEmail && email.from.toLowerCase() === userEmail),
  );

  let quickestReply: number | null = null;
  if (userReplied) {
    const sentEmails = thread.emails.filter(
      (email) =>
        email.labelIds?.includes(GMAIL_LABELS.SENT) ||
        (userEmail && email.from.toLowerCase() === userEmail),
    );
    const receivedEmails = thread.emails.filter(
      (email) =>
        !email.labelIds?.includes(GMAIL_LABELS.SENT) &&
        (!userEmail || email.from.toLowerCase() !== userEmail),
    );
    if (sentEmails.length > 0 && receivedEmails.length > 0) {
      const firstReceived = receivedEmails[0].receivedAt;
      const firstSent = sentEmails[0].receivedAt;
      const replyTimeHours =
        (firstSent.getTime() - firstReceived.getTime()) / MILLISECONDS.HOUR;
      if (replyTimeHours >= 0) {
        quickestReply = replyTimeHours;
      }
    }
  }

  return {
    threadId: thread.id,
    from: firstEmail.from,
    fromName: firstEmail.fromName,
    subject: firstEmail.subject,
    body: cleanEmailContent(
      firstEmail.body,
      firstEmail.htmlBody,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    ),
    receivedAt: firstEmail.receivedAt.toISOString(),
    isRead: firstEmail.isRead,
    timeToReply: quickestReply ? quickestReply * MINUTES_PER_HOUR : null,
    starCount: thread.starCount || 0,
    isArchived: thread.isArchived || false,
    userReplied,
    emailCount: thread.emails?.length || 0,
    readCount:
      thread.emails?.filter((emailEntry) => emailEntry.isRead).length || 0,
    receivedHour: firstEmail.receivedAt.getHours(),
  };
}

/**
 * Calculate exponential backoff delay with jitter.
 */
export function calculateBackoffDelay(
  attemptNumber: number,
  baseDelay: number = 1000,
  maxDelay: number = 60000,
  jitterFactor: number = 0.3,
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attemptNumber);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  const jitter = Math.random() * jitterFactor * cappedDelay;
  return Math.floor(cappedDelay + jitter);
}

/**
 * Classify a batch processing error into a named category for metrics.
 */
export function classifyBatchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("rate limit") || message.includes("429"))
    return "rate_limit";
  if (message.includes("timeout") || message.includes("ETIMEDOUT"))
    return "timeout";
  if (message.includes("token") && message.includes("limit"))
    return "token_limit";
  if (message.includes("parse") || message.includes("JSON"))
    return "parse_error";
  if (message.includes("ECONNREFUSED") || message.includes("ENOTFOUND"))
    return "network_error";
  return "unknown";
}
