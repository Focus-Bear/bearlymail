import { Logger } from "@nestjs/common";
import { AxiosInstance } from "axios";

import {
  EMAIL_IMPORTANCE,
  ZOHO_FOLDER_IDS,
} from "../../../constants/domain-types";
import { HTTP_STATUS } from "../../../constants/http-status";
import { QUERY_LIMITS } from "../../../constants/query-limits";
import { isApiError, isError } from "../../../types/common";

const logger = new Logger("ZohoSync");

/**
 * Verify thread statuses in Zoho API in batches with concurrency limits
 * Returns array of updates: { threadId, starCount, isArchived }[]
 */
export async function verifyThreadStatusesInZoho(
  userId: string,
  threadIds: string[],
  zohoClient: AxiosInstance,
  zohoAccountId: string,
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
          const threadResponse = await zohoClient.get(
            `/accounts/${zohoAccountId}/messages`,
            { params: { threadId, limit: 1 } },
          );

          const threadMessages = threadResponse.data.data || [];
          if (threadMessages.length === 0) {
            updates.push({ threadId, starCount: 0, isArchived: true });
            return;
          }

          const latestMessage = threadMessages[0];
          const isImportant =
            latestMessage.importance === EMAIL_IMPORTANCE.HIGH;
          const isInInbox = latestMessage.folderId === ZOHO_FOLDER_IDS.INBOX;

          updates.push({
            threadId,
            starCount: isImportant ? 3 : 0,
            isArchived: !isInInbox,
          });
        } catch (threadError: unknown) {
          if (
            isApiError(threadError) &&
            threadError.code === HTTP_STATUS.NOT_FOUND
          ) {
            logger.debug(
              `Thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found in Zoho`,
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
  threadMapKeys: Set<string>,
  zohoClient: AxiosInstance,
  zohoAccountId: string,
): Promise<
  Array<{ threadId: string; starCount: number; isArchived: boolean }>
> {
  const updates: Array<{
    threadId: string;
    starCount: number;
    isArchived: boolean;
  }> = [];

  for (const dbThread of threadsToCheck) {
    if (threadMapKeys.has(dbThread.threadId)) continue;

    try {
      const threadResponse = await zohoClient.get(
        `/accounts/${zohoAccountId}/messages`,
        { params: { threadId: dbThread.threadId, limit: 1 } },
      );

      const threadMessages = threadResponse.data.data || [];
      if (threadMessages.length === 0) {
        updates.push({
          threadId: dbThread.threadId,
          starCount: 0,
          isArchived: true,
        });
        continue;
      }

      const latestMessage = threadMessages[0];
      updates.push({
        threadId: dbThread.threadId,
        starCount: latestMessage.importance === EMAIL_IMPORTANCE.HIGH ? 3 : 0,
        isArchived: latestMessage.folderId !== ZOHO_FOLDER_IDS.INBOX,
      });
    } catch (threadError: unknown) {
      if (
        isApiError(threadError) &&
        threadError.code === HTTP_STATUS.NOT_FOUND
      ) {
        updates.push({
          threadId: dbThread.threadId,
          starCount: 0,
          isArchived: true,
        });
      }
    }
  }

  return updates;
}
