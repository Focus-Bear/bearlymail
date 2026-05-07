import { Logger } from "@nestjs/common";
import { gmail_v1 } from "googleapis";

import { HTTP_STATUS } from "../../../constants/http-status";
import { formatGaxiosError, isApiError, isError } from "../../../types/common";
import { logErrorToFile } from "../../../utils/error-logger";

const logger = new Logger("GmailOperations");

/**
 * Archive a thread in Gmail by removing the INBOX label
 */
export async function archiveThreadInGmail(
  userId: string,
  threadId: string,
  gmail: gmail_v1.Gmail,
): Promise<void> {
  logger.log(
    `[Gmail Archive] Archiving thread: userId=${userId}, threadId=${threadId}`,
  );

  // Get thread with messages
  const threadData = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const thread = threadData.data;
  const messages = thread.messages || [];
  logger.log(`[Gmail Archive] Found ${messages.length} messages in thread`);

  // Mark all messages as read
  for (const message of messages) {
    if (!message.id) continue;
    const messageLabelIds = message.labelIds || [];

    if (messageLabelIds.includes("UNREAD")) {
      await gmail.users.messages.modify({
        userId: "me",
        id: message.id,
        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });
    }
  }

  // Remove INBOX label from thread (archive it)
  await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });

  logger.log(`[Gmail Archive] Thread archived successfully`);
}

/**
 * Unarchive a thread in Gmail by adding the INBOX label back
 */
export async function unarchiveThreadInGmail(
  userId: string,
  threadId: string,
  gmail: gmail_v1.Gmail,
): Promise<void> {
  logger.log(
    `[Gmail Unarchive] Unarchiving thread: userId=${userId}, threadId=${threadId}`,
  );

  await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      addLabelIds: ["INBOX"],
    },
  });

  logger.log(`[Gmail Unarchive] Thread unarchived successfully`);
}

/**
 * Trash all messages in a thread
 */
export async function trashThreadInGmail(
  userId: string,
  threadId: string,
  gmail: gmail_v1.Gmail,
): Promise<void> {
  const threadData = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });

  const thread = threadData.data;
  const messages = thread.messages || [];

  for (const message of messages) {
    if (!message.id) continue;
    await gmail.users.messages.trash({
      userId: "me",
      id: message.id,
    });
  }
}

/**
 * Sync star status to Gmail
 */
export async function syncStarStatusToGmail(
  userId: string,
  threadId: string,
  starCount: number,
  gmail: gmail_v1.Gmail,
): Promise<void> {
  const shouldBeStarred = starCount > 0;

  logger.log(
    `[Gmail Star Sync] threadId=${threadId}, targetStarCount=${starCount}, shouldBeStarred=${shouldBeStarred}`,
  );

  const threadData = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["Subject", "From"],
  });

  const thread = threadData.data;
  const messages = thread.messages || [];

  for (const message of messages) {
    if (!message.id) continue;
    const messageLabelIds = message.labelIds || [];
    const isCurrentlyStarred = messageLabelIds.includes("STARRED");

    if (shouldBeStarred && !isCurrentlyStarred) {
      await gmail.users.messages.modify({
        userId: "me",
        id: message.id,
        requestBody: {
          addLabelIds: ["STARRED"],
        },
      });
    } else if (!shouldBeStarred && isCurrentlyStarred) {
      await gmail.users.messages.modify({
        userId: "me",
        id: message.id,
        requestBody: {
          removeLabelIds: ["STARRED"],
        },
      });
    }
  }
}

/**
 * Sync read status to Gmail
 */
export async function syncReadStatusToGmail(
  userId: string,
  messageId: string,
  isRead: boolean,
  gmail: gmail_v1.Gmail,
): Promise<void> {
  try {
    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds: isRead ? [] : ["UNREAD"],
        removeLabelIds: isRead ? ["UNREAD"] : [],
      },
    });
  } catch (error: unknown) {
    const apiError = isApiError(error) ? error : null;
    const errorMsg = isError(error) ? error.message : apiError?.message || "";
    const isPermissionError =
      apiError?.code === HTTP_STATUS.FORBIDDEN ||
      (apiError?.response &&
        apiError.response.status === HTTP_STATUS.FORBIDDEN) ||
      errorMsg?.includes("Insufficient Permission");

    if (isPermissionError) {
      logger.warn(
        `Permission denied syncing read status to Gmail for message ${messageId}.`,
      );
    } else {
      logger.error(
        `Error syncing read status to Gmail for message ${messageId}: ${formatGaxiosError(error)}`,
      );
    }
    // Don't throw - allow operation to continue
  }
}

