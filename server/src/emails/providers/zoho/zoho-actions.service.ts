import { ERROR_MESSAGES } from "../../../constants/error-messages";
import {
  EmailAttachmentData,
  EmailRecipient,
  RawEmailMessage,
  SendReplyOptions,
} from "../../interfaces/email-provider.interface";
import type { ZohoProvider } from "../zoho.provider";
import { parseZohoMessage } from "./zoho-message-parser";
import {
  archiveThreadInZoho,
  isAuthError,
  searchEmailsViaZoho,
  sendEmailViaZoho,
  sendReplyViaZoho,
  unarchiveThreadInZoho,
} from "./zoho-operations";

export async function sendReply(
  provider: ZohoProvider,
  userId: string,
  threadId: string,
  to: string,
  subject: string,
  body: string,
  options?: SendReplyOptions,
): Promise<{ messageId: string; threadId: string }> {
  const { htmlBody, cc, bcc } = options ?? {};
  const primaryAccount = await provider.zohoAccountsService.findPrimary(userId);
  if (!primaryAccount) throw new Error("Zoho Mail account not connected.");

  let { accessToken } = primaryAccount;
  const zohoClient = provider.client.createZohoClient(accessToken);

  try {
    const zohoAccountId = await provider.client.getAccountId(
      userId,
      accessToken,
    );
    const result = await sendReplyViaZoho(zohoClient, zohoAccountId, {
      to,
      subject,
      htmlBody: htmlBody || body,
      threadId,
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
      return sendReply(provider, userId, threadId, to, subject, body, options);
    }
    throw new Error(ERROR_MESSAGES.FAILED_TO_SEND_REPLY);
  }
}

export async function sendEmail(
  provider: ZohoProvider,
  userId: string,
  to: EmailRecipient[],
  subject: string,
  body: string,
  cc?: EmailRecipient[],
  bcc?: EmailRecipient[],
  _attachments?: EmailAttachmentData[],
): Promise<{ messageId: string; threadId: string }> {
  const primaryAccount = await provider.zohoAccountsService.findPrimary(userId);
  if (!primaryAccount) throw new Error("Zoho Mail account not connected.");

  let { accessToken } = primaryAccount;
  const zohoClient = provider.client.createZohoClient(accessToken);

  try {
    const zohoAccountId = await provider.client.getAccountId(
      userId,
      accessToken,
    );
    return await sendEmailViaZoho(
      zohoClient,
      zohoAccountId,
      to,
      subject,
      body,
      cc,
      bcc,
    );
  } catch (error: unknown) {
    if (isAuthError(error)) {
      accessToken = await provider.client.refreshTokenIfNeeded(
        userId,
        primaryAccount.id,
      );
      return sendEmail(provider, userId, to, subject, body, cc, bcc);
    }
    throw new Error(ERROR_MESSAGES.FAILED_TO_SEND_EMAIL);
  }
}

export async function searchEmails(
  provider: ZohoProvider,
  userId: string,
  query: string,
  maxResults = 50,
): Promise<RawEmailMessage[]> {
  const primaryAccount = await provider.zohoAccountsService.findPrimary(userId);
  if (!primaryAccount) return [];

  let { accessToken } = primaryAccount;
  const zohoClient = provider.client.createZohoClient(accessToken);

  try {
    const zohoAccountId = await provider.client.getAccountId(
      userId,
      accessToken,
    );
    const messages = await searchEmailsViaZoho(
      zohoClient,
      zohoAccountId,
      query,
      maxResults,
    );
    return messages
      .map((msg) => parseZohoMessage(msg))
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
  provider: ZohoProvider,
  userId: string,
  threadId: string,
): Promise<void> {
  provider.logger.log(
    `[Zoho Archive] Starting: userId=${userId}, threadId=${threadId}`,
  );
  const primaryAccount = await provider.zohoAccountsService.findPrimary(userId);
  if (!primaryAccount) throw new Error("Zoho Mail account not connected");

  let { accessToken } = primaryAccount;
  const zohoClient = provider.client.createZohoClient(accessToken);

  try {
    const zohoAccountId = await provider.client.getAccountId(
      userId,
      accessToken,
    );
    await archiveThreadInZoho(userId, threadId, zohoClient, zohoAccountId);
    await provider.emailsService.updateThreadArchivedStatus(
      userId,
      threadId,
      true,
    );
    provider.logger.log(`[Zoho Archive] Thread archived successfully`);
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
  provider: ZohoProvider,
  userId: string,
  threadId: string,
): Promise<void> {
  const primaryAccount = await provider.zohoAccountsService.findPrimary(userId);
  if (!primaryAccount) throw new Error("Zoho Mail account not connected");

  let { accessToken } = primaryAccount;
  const zohoClient = provider.client.createZohoClient(accessToken);

  try {
    const zohoAccountId = await provider.client.getAccountId(
      userId,
      accessToken,
    );
    await unarchiveThreadInZoho(userId, threadId, zohoClient, zohoAccountId);
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

export async function trashThread(
  provider: ZohoProvider,
  userId: string,
  threadId: string,
): Promise<void> {
  provider.logger.debug(`trashThread called for Zoho (using archive instead)`);
  await archiveThread(provider, userId, threadId);
}
