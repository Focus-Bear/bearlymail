import { Logger } from "@nestjs/common";
import { AxiosInstance } from "axios";
import { isApiError } from "../../../types/common";
import { HTTP_STATUS } from "../../../constants/http-status";
import { ZohoMailMessage } from "./zoho-message-parser";

const logger = new Logger("ZohoOperations");

/**
 * Archive a thread in Zoho by marking messages as read and moving to archive
 */
export async function archiveThreadInZoho(
  userId: string,
  threadId: string,
  zohoClient: AxiosInstance,
  zohoAccountId: string,
): Promise<{ success: boolean; archivedCount: number; totalCount: number }> {
  logger.log(
    `[Zoho Archive] Fetching messages for thread: userId=${userId}, threadId=${threadId}`,
  );

  const response = await zohoClient.get(`/accounts/${zohoAccountId}/messages`, {
    params: { threadId },
  });

  const messages = response.data.data || [];
  logger.log(`[Zoho Archive] Found ${messages.length} messages in thread`);

  let archivedCount = 0;
  for (const msg of messages) {
    try {
      await zohoClient.put(
        `/accounts/${zohoAccountId}/messages/${msg.uid}/markAsRead`,
        {},
      );
      await zohoClient.post(
        `/accounts/${zohoAccountId}/messages/${msg.uid}/move`,
        { folderid: "archive" },
      );
      archivedCount++;
    } catch (error) {
      logger.error(
        `[Zoho Archive] Failed to archive message ${msg.uid}:`,
        error,
      );
    }
  }

  logger.log(
    `[Zoho Archive] Archived ${archivedCount}/${messages.length} messages`,
  );
  return {
    success: archivedCount > 0 || messages.length === 0,
    archivedCount,
    totalCount: messages.length,
  };
}

/**
 * Unarchive a thread in Zoho by moving messages back to inbox
 */
export async function unarchiveThreadInZoho(
  userId: string,
  threadId: string,
  zohoClient: AxiosInstance,
  zohoAccountId: string,
): Promise<{ success: boolean; movedCount: number; totalCount: number }> {
  const response = await zohoClient.get(`/accounts/${zohoAccountId}/messages`, {
    params: { threadId, folderid: "archive" },
  });

  const messages = response.data.data || [];
  let movedCount = 0;

  for (const msg of messages) {
    try {
      await zohoClient.post(
        `/accounts/${zohoAccountId}/messages/${msg.uid}/move`,
        { folderid: "inbox" },
      );
      movedCount++;
    } catch (error) {
      logger.error(`Failed to unarchive message ${msg.uid}:`, error);
    }
  }

  return {
    success: movedCount > 0 || messages.length === 0,
    movedCount,
    totalCount: messages.length,
  };
}

/**
 * Parse a comma-separated recipient string (supports "Name <email>" format)
 * into an array of Zoho address objects.
 */
function parseRecipientsToZoho(
  recipientStr: string,
): Array<{ address: string; personal?: string }> {
  return recipientStr
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
    .map((r) => {
      const match = r.match(/^(.*?)\s*<([^>]+)>$/);
      if (match) {
        const name = match[1].trim();
        const address = match[2].trim();
        return name ? { address, personal: name } : { address };
      }
      return { address: r };
    });
}

/**
 * Send a reply email via Zoho
 */
export async function sendReplyViaZoho(
  zohoClient: AxiosInstance,
  zohoAccountId: string,
  options: {
    to: string;
    subject: string;
    htmlBody: string;
    threadId: string;
    cc?: string;
  },
): Promise<{ messageId: string }> {
  const { to, subject, htmlBody, threadId, cc } = options;
  const message: Record<string, unknown> = {
    to: parseRecipientsToZoho(to),
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    content: { html: htmlBody },
    inReplyTo: threadId,
  };

  if (cc) {
    message.cc = parseRecipientsToZoho(cc);
  }

  const response = await zohoClient.post(
    `/accounts/${zohoAccountId}/messages`,
    message,
  );

  return { messageId: response?.data?.messageId || `zoho-${Date.now()}` };
}

/**
 * Send a new email via Zoho
 */

export async function sendEmailViaZoho(
  zohoClient: AxiosInstance,
  zohoAccountId: string,
  to: Array<{ email: string; name?: string }>,
  subject: string,
  htmlBody: string,
  cc?: Array<{ email: string; name?: string }>,
  bcc?: Array<{ email: string; name?: string }>,
): Promise<{ messageId: string; threadId: string }> {
  interface ZohoRecipient {
    address: string;
    personal?: string;
  }
  interface ZohoMessageBody {
    to: ZohoRecipient[];
    subject: string;
    content: { html: string };
    cc?: ZohoRecipient[];
    bcc?: ZohoRecipient[];
  }
  const message: ZohoMessageBody = {
    to: to.map((r) => ({ address: r.email, personal: r.name })),
    subject,
    content: { html: htmlBody },
  };

  if (cc?.length)
    message.cc = cc.map((r) => ({ address: r.email, personal: r.name }));
  if (bcc?.length)
    message.bcc = bcc.map((r) => ({ address: r.email, personal: r.name }));

  const response = await zohoClient.post(
    `/accounts/${zohoAccountId}/messages`,
    message,
  );
  const messageId = response.data.data?.uid || `msg-${Date.now()}`;

  return { messageId, threadId: response.data.data?.threadId || messageId };
}

/**
 * Search emails via Zoho
 */
export async function searchEmailsViaZoho(
  zohoClient: AxiosInstance,
  zohoAccountId: string,
  query: string,
  maxResults: number,
): Promise<ZohoMailMessage[]> {
  const response = await zohoClient.get(
    `/accounts/${zohoAccountId}/messages/search`,
    {
      params: { query, limit: maxResults },
    },
  );
  return response.data.data || [];
}

/**
 * Check if error is an auth error
 */
export function isAuthError(error: unknown): boolean {
  const apiError = isApiError(error) ? error : null;
  return (
    apiError?.code === HTTP_STATUS.UNAUTHORIZED ||
    (apiError?.response &&
      apiError.response.status === HTTP_STATUS.UNAUTHORIZED)
  );
}