/**
 * Snooze a thread in Gmail by adding a custom label and removing INBOX
 * Uses thread-level modification for atomic operation on all messages
 */
export async function snoozeThreadInGmail(
  userId: string,
  threadId: string,
  snoozeLabelId: string,
  gmail: gmail_v1.Gmail,
): Promise<{ labeledCount: number }> {
  logger.log(`[Gmail Snooze] Starting snooze: threadId=${threadId}`);

  // Use thread-level modification for atomic operation on all messages
  // This is more reliable than modifying individual messages, especially
  // when new messages (like sent replies) are added to the thread
  const response = await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      addLabelIds: [snoozeLabelId],
      removeLabelIds: ["INBOX"],
    },
  });

  logger.log(
    `[Gmail Snooze] Thread snoozed successfully: threadId=${threadId}`,
  );
  return { labeledCount: response.data.messages?.length || 1 };
}

/**
 * Unsnooze a thread in Gmail by removing custom label and adding INBOX back
 * Uses thread-level modification for atomic operation on all messages
 */
export async function unsnoozeThreadInGmail(
  userId: string,
  threadId: string,
  snoozeLabelId: string,
  gmail: gmail_v1.Gmail,
): Promise<{ modifiedCount: number }> {
  logger.log(`[Gmail Unsnooze] Starting unsnooze: threadId=${threadId}`);

  // Use thread-level modification for atomic operation on all messages
  // This ensures all messages in the thread are restored to inbox
  const response = await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      addLabelIds: ["INBOX"],
      removeLabelIds: [snoozeLabelId],
    },
  });

  logger.log(
    `[Gmail Unsnooze] Thread unsnoozed successfully: threadId=${threadId}`,
  );
  return { modifiedCount: response.data.messages?.length || 1 };
}

/**
 * Ensure a custom label exists in Gmail, creating it if necessary
 */
export async function ensureLabelExists(
  gmail: gmail_v1.Gmail,
  labelName: string,
  labelCache: Map<string, Map<string, string>>,
  bearlyMailLabelCache: Map<string, string>,
  userId: string,
): Promise<string> {
  const cacheKey = `${userId}_${labelName}`;
  const cachedLabelId = bearlyMailLabelCache.get(cacheKey);
  if (cachedLabelId) {
    return cachedLabelId;
  }

  try {
    // First, try to find the label in existing labels
    const response = await gmail.users.labels.list({ userId: "me" });
    const labels = response.data.labels || [];

    for (const label of labels) {
      if (label.name === labelName && label.id) {
        bearlyMailLabelCache.set(cacheKey, label.id);
        return label.id;
      }
    }

    // Label doesn't exist, create it
    logger.log(`Creating ${labelName} label for user ${userId}`);
    const createResponse = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: labelName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });

    const labelId = createResponse.data.id;
    if (labelId) {
      bearlyMailLabelCache.set(cacheKey, labelId);
      labelCache.delete(userId);
      return labelId;
    }

    throw new Error("Failed to create label: no ID returned");
  } catch (error: unknown) {
    if (isApiError(error) && error.code === HTTP_STATUS.CONFLICT) {
      // Label already exists
      const response = await gmail.users.labels.list({ userId: "me" });
      const labels = response.data.labels || [];
      for (const label of labels) {
        if (label.name === labelName && label.id) {
          bearlyMailLabelCache.set(cacheKey, label.id);
          return label.id;
        }
      }
    }

    logger.error(
      `Failed to ensure ${labelName} label exists: ${formatGaxiosError(error)}`,
    );
    logErrorToFile(
      `Failed to ensure ${labelName} label exists (userId: ${userId})`,
      error,
      "GmailProvider",
    );
    throw error;
  }
}
