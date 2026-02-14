import { Injectable, Inject, forwardRef, Logger } from "@nestjs/common";
import { UsersService } from "../../users/users.service";
import { EmailsService } from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import {
  EmailProvider,
  RawEmailMessage,
  EmailRecipient,
  EmailAttachmentData,
} from "../interfaces/email-provider.interface";
import PgBoss = require("pg-boss");
import { getJobPriority } from "../../queue/job-priorities";
import { QUERY_LIMITS } from "../../constants/query-limits";
import { BODY_PREVIEW_LENGTHS } from "../../constants/llm-constants";
import { DAYS } from "../../constants/time-constants";
import { isApiError, isError } from "../../types/common";
import { ZohoAccountsService } from "../../zoho-accounts/zoho-accounts.service";
import { ConfigService } from "@nestjs/config";
import { parseZohoMessage, ZohoMailMessage } from "./zoho/zoho-message-parser";
import { ZohoClient } from "./zoho/zoho-client";
import {
  isWithinGracePeriod,
  logZohoAuthFailure as logAuthFailure,
} from "./zoho/zoho-auth";
import {
  verifyThreadStatusesInZoho,
  getExistingThreadUpdates,
} from "./zoho/zoho-sync";
import {
  archiveThreadInZoho,
  unarchiveThreadInZoho,
  sendReplyViaZoho,
  sendEmailViaZoho,
  searchEmailsViaZoho,
  isAuthError,
} from "./zoho/zoho-operations";

@Injectable()
export class ZohoProvider implements EmailProvider {
  private readonly logger = new Logger(ZohoProvider.name);
  private readonly progressUpdateCounters = new Map<string, number>();
  private readonly client: ZohoClient;

  constructor(
    private usersService: UsersService,
    @Inject(forwardRef(() => EmailsService))
    private emailsService: EmailsService,
    private scanEmailService: ScanEmailService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private zohoAccountsService: ZohoAccountsService,
    private configService: ConfigService,
  ) {
    this.client = new ZohoClient(zohoAccountsService, configService);
  }

  async isConnected(userId: string): Promise<boolean> {
    return this.zohoAccountsService.hasConnectedZoho(userId);
  }

