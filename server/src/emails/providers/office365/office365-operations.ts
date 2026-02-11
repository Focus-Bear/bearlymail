import { Logger } from "@nestjs/common";
import { AxiosInstance } from "axios";
import { isApiError } from "../../../types/common";
import { QUERY_LIMITS } from "../../../constants/query-limits";

const logger = new Logger("Office365Operations");

/**
 * Archive a thread in Office365 by marking messages as read and moving to archive
 */
export async function archiveThreadInOffice365(
  userId: string,
  threadId: string,
  graphClient: AxiosInstance,
): Promise<{ success: boolean; archivedCount: number; totalCount: number }> {
  logger.log(
    `[Office365 Archive] Fetching messages for conversation: userId=${userId}, threadId=${threadId}`,
  );

  const response = await graphClient.get("/me/messages", {
    params: {
      $filter: `conversationId eq '${threadId}'`,
      $select: "id",
    },
  });

  const messages = response.data.value || [];
  logger.log(
    `[Office365 Archive] Found ${messages.length} messages in conversation: userId=${userId}, threadId=${threadId}`,
  );

  // Mark messages as read and move to archive folder
  let archivedCount = 0;
  for (const msg of messages) {
    try {
      // First mark the message as read
      logger.log(
        `[Office365 Archive] Marking message as read: userId=${userId}, threadId=${threadId}, messageId=${msg.id}`,
      );
      await graphClient.patch(`/me/messages/${msg.id}`, {
        isRead: true,
      });

      // Then move to archive folder
      logger.log(
        `[Office365 Archive] Moving message to archive: userId=${userId}, threadId=${threadId}, messageId=${msg.id}`,
      );
      await graphClient.post(`/me/messages/${msg.id}/move`, {
        destinationId: "archive",
      });
      archivedCount++;
    } catch (error) {
      logger.error(
        `[Office365 Archive] Failed to archive message ${msg.id}:`,
        error,
      );
    }
  }

  logger.log(
    `[Office365 Archive] Marked as read and moved ${archivedCount}/${messages.length} messages to archive: userId=${userId}, threadId=${threadId}`,
  );

  return {
    success: archivedCount > 0 || messages.length === 0,
    archivedCount,
    totalCount: messages.length,
  };
}

/**
 * Unarchive a thread in Office365 by moving messages back to inbox
 */
export async function unarchiveThreadInOffice365(
  userId: string,
  threadId: string,
  graphClient: AxiosInstance,
): Promise<{ success: boolean; movedCount: number; totalCount: number }> {
  // Get all messages in the conversation from archive
  const archiveResponse = await graphClient.get(
    "/me/mailFolders/archive/messages",
    {
      params: {
        $filter: `conversationId eq '${threadId}'`,
        $select: "id",
      },
    },
  );

  const messages = archiveResponse.data.value || [];
  let movedCount = 0;

  // Move messages back to inbox
  for (const msg of messages) {
    try {
      await graphClient.post(`/me/messages/${msg.id}/move`, {
        destinationId: "inbox",
      });
      movedCount++;
    } catch (error) {
      logger.error(`Failed to unarchive message ${msg.id}:`, error);
    }
  }

  return {
    success: movedCount > 0 || messages.length === 0,
    movedCount,
    totalCount: messages.length,
  };
}

/**
 * Send a reply email via Office365
 */
export async function sendReplyViaOffice365(
  graphClient: AxiosInstance,
  to: string,
  subject: string,
  htmlBody: string,
): Promise<{ messageId: string }> {
  const response = await graphClient.post("/me/sendMail", {
    message: {
      subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
      body: {
        contentType: "HTML",
        content: htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
          },
        },
      ],
    },
  });

  return {
    messageId: response?.data?.id || `office365-${Date.now()}`,
  };
}

/**
 * Send a new email via Office365
 */
export async function sendEmailViaOffice365(
  graphClient: AxiosInstance,
  to: Array<{ email: string; name?: string }>,
  subject: string,
  htmlBody: string,
  cc?: Array<{ email: string; name?: string }>,
  bcc?: Array<{ email: string; name?: string }>,
): Promise<{ messageId: string; threadId: string }> {
  const message: any = {
    subject,
    body: {
      contentType: "HTML",
      content: htmlBody,
    },
    toRecipients: to.map((r) => ({
      emailAddress: {
        address: r.email,
        name: r.name,
      },
    })),
  };

  if (cc && cc.length > 0) {
    message.ccRecipients = cc.map((r) => ({
      emailAddress: {
        address: r.email,
        name: r.name,
      },
    }));
  }

  if (bcc && bcc.length > 0) {
    message.bccRecipients = bcc.map((r) => ({
      emailAddress: {
        address: r.email,
        name: r.name,
      },
    }));
  }

  await graphClient.post("/me/sendMail", {
    message,
  });

  // Microsoft Graph doesn't return messageId directly, so we'll use a generated one
  const messageId = `msg-${Date.now()}-${Math.random().toString(QUERY_LIMITS.RANDOM_BASE_36).substr(QUERY_LIMITS.RANDOM_STRING_START, QUERY_LIMITS.RANDOM_STRING_LENGTH)}`;
  const threadId = messageId; // Microsoft uses conversationId, but we'll use messageId as fallback

  return { messageId, threadId };
}

/**
 * Search emails via Office365
 */
export async function searchEmailsViaOffice365(
  graphClient: AxiosInstance,
  query: string,
  maxResults: number,
): Promise<any[]> {
  // Microsoft Graph search syntax
  const searchQuery =
    query.includes("from:") || query.includes("subject:")
      ? query
      : `subject:"${query}" OR from:"${query}" OR body:"${query}"`;

  const response = await graphClient.get("/me/messages", {
    params: {
      $search: searchQuery,
      $top: maxResults,
      $select:
        "id,subject,from,receivedDateTime,isRead,body,bodyPreview,conversationId,importance",
    },
  });

  return response.data.value || [];
}

/**
 * Handle auth error with retry using refreshed token
 */
export function isAuthError(error: unknown): boolean {
  const apiError = isApiError(error) ? error : null;
  return (
    apiError?.code === 401 ||
    (apiError?.response && (apiError.response as any).status === 401)
  );
}
