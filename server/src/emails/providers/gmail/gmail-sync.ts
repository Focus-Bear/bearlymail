import { Logger } from "@nestjs/common";
import { gmail_v1 } from "googleapis";

import { HTTP_STATUS } from "../../../constants/http-status";
import { QUERY_LIMITS } from "../../../constants/query-limits";
import { isApiError, isError } from "../../../types/common";
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

          // Archive status is based on latest message (if latest is in INBOX, thread is in inbox)
          const latestMessage = thread.messages[thread.messages.length - 1];
          const latestLabelIds = latestMessage.labelIds || [];

          updates.push({
            threadId,
            starCount: hasStarredMessage ? 3 : 0,
            isArchived: !latestLabelIds.includes("INBOX"),
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

      // Archive status is based on latest message (if latest is in INBOX, thread is in inbox)
      const latestMessage = thread.messages[thread.messages.length - 1];
      const latestLabelIds = latestMessage.labelIds || [];

      updates.push({
        threadId: dbThread.threadId,
        starCount: hasStarredMessage ? 3 : 0,
        isArchived: !latestLabelIds.includes("INBOX"),
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
 * Check if error is an auth error
 */
export function isGmailAuthError(error: unknown): boolean {
  const apiError = isApiError(error) ? error : null;
  const errorMsg = isError(error) ? error.message : apiError?.message || "";
  return (
    apiError?.code === HTTP_STATUS.UNAUTHORIZED ||
    (apiError?.response &&
      apiError.response.status === HTTP_STATUS.UNAUTHORIZED) ||
    (errorMsg && errorMsg.includes("invalid_grant"))
  );
}
