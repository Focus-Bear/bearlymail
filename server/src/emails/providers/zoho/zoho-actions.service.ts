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
  fetchThreadMessagesViaZoho,
  isAuthError,
  searchEmailsViaZoho,
  sendEmailViaZoho,
  sendReplyViaZoho,
  unarchiveThreadInZoho,
} from "./zoho-operations";

export async function sendReply(
  provider: ZohoProvider,
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
  const primaryAccount = await provider.zohoAccountsService.findPrimary(userId);
  if (!primaryAccount) throw new Error("Zoho Mail account not connected.");

  let { accessToken } = primaryAccount;
  const { accountsServer } = primaryAccount;
  const zohoClient = provider.client.createZohoClient(
    accessToken,
    accountsServer,
  );

  try {
    const { zohoAccountId } = await provider.client.getAccountId(
      userId,
      accessToken,
      accountsServer,
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
      return sendReply(provider, userId, params);
    }
    throw new Error(ERROR_MESSAGES.FAILED_TO_SEND_REPLY);
  }
}

export async function sendEmail(
  provider: ZohoProvider,
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
  if (attachments && attachments.length > 0) {
    // TODO: Zoho attachments require a separate upload step (POST the file to
    // /messages/attachments, then reference the returned id on send). Not yet
    // implemented — warn rather than silently dropping so the gap is visible.
    provider.logger.warn(
      `[Zoho] sendEmail received ${attachments.length} attachment(s) for user ${userId}, but Zoho attachment upload is not implemented — sending without them.`,
    );
  }
  const primaryAccount = await provider.zohoAccountsService.findPrimary(userId);
  if (!primaryAccount) throw new Error("Zoho Mail account not connected.");

  let { accessToken } = primaryAccount;
  const { accountsServer } = primaryAccount;
  const zohoClient = provider.client.createZohoClient(
    accessToken,
    accountsServer,
  );

  try {
    const { zohoAccountId, mailboxAddress } =
      await provider.client.getAccountId(userId, accessToken, accountsServer);
    return await sendEmailViaZoho(zohoClient, zohoAccountId, mailboxAddress, {
      to,
      subject,
      body,
      cc,
      bcc,
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
  provider: ZohoProvider,
  userId: string,
  query: string,
  maxResults = 50,
): Promise<RawEmailMessage[]> {
  const primaryAccount = await provider.zohoAccountsService.findPrimary(userId);
  if (!primaryAccount) return [];

  let { accessToken } = primaryAccount;
  const { accountsServer } = primaryAccount;
  const zohoClient = provider.client.createZohoClient(
    accessToken,
    accountsServer,
  );

  try {
    const { zohoAccountId } = await provider.client.getAccountId(
      userId,
      accessToken,
      accountsServer,
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
  const { accountsServer } = primaryAccount;
  const zohoClient = provider.client.createZohoClient(
    accessToken,
    accountsServer,
  );

  try {
    const { zohoAccountId } = await provider.client.getAccountId(
      userId,
      accessToken,
      accountsServer,
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
  const { accountsServer } = primaryAccount;
  const zohoClient = provider.client.createZohoClient(
    accessToken,
    accountsServer,
  );

  try {
    const { zohoAccountId } = await provider.client.getAccountId(
      userId,
      accessToken,
      accountsServer,
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

export async function fetchThreadMessagesZoho(
  provider: ZohoProvider,
  userId: string,
  threadId: string,
  limit = 50,
): Promise<RawEmailMessage[]> {
  const primaryAccount = await provider.zohoAccountsService.findPrimary(userId);
  if (!primaryAccount) return [];

  const { accessToken, accountsServer } = primaryAccount;
  const zohoClient = provider.client.createZohoClient(
    accessToken,
    accountsServer,
  );

  try {
    const { zohoAccountId } = await provider.client.getAccountId(
      userId,
      accessToken,
      accountsServer,
    );
    const messages = await fetchThreadMessagesViaZoho(
      zohoClient,
      zohoAccountId,
      threadId,
      limit,
    );
    return messages
      .map((msg) => parseZohoMessage(msg))
      .filter((msg): msg is RawEmailMessage => msg !== null);
  } catch (error: unknown) {
    if (isAuthError(error)) {
      await provider.client.refreshTokenIfNeeded(userId, primaryAccount.id);
      return fetchThreadMessagesZoho(provider, userId, threadId, limit);
    }
    provider.logger.warn(
      `Failed to fetch thread messages for user ${userId}: ${error}`,
    );
    return [];
  }
}