  async getAccountInfo(userId: string): Promise<{
    email?: string;
    name?: string;
    isPrimary?: boolean;
  } | null> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) return null;

    return {
      email: primaryAccount.email,
      name: primaryAccount.name,
      isPrimary: primaryAccount.isPrimary,
    };
  }

  async syncEmails(userId: string): Promise<void> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) {
      this.logger.log(
        `User ${userId} not connected to Zoho Mail, skipping sync.`,
      );
      return;
    }

    const user = await this.usersService.findOne(userId);
    if (!user) {
      this.logger.warn(`User ${userId} not found`);
      return;
    }

    const isInitialSync = !user.lastEmailSyncAt;
    const isRecentLogin = isWithinGracePeriod(user);

    if (!primaryAccount.refreshToken) {
      await this.handleMissingRefreshToken(
        userId,
        user,
        primaryAccount,
        isRecentLogin,
      );
    }

    const { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    let zohoAccountId: string;
    try {
      zohoAccountId = await this.client.getAccountId(userId, accessToken);
      this.logger.debug(`Token validated for user ${userId}`);
    } catch (refreshError: unknown) {
      await this.handleTokenValidationError(
        userId,
        user,
        primaryAccount,
        refreshError,
      );
    }

    try {
      await this.performSync(userId, zohoClient, zohoAccountId!, isInitialSync);
      await this.usersService.update(userId, {
        lastEmailSyncAt: new Date(),
      });
    } catch (error: unknown) {
      await this.handleSyncError(userId, user, primaryAccount, error);
    }
  }

  private async handleMissingRefreshToken(
    userId: string,
    user: any,
    primaryAccount: any,
    isRecentLogin: boolean,
  ): Promise<never> {
    await logAuthFailure(
      userId,
      user.email || null,
      "syncEmails-missingRefreshToken",
      new Error("Refresh token missing"),
      { hasAccessToken: !!primaryAccount.accessToken, isRecentLogin },
    );

    if (!isRecentLogin && !primaryAccount.needsRelogin) {
      await this.zohoAccountsService.updateTokens(
        primaryAccount.id,
        userId,
        primaryAccount.accessToken,
        undefined,
      );
      throw new Error("Refresh token missing - please log in again");
    } else if (isRecentLogin) {
      throw new Error(
        "Refresh token missing (within grace period - will retry)",
      );
    }
    throw new Error("Refresh token missing - please log in again");
  }

  private async handleTokenValidationError(
    userId: string,
    user: any,
    primaryAccount: any,
    refreshError: unknown,
  ): Promise<never> {
    let currentAccount = primaryAccount;
    try {
      currentAccount = await this.zohoAccountsService.findPrimary(userId);
    } catch {}

    const isRecentLoginNow = isWithinGracePeriod(user);
    await logAuthFailure(
      userId,
      user.email || null,
      "syncEmails-tokenValidation",
      refreshError,
      {
        hasRefreshToken: !!currentAccount?.refreshToken,
        isRecentLogin: isRecentLoginNow,
        gracePeriodActive: isRecentLoginNow,
      },
    );

    if (!isRecentLoginNow) {
      await this.zohoAccountsService.updateTokens(
        currentAccount.id,
        userId,
        currentAccount.accessToken,
        undefined,
      );
      throw new Error("Token validation failed - please log in again");
    }
    throw new Error(
      "Token validation failed (within grace period - will retry)",
    );
  }

  private async performSync(
    userId: string,
    zohoClient: any,
    zohoAccountId: string,
    isInitialSync: boolean,
  ): Promise<void> {
    const [inboxResponse, importantResponse] = await Promise.all([
      zohoClient.get(`/accounts/${zohoAccountId}/messages`, {
        params: {
          limit: 500,
          sort: "receivedTime",
          sortorder: "desc",
          folderid: "inbox",
          isRead: false,
        },
      }),
      zohoClient.get(`/accounts/${zohoAccountId}/messages`, {
        params: {
          limit: 500,
          sort: "receivedTime",
          sortorder: "desc",
          importance: "high",
        },
      }),
    ]);

    const inboxMessages = inboxResponse.data.data || [];
    const importantMessages = importantResponse.data.data || [];

    const threadMap = new Map<string, ZohoMailMessage[]>();
    for (const msg of [...inboxMessages, ...importantMessages]) {
      if (!msg.uid) continue;
      const threadId = msg.threadId || msg.uid;
      if (!threadMap.has(threadId)) threadMap.set(threadId, []);
      threadMap.get(threadId)!.push(msg);
    }

    this.logger.debug(
      `Found ${inboxMessages.length} inbox and ${importantMessages.length} important messages`,
    );

    const threadUpdates = await this.processThreads(
      userId,
      threadMap,
      inboxMessages,
      zohoClient,
      zohoAccountId,
      isInitialSync,
    );
    await this.applyThreadUpdates(userId, threadUpdates);
    await this.checkExistingStarredThreads(
      userId,
      threadMap,
      zohoClient,
      zohoAccountId,
    );
    await this.checkNonArchivedThreads(
      userId,
      threadMap,
      zohoClient,
      zohoAccountId,
    );
  }

  private async processThreads(
    userId: string,
    threadMap: Map<string, ZohoMailMessage[]>,
    inboxMessages: any[],
    zohoClient: any,
    zohoAccountId: string,
    isInitialSync: boolean,
  ): Promise<{ starUpdates: any[]; archivedUpdates: any[] }> {
    const starUpdates: any[] = [];
    const archivedUpdates: any[] = [];

    for (const [threadId, messages] of threadMap.entries()) {
      if (!threadId || messages.length === 0) continue;

      try {
        const latestMessage = messages.sort(
          (a, b) => (b.receivedTime || 0) - (a.receivedTime || 0),
        )[0];
        const isInInbox = inboxMessages.some(
          (m) => m.threadId === threadId || m.uid === threadId,
        );
        const isImportant = latestMessage.importance === "high";

        starUpdates.push({ threadId, starCount: isImportant ? 3 : 0 });
        archivedUpdates.push({ threadId, isArchived: !isInInbox });

        for (const message of messages) {
          if (!message.uid) continue;
          await this.processMessage(
            userId,
            message,
            threadId,
            zohoClient,
            zohoAccountId,
            isImportant ? 3 : 0,
            isInitialSync,
          );
        }
      } catch (threadError: unknown) {
        this.handleThreadProcessingError(threadId, threadError);
      }
    }

    return { starUpdates, archivedUpdates };
  }

  private async processMessage(
    userId: string,
    message: any,
    threadId: string,
    zohoClient: any,
    zohoAccountId: string,
    starCount: number,
    isInitialSync: boolean,
  ): Promise<void> {
    const fullMsg = await zohoClient.get(
      `/accounts/${zohoAccountId}/messages/${message.uid}`,
    );
    const messageData = (fullMsg.data.data || fullMsg.data) as ZohoMailMessage;
    const rawEmail = parseZohoMessage(messageData);
    if (!rawEmail) return;

    const existing = await this.emailsService.getEmailByMessageId(
      userId,
      message.uid,
    );
    if (existing) {
      if (existing.isRead !== messageData.isRead) {
        await this.emailsService.updateEmail(existing.id, {
          isRead: messageData.isRead || false,
        });
      }
      return;
    }

    await this.emailsService.createEmail(
      userId,
      { ...rawEmail, starCount } as RawEmailMessage,
      { skipBatching: isInitialSync },
    );
  }

  private handleThreadProcessingError(threadId: string, error: unknown): void {
    if (isApiError(error) && error.code === 404) {
      this.logger.debug(
        `Thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found`,
      );
    } else {
      const errorMsg = isError(error)
        ? error.message
        : isApiError(error)
          ? error.message
          : "Unknown";
      this.logger.warn(
        `Error processing thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...`,
        errorMsg,
      );
    }
  }

  private async applyThreadUpdates(
    userId: string,
    updates: { starUpdates: any[]; archivedUpdates: any[] },
  ): Promise<void> {
    if (updates.starUpdates.length > 0)
      await this.emailsService.batchUpdateThreadStarCount(
        userId,
        updates.starUpdates,
      );
    if (updates.archivedUpdates.length > 0)
      await this.emailsService.batchUpdateThreadArchivedStatuses(
        userId,
        updates.archivedUpdates,
      );
  }

  private async checkExistingStarredThreads(
    userId: string,
    threadMap: Map<string, any>,
    zohoClient: any,
    zohoAccountId: string,
  ): Promise<void> {
    const existingStarredThreads =
      await this.emailsService.getExistingStarredThreads(userId);
    const threadMapKeys = new Set(threadMap.keys());
    const updates = await getExistingThreadUpdates(
      userId,
      existingStarredThreads,
      threadMapKeys,
      zohoClient,
      zohoAccountId,
    );

    if (updates.length > 0) {
      await this.emailsService.batchUpdateThreadStarCount(
        userId,
        updates.map((u) => ({ threadId: u.threadId, starCount: u.starCount })),
      );
      await this.emailsService.batchUpdateThreadArchivedStatuses(
        userId,
        updates.map((u) => ({
          threadId: u.threadId,
          isArchived: u.isArchived,
        })),
      );
    }
  }

  private async checkNonArchivedThreads(
    userId: string,
    threadMap: Map<string, any>,
    zohoClient: any,
    zohoAccountId: string,
  ): Promise<void> {
    const threadsNeedingCheck =
      await this.emailsService.getNonArchivedThreadsNeedingCheck(
        userId,
        QUERY_LIMITS.PROVIDER_BATCH_SIZE,
      );
    const threadsToCheck = threadsNeedingCheck.filter(
      (id) => !threadMap.has(id),
    );

    if (threadsToCheck.length > 0) {
      const updates = await verifyThreadStatusesInZoho(
        userId,
        threadsToCheck,
        zohoClient,
        zohoAccountId,
      );
      if (updates.length > 0) {
        await this.emailsService.batchUpdateThreadStarCount(
          userId,
          updates.map((u) => ({
            threadId: u.threadId,
            starCount: u.starCount,
          })),
        );
        await this.emailsService.batchUpdateThreadArchivedStatuses(
          userId,
          updates.map((u) => ({
            threadId: u.threadId,
            isArchived: u.isArchived,
          })),
        );
        await this.emailsService.updateThreadsLastCheckedAt(
          userId,
          updates.map((u) => u.threadId),
        );
      }
    }
  }

  private async handleSyncError(
    userId: string,
    user: any,
    primaryAccount: any,
    error: unknown,
  ): Promise<never> {
    const apiError = isApiError(error) ? error : null;
    const errorMsg = isError(error) ? error.message : apiError?.message || "";
    const isAuthErrorFlag =
      apiError?.code === 401 ||
      (apiError?.response && (apiError.response as any).status === 401) ||
      errorMsg.includes("Token refresh failed");

    if (isAuthErrorFlag) {
      let currentUser = user;
      try {
        currentUser = await this.usersService.findOne(userId);
      } catch {}
      const isRecentLogin = isWithinGracePeriod(currentUser);
      await logAuthFailure(
        userId,
        currentUser?.email || null,
        "syncEmails-zohoApi",
        error,
        {
          hasRefreshToken: !!primaryAccount.refreshToken,
          isRecentLogin,
          gracePeriodActive: isRecentLogin,
        },
      );

      if (!isRecentLogin) {
        await this.zohoAccountsService.updateTokens(
          primaryAccount.id,
          userId,
          primaryAccount.accessToken,
          undefined,
        );
      }
    }
    throw error;
  }

  async processScanEmail(userId: string, messageId: string): Promise<void> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) return;

    const existing = await this.scanEmailService.findByMessageId(
      userId,
      messageId,
    );
    if (existing) {
      await this.updateScanProgress(userId);
      return;
    }

    const { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);
      const fullMsg = await zohoClient.get(
        `/accounts/${zohoAccountId}/messages/${messageId}`,
      );
      const messageData = (fullMsg.data.data ||
        fullMsg.data) as ZohoMailMessage;
      const rawEmail = parseZohoMessage(messageData);
      if (!rawEmail) {
        await this.updateScanProgress(userId);
        return;
      }

      await this.scanEmailService.createScanEmail(userId, {
        ...rawEmail,
        isArchived: messageData.folderId !== "inbox",
      });
      await this.updateScanProgress(userId);
    } catch (error: unknown) {
      await this.updateScanProgress(userId);
      if (isAuthError(error)) {
        try {
          await this.client.refreshTokenIfNeeded(userId, primaryAccount.id);
          await this.processScanEmail(userId, messageId);
        } catch {}
      }
    }
  }

  private async updateScanProgress(userId: string): Promise<void> {
    const currentCount = (this.progressUpdateCounters.get(userId) || 0) + 1;
    this.progressUpdateCounters.set(userId, currentCount);

    if (currentCount % 10 === 0) {
      const result = await this.usersService.incrementScanProgress(userId, 10);
      this.progressUpdateCounters.set(userId, 0);
      if (result.isComplete) {
        this.progressUpdateCounters.delete(userId);
        await this.boss.send(
          "analyze-scan-results",
          { userId },
          { priority: getJobPriority("analyze-scan-results", false) },
        );
      }
    }
  }

  async scanHistory(userId: string): Promise<void> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) return;

    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DAYS.WEEK);
      const sevenDaysAgoTimestamp = Math.floor(sevenDaysAgo.getTime() / 1000);

      const response = await zohoClient.get(
        `/accounts/${zohoAccountId}/messages`,
        {
          params: {
            limit: 300,
            sort: "receivedTime",
            sortorder: "desc",
            folderid: "inbox",
          },
        },
      );

      const messages = response.data.data || [];
      const filteredMessages = messages.filter(
        (msg: any) => msg.receivedTime >= sevenDaysAgoTimestamp,
      );
      const total = Math.min(
        filteredMessages.length,
        BODY_PREVIEW_LENGTHS.BATCH_PREVIEW,
      );

      await this.usersService.update(userId, {
        scanTotal: total,
        scanProgress: 0,
      });
      this.progressUpdateCounters.set(userId, 0);

      for (let i = 0; i < total; i++) {
        if (!filteredMessages[i].uid) continue;
        try {
          await this.processScanEmail(userId, filteredMessages[i].uid);
        } catch {}
      }

      const finalProgress = await this.usersService.incrementScanProgress(
        userId,
        this.progressUpdateCounters.get(userId) || 0,
      );
      this.progressUpdateCounters.delete(userId);
      if (finalProgress.isComplete) {
        await this.boss.send(
          "analyze-scan-results",
          { userId },
          { priority: getJobPriority("analyze-scan-results", false) },
        );
      }
      await this.usersService.update(userId, { hasScannedHistory: true });
    } catch (error: unknown) {
      if (isAuthError(error)) {
        try {
          accessToken = await this.client.refreshTokenIfNeeded(
            userId,
            primaryAccount.id,
          );
          await this.scanHistory(userId);
          return;
        } catch {}
        throw new Error("Token refresh failed - please reconnect");
      }
      throw error;
    }
  }

  async sendReply(
    userId: string,
    threadId: string,
    to: string,
    subject: string,
    body: string,
    attachments?: EmailAttachmentData[],
    htmlBody?: string,
  ): Promise<{ messageId: string; threadId: string }> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) throw new Error("Zoho Mail account not connected.");

    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);
      const result = await sendReplyViaZoho(
        zohoClient,
        zohoAccountId,
        to,
        subject,
        htmlBody || body,
        threadId,
      );
      this.logger.log(`Reply sent for user ${userId} to ${to}`);
      return { messageId: result.messageId, threadId };
    } catch (error: unknown) {
      if (isAuthError(error)) {
        accessToken = await this.client.refreshTokenIfNeeded(
          userId,
          primaryAccount.id,
        );
        return this.sendReply(userId, threadId, to, subject, body, attachments);
      }
      throw new Error("Failed to send reply");
    }
  }

  async sendEmail(
    userId: string,
    to: EmailRecipient[],
    subject: string,
    body: string,
    cc?: EmailRecipient[],
    bcc?: EmailRecipient[],
    _attachments?: EmailAttachmentData[], // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{ messageId: string; threadId: string }> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) throw new Error("Zoho Mail account not connected.");

    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);
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
        accessToken = await this.client.refreshTokenIfNeeded(
          userId,
          primaryAccount.id,
        );
        return this.sendEmail(userId, to, subject, body, cc, bcc);
      }
      throw new Error("Failed to send email");
    }
  }

  async searchEmails(
    userId: string,
    query: string,
    maxResults = 50,
  ): Promise<RawEmailMessage[]> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) return [];

    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);
      const messages = await searchEmailsViaZoho(
        zohoClient,
        zohoAccountId,
        query,
        maxResults,
      );
      return messages
        .map((msg) => parseZohoMessage(msg))
        .filter((m): m is RawEmailMessage => m !== null);
    } catch (error: unknown) {
      if (isAuthError(error)) {
        accessToken = await this.client.refreshTokenIfNeeded(
          userId,
          primaryAccount.id,
        );
        return this.searchEmails(userId, query, maxResults);
      }
      return [];
    }
  }

  async archiveThread(userId: string, threadId: string): Promise<void> {
    this.logger.log(
      `[Zoho Archive] Starting: userId=${userId}, threadId=${threadId}`,
    );
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) throw new Error("Zoho Mail account not connected");

    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);
      await archiveThreadInZoho(userId, threadId, zohoClient, zohoAccountId);
      await this.emailsService.updateThreadArchivedStatus(
        userId,
        threadId,
        true,
      );
      this.logger.log(`[Zoho Archive] Thread archived successfully`);
    } catch (error: unknown) {
      if (isAuthError(error)) {
        accessToken = await this.client.refreshTokenIfNeeded(
          userId,
          primaryAccount.id,
        );
        await this.archiveThread(userId, threadId);
        return;
      }
      throw new Error("Failed to archive thread");
    }
  }

  async unarchiveThread(userId: string, threadId: string): Promise<void> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) throw new Error("Zoho Mail account not connected");

    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);
      await unarchiveThreadInZoho(userId, threadId, zohoClient, zohoAccountId);
      await this.emailsService.updateThreadArchivedStatus(
        userId,
        threadId,
        false,
      );
    } catch (error: unknown) {
      if (isAuthError(error)) {
        accessToken = await this.client.refreshTokenIfNeeded(
          userId,
          primaryAccount.id,
        );
        await this.unarchiveThread(userId, threadId);
        return;
      }
      throw new Error("Failed to unarchive thread");
    }
  }

  async syncStarStatusToGmail(
    _userId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
    threadId: string,
    _starCount: number, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<void> {
    this.logger.debug(
      `syncStarStatusToGmail called for Zoho (not implemented): ${threadId}`,
    );
  }

  async snoozeThread(
    _userId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
    threadId: string,
    _snoozeUntil: Date, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<void> {
    this.logger.warn(
      `snoozeThread called for Zoho (not implemented): ${threadId}`,
    );
  }

  async unsnoozeThread(userId: string, threadId: string): Promise<void> {
    this.logger.warn(
      `unsnoozeThread called for Zoho (not implemented): ${threadId}`,
    );
  }

  async getAttachment(
    _userId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
    _messageId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
    _attachmentId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
    _attachmentMetadata?: { filename: string; mimeType: string; size: number }, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<{
    data: Buffer;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    throw new Error("Attachment download not yet implemented for Zoho");
  }

  async addLabelToThread(
    _userId: string, // eslint-disable-line @typescript-eslint/no-unused-vars
    threadId: string,
    labelName: string,
  ): Promise<void> {
    this.logger.debug(
      `addLabelToThread called for Zoho (not implemented): ${threadId}, label=${labelName}`,
    );
  }

  async trashThread(userId: string, threadId: string): Promise<void> {
    this.logger.debug(`trashThread called for Zoho (using archive instead)`);
    await this.archiveThread(userId, threadId);
  }
}
