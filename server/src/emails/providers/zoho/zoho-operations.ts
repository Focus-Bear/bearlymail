import { Logger } from "@nestjs/common";
import { AxiosInstance } from "axios";

import { HTTP_STATUS } from "../../../constants/http-status";
import { isApiError } from "../../../types/common";
import { sanitizeAxiosError } from "../../../utils/axios-error.utils";
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
        `[Zoho Archive] Failed to archive message ${msg.uid}: ${sanitizeAxiosError(error)}`,
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
      logger.error(
        `Failed to unarchive message ${msg.uid}: ${sanitizeAxiosError(error)}`,
      );
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
    .map((recipient) => recipient.trim())
    .filter((recipient) => recipient.length > 0)
    .map((recipient) => {
      const match = recipient.match(/^(.*?)\s*<([^>]+)>$/);
      if (match) {
        const name = match[1].trim();
        const address = match[2].trim();
        return name ? { address, personal: name } : { address };
      }
      return { address: recipient };
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
    bcc?: string;
  },
): Promise<{ messageId: string }> {
  const { to, subject, htmlBody, threadId, cc, bcc } = options;
  const message: Record<string, unknown> = {
    to: parseRecipientsToZoho(to),
    subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    content: { html: htmlBody },
    inReplyTo: threadId,
  };

  if (cc) {
    message.cc = parseRecipientsToZoho(cc);
  }

  if (bcc) {
    message.bcc = parseRecipientsToZoho(bcc);
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
  fromAddress: string,
  params: {
    to: Array<{ email: string; name?: string }>;
    subject: string;
    body: string;
    cc?: Array<{ email: string; name?: string }>;
    bcc?: Array<{ email: string; name?: string }>;
  },
): Promise<{ messageId: string; threadId: string }> {
  const { to, subject, body: htmlBody, cc, bcc } = params;

  const message: Record<string, string> = {
    fromAddress,
    toAddress: to.map((recipient) => recipient.email).join(","),
    subject,
    content: htmlBody,
  };

  if (cc?.length)
    message.ccAddress = cc.map((recipient) => recipient.email).join(",");
  if (bcc?.length)
    message.bccAddress = bcc.map((recipient) => recipient.email).join(",");

  const response = await zohoClient.post(
    `/accounts/${zohoAccountId}/messages`,
    message,
  );

  const responseData = response.data.data;
  const messageId = responseData?.messageId || `msg-${Date.now()}`;
  return { messageId, threadId: responseData?.threadId || messageId };
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
      params: {
        searchKey: query,
        limit: maxResults,
      },
    },
  );
  return response.data.data || [];
}

/**
 * Fetch all messages in a thread via Zoho using the threadId parameter.
 * Unlike searchEmails which uses Gmail-style query syntax that Zoho doesn't support,
 * this uses Zoho's direct messages endpoint with threadId param.
 */
export async function fetchThreadMessagesViaZoho(
  zohoClient: AxiosInstance,
  zohoAccountId: string,
  threadId: string,
  limit: number,
): Promise<ZohoMailMessage[]> {
  const response = await zohoClient.get(`/accounts/${zohoAccountId}/messages`, {
    params: { threadId, limit },
  });
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
