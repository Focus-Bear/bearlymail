import { Logger } from "@nestjs/common";
import { gmail_v1 } from "googleapis";

import { HTTP_STATUS } from "../../../constants/http-status";
import { QUERY_LIMITS } from "../../../constants/query-limits";
import { ApiError, isApiError, isError } from "../../../types/common";
import { logErrorToFile } from "../../../utils/error-logger";

const logger = new Logger("GmailSync");

/**
 * Check if ANY message in a thread has the STARRED label.
 * Gmail stores stars at the message level, not thread level.
 * A thread is considered starred if any of its messages are starred.
 */
export function isThreadStarred(
  messages: gmail_v1.Schema$Message[] | undefined,
): boolean {
  if (!messages || messages.length === 0) return false;
  return messages.some((msg) => (msg.labelIds || []).includes("STARRED"));
}

/**
 * Verify thread statuses in Gmail API in batches with concurrency limits
 * Returns array of updates: { threadId, starCount, isArchived }[]
 */
export async function verifyThreadStatusesInGmail(
  userId: string,
  threadIds: string[],
  gmail: gmail_v1.Gmail,
): Promise<
  Array<{ threadId: string; starCount: number; isArchived: boolean }>
> {
  const updates: Array<{
    threadId: string;
    starCount: number;
    isArchived: boolean;
  }> = [];

  const BATCH_SIZE = 50;
  const CONCURRENCY_LIMIT = 10;

  for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
    const batch = threadIds.slice(i, i + BATCH_SIZE);
    logger.debug(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(threadIds.length / BATCH_SIZE)} (${batch.length} threads)`,
    );

    const batchPromises: Promise<void>[] = [];
    for (let j = 0; j < batch.length; j += CONCURRENCY_LIMIT) {
      const concurrentBatch = batch.slice(j, j + CONCURRENCY_LIMIT);
      const concurrentPromises = concurrentBatch.map(async (threadId) => {
        if (!threadId) return;

        try {
          const threadData = await gmail.users.threads.get({
            userId: "me",
            id: threadId,
            format: "metadata",
            metadataHeaders: ["Subject", "From"],
          });

          const thread = threadData.data;
          if (!thread.messages || thread.messages.length === 0) {
            updates.push({ threadId, starCount: 0, isArchived: true });
            return;
          }

          // Check ALL messages for STARRED label (stars are per-message in Gmail)
          const hasStarredMessage = isThreadStarred(thread.messages);

          // A thread is in the INBOX if ANY of its messages has the INBOX label.
          // Checking only the latest message is incorrect: when a reply is sent
          // (e.g. by the auto-responder), the sent message becomes the latest and
          // carries only the SENT label — not INBOX — which would falsely mark
          // the thread as archived even though the original email is still in the
          // inbox (#857).
          const isInInbox = thread.messages.some((msg) =>
            (msg.labelIds ?? []).includes("INBOX"),
          );

          updates.push({
            threadId,
            starCount: hasStarredMessage ? 3 : 0,
            isArchived: !isInInbox,
          });
        } catch (threadError: unknown) {
          if (
            isApiError(threadError) &&
            threadError.code === HTTP_STATUS.NOT_FOUND
          ) {
            logger.debug(
              `Thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found in Gmail (may be deleted)`,
            );
            updates.push({ threadId, starCount: 0, isArchived: true });
          } else {
            let errorMsg: string;
            if (isError(threadError) || isApiError(threadError)) {
              errorMsg = threadError.message;
            } else {
              errorMsg = "Unknown error";
            }
            logger.warn(
              `Error checking thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...:`,
              errorMsg,
            );
            logErrorToFile(
              `Error checking thread in verifyThreadStatusesInGmail (userId: ${userId}, threadId: ${threadId})`,
              threadError,
              "GmailProvider",
            );
          }
        }
      });

      batchPromises.push(...concurrentPromises);
      await Promise.all(concurrentPromises);
    }

    await Promise.all(batchPromises);
  }

  return updates;
}

/**
 * Get thread status updates for existing starred threads
 */
export async function getExistingThreadUpdates(
  userId: string,
  threadsToCheck: Array<{ threadId: string }>,
  processedThreadIds: Set<string>,
  gmail: gmail_v1.Gmail,
): Promise<
  Array<{ threadId: string; starCount: number; isArchived: boolean }>
> {
  const updates: Array<{
    threadId: string;
    starCount: number;
    isArchived: boolean;
  }> = [];

  for (const dbThread of threadsToCheck) {
    if (processedThreadIds.has(dbThread.threadId)) continue;

    try {
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: dbThread.threadId,
        format: "metadata",
        metadataHeaders: ["Subject", "From"],
      });

      const thread = threadData.data;
      if (!thread.messages || thread.messages.length === 0) {
        updates.push({
          threadId: dbThread.threadId,
          starCount: 0,
          isArchived: true,
        });
        continue;
      }

      // Check ALL messages for STARRED label (stars are per-message in Gmail)
      const hasStarredMessage = isThreadStarred(thread.messages);

      // A thread is in the INBOX if ANY of its messages has the INBOX label.
      // The latest message is often a SENT reply (from the auto-responder or
      // the user) which only carries SENT — not INBOX — and should not be
      // used alone to determine archive status (#857).
      const isInInbox = thread.messages.some((msg) =>
        (msg.labelIds ?? []).includes("INBOX"),
      );

      updates.push({
        threadId: dbThread.threadId,
        starCount: hasStarredMessage ? 3 : 0,
        isArchived: !isInInbox,
      });
    } catch (threadError: unknown) {
      if (
        isApiError(threadError) &&
        threadError.code === HTTP_STATUS.NOT_FOUND
      ) {
        logger.debug(
          `Existing thread ${dbThread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found in Gmail`,
        );
        updates.push({
          threadId: dbThread.threadId,
          starCount: 0,
          isArchived: true,
        });
      } else {
        let errorMsg: string;
        if (isError(threadError) || isApiError(threadError)) {
          errorMsg = threadError.message;
        } else {
          errorMsg = "Unknown error";
        }
        logger.warn(
          `Error checking existing thread ${dbThread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...:`,
          errorMsg,
        );
        logErrorToFile(
          `Error checking existing starred thread (userId: ${userId}, threadId: ${dbThread.threadId})`,
          threadError,
          "GmailProvider",
        );
      }
    }
  }

  return updates;
}

/**
 * Gmail 403 error reasons that mean the OAuth token is missing required scopes.
 * These are auth failures the user must resolve by reconnecting — distinct from
 * transient 403s like `userRateLimitExceeded` / `rateLimitExceeded`.
 */
const INSUFFICIENT_SCOPE_REASONS = new Set(["insufficientPermissions"]);

/**
 * Resolve the HTTP status from a Gaxios/Google API error, which surfaces it on
 * either the top-level `code`/`status` or the nested `response.status`.
 */
function getHttpStatus(apiError: ApiError | null): number | undefined {
  const candidate =
    apiError?.code ?? apiError?.status ?? apiError?.response?.status;
  return typeof candidate === "number" ? candidate : undefined;
}

/**
 * Collect Google API error reasons from both the top-level `errors` array and
 * the nested `response.data.error.errors` array (Gaxios populates one or both).
 */
function collectErrorReasons(apiError: ApiError | null): string[] {
  const reasons: string[] = [];
  for (const entry of apiError?.errors ?? []) {
    if (entry?.reason) reasons.push(entry.reason);
  }
  const nested = apiError?.response?.data as
    | { error?: { errors?: Array<{ reason?: string }> } }
    | undefined;
  for (const entry of nested?.error?.errors ?? []) {
    if (entry?.reason) reasons.push(entry.reason);
  }
  return reasons;
}

/**
 * Detect a Gmail 403 caused by missing OAuth scopes (the token works but lacks
 * permission), which requires the user to reconnect with full scopes. Matches
 * the `insufficientPermissions` reason or an `insufficient_scope` indicator in
 * the message/body/headers, while explicitly NOT matching transient rate-limit
 * 403s (`userRateLimitExceeded` / `rateLimitExceeded`).
 */
function isInsufficientScopeError(
  apiError: ApiError | null,
  errorMsg: string,
): boolean {
  const reasons = collectErrorReasons(apiError);
  if (reasons.some((reason) => INSUFFICIENT_SCOPE_REASONS.has(reason))) {
    return true;
  }
  // www-authenticate: Bearer ... error="insufficient_scope" and JSON bodies
  // that mention insufficient scopes are reliable scope-failure signals.
  const haystacks = [
    errorMsg,
    JSON.stringify(apiError?.response?.data ?? ""),
    JSON.stringify(
      (apiError?.response as { headers?: unknown })?.headers ?? "",
    ),
  ].join(" ");
  return /insufficient_scope|insufficient authentication scopes/i.test(
    haystacks,
  );
}

/**
 * Check if error is an auth error
 */
export function isGmailAuthError(error: unknown): boolean {
  const apiError = isApiError(error) ? error : null;
  const errorMsg = isError(error) ? error.message : apiError?.message || "";
  const status = getHttpStatus(apiError);

  if (status === HTTP_STATUS.UNAUTHORIZED) return true;
  if (errorMsg && errorMsg.includes("invalid_grant")) return true;

  // 403s are ambiguous: missing scopes (auth — must reconnect) vs. rate limits
  // (transient — do NOT flag the user for relogin). Only the former counts.
  if (status === HTTP_STATUS.FORBIDDEN) {
    return isInsufficientScopeError(apiError, errorMsg);
  }

  return false;
}
