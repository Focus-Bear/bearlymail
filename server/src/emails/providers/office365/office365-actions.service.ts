import { ERROR_MESSAGES } from "../../../constants/error-messages";
import {
  EmailAttachmentData,
  EmailRecipient,
  RawEmailMessage,
  SendReplyOptions,
} from "../../interfaces/email-provider.interface";
import type { Office365Provider } from "../office365.provider";
import { parseOffice365Message } from "./office365-message-parser";
import {
  archiveThreadInOffice365,
  fetchThreadMessagesViaOffice365,
  isAuthError,
  searchEmailsViaOffice365,
  sendEmailViaOffice365,
  sendReplyViaOffice365,
  unarchiveThreadInOffice365,
} from "./office365-operations";

export async function sendReply(
  provider: Office365Provider,
  userId: string,
  params: {
    threadId: string;
    to: string;
    subject: string;
    body: string;
    options?: SendReplyOptions;
  },
): Promise<{ messageId: string; threadId: string }> {
  const { threadId, to, subject, body, options } = params;
  const { htmlBody, cc, bcc } = options ?? {};
  const primaryAccount =
    await provider.office365AccountsService.findPrimary(userId);
  if (!primaryAccount) throw new Error("Office 365 account not connected.");

  let { accessToken } = primaryAccount;
  const graphClient = provider.client.createGraphClient(accessToken);

  try {
    const result = await sendReplyViaOffice365(graphClient, {
      to,
      subject,
      htmlBody: htmlBody || body,
      cc,
      bcc,
    });
    provider.logger.log(`Reply sent for user ${userId} to ${to}`);
    return { messageId: result.messageId, threadId };
  } catch (error: unknown) {
    if (isAuthError(error)) {
      accessToken = await provider.client.refreshTokenIfNeeded(
        userId,
        primaryAccount.id,
      );
      return sendReply(provider, userId, {
        threadId,
        to,
        subject,
        body,
        options,
      });
    }
    throw new Error(ERROR_MESSAGES.FAILED_TO_SEND_REPLY);
  }
}

export async function sendEmail(
  provider: Office365Provider,
  userId: string,
  params: {
    to: EmailRecipient[];
    subject: string;
    body: string;
    cc?: EmailRecipient[];
    bcc?: EmailRecipient[];
    attachments?: EmailAttachmentData[];
  },
): Promise<{ messageId: string; threadId: string }> {
  const { to, subject, body, cc, bcc, attachments } = params;
  const primaryAccount =
    await provider.office365AccountsService.findPrimary(userId);
  if (!primaryAccount) throw new Error("Office 365 account not connected.");

  let { accessToken } = primaryAccount;
  const graphClient = provider.client.createGraphClient(accessToken);

  try {
    return await sendEmailViaOffice365(graphClient, {
      to,
      subject,
      htmlBody: body,
      cc,
      bcc,
      attachments,
    });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      accessToken = await provider.client.refreshTokenIfNeeded(
        userId,
        primaryAccount.id,
      );
      return sendEmail(provider, userId, params);
    }
    throw new Error(ERROR_MESSAGES.FAILED_TO_SEND_EMAIL);
  }
}

export async function searchEmails(
  provider: Office365Provider,
  userId: string,
  query: string,
  maxResults = 50,
): Promise<RawEmailMessage[]> {
  const primaryAccount =
    await provider.office365AccountsService.findPrimary(userId);
  if (!primaryAccount) return [];

  let { accessToken } = primaryAccount;
  const graphClient = provider.client.createGraphClient(accessToken);

  try {
    const messages = await searchEmailsViaOffice365(
      graphClient,
      query,
      maxResults,
    );
    return messages
      .map((msg) => parseOffice365Message(msg))
      .filter((msg): msg is RawEmailMessage => msg !== null);
  } catch (error: unknown) {
    if (isAuthError(error)) {
      accessToken = await provider.client.refreshTokenIfNeeded(
        userId,
        primaryAccount.id,
      );
      return searchEmails(provider, userId, query, maxResults);
    }
    return [];
  }
}

export async function archiveThread(
  provider: Office365Provider,
  userId: string,
  threadId: string,
): Promise<void> {
  provider.logger.log(
    `[Office365 Archive] Starting: userId=${userId}, threadId=${threadId}`,
  );
  const primaryAccount =
    await provider.office365AccountsService.findPrimary(userId);
  if (!primaryAccount) throw new Error("Office 365 account not connected");

  let { accessToken } = primaryAccount;
  const graphClient = provider.client.createGraphClient(accessToken);

  try {
    await archiveThreadInOffice365(userId, threadId, graphClient);
    await provider.emailsService.updateThreadArchivedStatus(
      userId,
      threadId,
      true,
    );
    provider.logger.log(`[Office365 Archive] Thread archived successfully`);
  } catch (error: unknown) {
    if (isAuthError(error)) {
      accessToken = await provider.client.refreshTokenIfNeeded(
        userId,
        primaryAccount.id,
      );
      await archiveThread(provider, userId, threadId);
      return;
    }
    throw new Error("Failed to archive thread");
  }
}

export async function unarchiveThread(
  provider: Office365Provider,
  userId: string,
  threadId: string,
): Promise<void> {
  const primaryAccount =
    await provider.office365AccountsService.findPrimary(userId);
  if (!primaryAccount) throw new Error("Office 365 account not connected");

  let { accessToken } = primaryAccount;
  const graphClient = provider.client.createGraphClient(accessToken);

  try {
    await unarchiveThreadInOffice365(userId, threadId, graphClient);
    await provider.emailsService.updateThreadArchivedStatus(
      userId,
      threadId,
      false,
    );
  } catch (error: unknown) {
    if (isAuthError(error)) {
      accessToken = await provider.client.refreshTokenIfNeeded(
        userId,
        primaryAccount.id,
      );
      await unarchiveThread(provider, userId, threadId);
      return;
    }
    throw new Error("Failed to unarchive thread");
  }
}

export async function fetchThreadMessagesOffice365(
  provider: Office365Provider,
  userId: string,
  threadId: string,
  limit = 50,
): Promise<RawEmailMessage[]> {
  const primaryAccount =
    await provider.office365AccountsService.findPrimary(userId);
  if (!primaryAccount) return [];

  const { accessToken } = primaryAccount;
  const graphClient = provider.client.createGraphClient(accessToken);

  try {
    const messages = await fetchThreadMessagesViaOffice365(
      graphClient,
      threadId,
      limit,
    );
    return messages
      .map((msg) => parseOffice365Message(msg))
      .filter((msg): msg is RawEmailMessage => msg !== null);
  } catch (error: unknown) {
    if (isAuthError(error)) {
      await provider.client.refreshTokenIfNeeded(userId, primaryAccount.id);
      return fetchThreadMessagesOffice365(provider, userId, threadId, limit);
    }
    return [];
  }
}

export async function trashThread(
  provider: Office365Provider,
  userId: string,
  threadId: string,
): Promise<void> {
  provider.logger.debug(
    `trashThread called for Office365 (using archive instead)`,
  );
  await archiveThread(provider, userId, threadId);
}
