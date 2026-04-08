import { Logger } from "@nestjs/common";
import { AxiosInstance } from "axios";

import {
  EMAIL_IMPORTANCE,
  OFFICE365_FOLDER_IDS,
} from "../../../constants/domain-types";
import { HTTP_STATUS } from "../../../constants/http-status";
import { QUERY_LIMITS } from "../../../constants/query-limits";
import { isApiError, isError } from "../../../types/common";

const logger = new Logger("Office365Sync");

/**
 * Verify thread statuses in Office365 API in batches with concurrency limits
 * Returns array of updates: { threadId, starCount, isArchived }[]
 */
export async function verifyThreadStatusesInOffice365(
  userId: string,
  threadIds: string[],
  graphClient: AxiosInstance,
): Promise<
  Array<{ threadId: string; starCount: number; isArchived: boolean }>
> {
  const updates: Array<{
    threadId: string;
    starCount: number;
    isArchived: boolean;
  }> = [];

  // Process threads in batches with concurrency limit
  const BATCH_SIZE = 50;
  const CONCURRENCY_LIMIT = 10;

  for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
    const batch = threadIds.slice(i, i + BATCH_SIZE);
    logger.debug(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(threadIds.length / BATCH_SIZE)} (${batch.length} threads)`,
    );

    // Process batch with concurrency limit
    const batchPromises: Promise<void>[] = [];
    for (let j = 0; j < batch.length; j += CONCURRENCY_LIMIT) {
      const concurrentBatch = batch.slice(j, j + CONCURRENCY_LIMIT);
      const concurrentPromises = concurrentBatch.map(async (threadId) => {
        if (!threadId) return;

        try {
          // Get conversation from Office365 to check current status
          const conversationResponse = await graphClient.get(`/me/messages`, {
            params: {
              $filter: `conversationId eq '${threadId}'`,
              $top: 1,
              $select: "id,conversationId,importance,parentFolderId",
            },
          });

          const conversationMessages = conversationResponse.data.value || [];
          if (conversationMessages.length === 0) {
            // Thread deleted in Office365 - mark as archived
            updates.push({
              threadId,
              starCount: 0,
              isArchived: true,
            });
            return;
          }

          const latestMessage = conversationMessages[0];
          const isImportant =
            latestMessage.importance === EMAIL_IMPORTANCE.HIGH;
          const isInInbox =
            latestMessage.parentFolderId === OFFICE365_FOLDER_IDS.INBOX;
          const starCount = isImportant ? 3 : 0;
          const isArchived = !isInInbox;

          updates.push({
            threadId,
            starCount,
            isArchived,
          });
        } catch (threadError: unknown) {
          // Thread not found (404) or other error - mark as archived
          if (
            isApiError(threadError) &&
            threadError.code === HTTP_STATUS.NOT_FOUND
          ) {
            logger.debug(
              `Thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found in Office365 (may be deleted)`,
            );
            updates.push({
              threadId,
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
              `Error checking thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...:`,
              errorMsg,
            );
            // Don't add to updates if we can't verify status
          }
        }
      });

      batchPromises.push(...concurrentPromises);
      // Wait for this concurrent batch to complete before starting next
      await Promise.all(concurrentPromises);
    }

    // Wait for entire batch to complete
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
  threadMapKeys: Set<string>,
  graphClient: AxiosInstance,
): Promise<
  Array<{ threadId: string; starCount: number; isArchived: boolean }>
> {
  const updates: Array<{
    threadId: string;
    starCount: number;
    isArchived: boolean;
  }> = [];

  for (const dbThread of threadsToCheck) {
    // Skip if we already processed this thread in the main sync
    if (threadMapKeys.has(dbThread.threadId)) {
      continue;
    }

    try {
      // Get conversation from Office365 to check current status
      const conversationResponse = await graphClient.get(`/me/messages`, {
        params: {
          $filter: `conversationId eq '${dbThread.threadId}'`,
          $top: 1,
          $select: "id,conversationId,importance,parentFolderId",
        },
      });

      const conversationMessages = conversationResponse.data.value || [];
      if (conversationMessages.length === 0) {
        // Thread deleted in Office365 - mark as archived
        updates.push({
          threadId: dbThread.threadId,
          starCount: 0,
          isArchived: true,
        });
        continue;
      }

      const latestMessage = conversationMessages[0];
      const isImportant = latestMessage.importance === EMAIL_IMPORTANCE.HIGH;
      const isInInbox =
        latestMessage.parentFolderId === OFFICE365_FOLDER_IDS.INBOX;
      const starCount = isImportant ? 3 : 0;
      const isArchived = !isInInbox;

      updates.push({
        threadId: dbThread.threadId,
        starCount,
        isArchived,
      });
    } catch (threadError: unknown) {
      // Thread not found (404) or other error - mark as archived
      if (
        isApiError(threadError) &&
        threadError.code === HTTP_STATUS.NOT_FOUND
      ) {
        logger.debug(
          `Existing thread ${dbThread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found in Office365 (may be deleted)`,
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
      }
    }
  }

  return updates;
}
