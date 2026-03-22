import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosInstance } from "axios";
import PgBoss from "pg-boss";

import { ERROR_MESSAGES } from "../../constants/error-messages";
import { HTTP_STATUS } from "../../constants/http-status";
import { JOB_NAMES } from "../../constants/job-names";
import { BODY_PREVIEW_LENGTHS } from "../../constants/llm-constants";
import { QUERY_LIMITS } from "../../constants/query-limits";
import { DAYS, MS_PER_SECOND } from "../../constants/time-constants";
import { User } from "../../database/entities/user.entity";
import { ZohoAccount } from "../../database/entities/zoho-account.entity";
import { getJobPriority } from "../../queue/job-priorities";
import { isApiError, isError } from "../../types/common";
import { UsersService } from "../../users/users.service";
import { ZohoAccountsService } from "../../zoho-accounts/zoho-accounts.service";
import { EmailsService } from "../emails.service";
import {
  EmailAttachmentData,
  EmailProvider,
  EmailRecipient,
  RawEmailMessage,
  SendReplyOptions,
} from "../interfaces/email-provider.interface";
import { ScanEmailService } from "../scan-email.service";
import {
  archiveThread,
  searchEmails,
  sendEmail,
  sendReply,
  trashThread,
  unarchiveThread,
} from "./zoho/zoho-actions.service";
import {
  isWithinGracePeriod,
  logZohoAuthFailure as logAuthFailure,
} from "./zoho/zoho-auth";
import { ZohoClient } from "./zoho/zoho-client";
import { parseZohoMessage, ZohoMailMessage } from "./zoho/zoho-message-parser";
import { isAuthError } from "./zoho/zoho-operations";
import {
  getExistingThreadUpdates,
  verifyThreadStatusesInZoho,
} from "./zoho/zoho-sync";

@Injectable()
export class ZohoProvider implements EmailProvider {
  public readonly logger = new Logger(ZohoProvider.name);
  private readonly progressUpdateCounters = new Map<string, number>();
  public readonly client: ZohoClient;

  constructor(
    private usersService: UsersService,
    @Inject(forwardRef(() => EmailsService))
    public emailsService: EmailsService,
    private scanEmailService: ScanEmailService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    public zohoAccountsService: ZohoAccountsService,
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
    user: User,
    primaryAccount: ZohoAccount,
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
      throw new Error(ERROR_MESSAGES.REFRESH_TOKEN_MISSING);
    } else if (isRecentLogin) {
      throw new Error(
        "Refresh token missing (within grace period - will retry)",
      );
    }
    throw new Error(ERROR_MESSAGES.REFRESH_TOKEN_MISSING);
  }

  private async handleTokenValidationError(
    userId: string,
    user: User,
    primaryAccount: ZohoAccount,
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
    zohoClient: AxiosInstance,
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
    inboxMessages: ZohoMailMessage[],
    zohoClient: AxiosInstance,
    zohoAccountId: string,
    isInitialSync: boolean,
  ): Promise<{
    starUpdates: { threadId: string; starCount: number }[];
    archivedUpdates: { threadId: string; isArchived: boolean }[];
  }> {
    const starUpdates: { threadId: string; starCount: number }[] = [];
    const archivedUpdates: { threadId: string; isArchived: boolean }[] = [];

    for (const [threadId, messages] of threadMap.entries()) {
      if (!threadId || messages.length === 0) continue;

      try {
        const latestMessage = messages.sort(
          (itemA, itemB) =>
            (itemB.receivedTime || 0) - (itemA.receivedTime || 0),
        )[0];
        const isInInbox = inboxMessages.some(
          (message) =>
            message.threadId === threadId || message.uid === threadId,
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
    message: ZohoMailMessage,
    threadId: string,
    zohoClient: AxiosInstance,
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
    if (isApiError(error) && error.code === HTTP_STATUS.NOT_FOUND) {
      this.logger.debug(
        `Thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found`,
      );
    } else {
      const errorMsg =
        isError(error) || isApiError(error) ? error.message : "Unknown";
      this.logger.warn(
        `Error processing thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...`,
        errorMsg,
      );
    }
  }

  private async applyThreadUpdates(
    userId: string,
    updates: {
      starUpdates: { threadId: string; starCount: number }[];
      archivedUpdates: { threadId: string; isArchived: boolean }[];
    },
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
    threadMap: Map<string, ZohoMailMessage[]>,
    zohoClient: AxiosInstance,
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
        updates.map((update) => ({
          threadId: update.threadId,
          starCount: update.starCount,
        })),
      );
      await this.emailsService.batchUpdateThreadArchivedStatuses(
        userId,
        updates.map((update) => ({
          threadId: update.threadId,
          isArchived: update.isArchived,
        })),
      );
    }
  }

  private async checkNonArchivedThreads(
    userId: string,
    threadMap: Map<string, ZohoMailMessage[]>,
    zohoClient: AxiosInstance,
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
          updates.map((update) => ({
            threadId: update.threadId,
            starCount: update.starCount,
          })),
        );
        await this.emailsService.batchUpdateThreadArchivedStatuses(
          userId,
          updates.map((update) => ({
            threadId: update.threadId,
            isArchived: update.isArchived,
          })),
        );
        await this.emailsService.updateThreadsLastCheckedAt(
          userId,
          updates.map((update) => update.threadId),
        );
      }
    }
  }

  private async handleSyncError(
    userId: string,
    user: User,
    primaryAccount: ZohoAccount,
    error: unknown,
  ): Promise<never> {
    const apiError = isApiError(error) ? error : null;
    const errorMsg = isError(error) ? error.message : apiError?.message || "";
    const isAuthErrorFlag =
      apiError?.code === HTTP_STATUS.UNAUTHORIZED ||
      (apiError?.response &&
        apiError.response.status === HTTP_STATUS.UNAUTHORIZED) ||
      errorMsg.includes("Token refresh failed");

    if (isAuthErrorFlag) {
      let currentUser: User | null = user;
      try {
        currentUser = await this.usersService.findOne(userId);
      } catch {}
      const isRecentLogin = isWithinGracePeriod(currentUser || user);
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

      const isArchived =
        messageData.folderId !== "inbox" && messageData.folderId !== "trash";
      const isDeleted = messageData.folderId === "trash";
      const tags = (messageData.tags as string[]) || [];
      await this.scanEmailService.createScanEmail(userId, {
        ...rawEmail,
        isArchived: isArchived || isDeleted,
        labels: tags,
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
          JOB_NAMES.ANALYZE_SCAN_RESULTS,
          { userId },
          { priority: getJobPriority(JOB_NAMES.ANALYZE_SCAN_RESULTS, false) },
        );
      }
    }
  }

  /** Fetches recent inbox + trash messages from Zoho and filters to the last DAYS.WEEK days. */
  private async fetchRecentZohoMessages(
    zohoClient: AxiosInstance,
    zohoAccountId: string,
  ): Promise<ZohoMailMessage[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DAYS.WEEK);
    const sevenDaysAgoTimestamp = Math.floor(
      sevenDaysAgo.getTime() / MS_PER_SECOND,
    );

    const [inboxResponse, trashResponse] = await Promise.all([
      zohoClient.get(`/accounts/${zohoAccountId}/messages`, {
        params: {
          limit: 200,
          sort: "receivedTime",
          sortorder: "desc",
          folderid: "inbox",
        },
      }),
      zohoClient.get(`/accounts/${zohoAccountId}/messages`, {
        params: {
          limit: 100,
          sort: "receivedTime",
          sortorder: "desc",
          folderid: "trash",
        },
      }),
    ]);

    const allMessages = [
      ...(inboxResponse.data.data || []),
      ...(trashResponse.data.data || []),
    ] as ZohoMailMessage[];
    return allMessages.filter(
      (msg) => (msg.receivedTime ?? 0) >= sevenDaysAgoTimestamp,
    );
  }

  async scanHistory(userId: string): Promise<void> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) return;

    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);
      const filteredMessages = await this.fetchRecentZohoMessages(
        zohoClient,
        zohoAccountId,
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
          JOB_NAMES.ANALYZE_SCAN_RESULTS,
          { userId },
          { priority: getJobPriority(JOB_NAMES.ANALYZE_SCAN_RESULTS, false) },
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
    options?: SendReplyOptions,
  ): Promise<{ messageId: string; threadId: string }> {
    return sendReply(this, userId, threadId, to, subject, body, options);
  }

  async sendEmail(
    userId: string,
    to: EmailRecipient[],
    subject: string,
    body: string,
    cc?: EmailRecipient[],
    bcc?: EmailRecipient[],
    _attachments?: EmailAttachmentData[],
  ): Promise<{ messageId: string; threadId: string }> {
    return sendEmail(this, userId, to, subject, body, cc, bcc, _attachments);
  }

  async searchEmails(
    userId: string,
    query: string,
    maxResults = QUERY_LIMITS.SEARCH_DEFAULT_RESULTS,
  ): Promise<RawEmailMessage[]> {
    return searchEmails(this, userId, query, maxResults);
  }

  async archiveThread(userId: string, threadId: string): Promise<void> {
    return archiveThread(this, userId, threadId);
  }

  async unarchiveThread(userId: string, threadId: string): Promise<void> {
    return unarchiveThread(this, userId, threadId);
  }

  async syncStarStatusToGmail(
    _userId: string,
    threadId: string,
    _starCount: number,
  ): Promise<void> {
    this.logger.debug(
      `syncStarStatusToGmail called for Zoho (not implemented): ${threadId}`,
    );
  }

  async snoozeThread(
    _userId: string,
    threadId: string,
    _snoozeUntil: Date,
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
    _userId: string,
    _messageId: string,
    _attachmentId: string,
    _attachmentMetadata?: { filename: string; mimeType: string; size: number },
  ): Promise<{
    attachmentBuffer: Buffer;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    throw new Error("Attachment download not yet implemented for Zoho");
  }

  async addLabelToThread(
    _userId: string,
    threadId: string,
    labelName: string,
  ): Promise<void> {
    this.logger.debug(
      `addLabelToThread called for Zoho (not implemented): ${threadId}, label=${labelName}`,
    );
  }

  async trashThread(userId: string, threadId: string): Promise<void> {
    return trashThread(this, userId, threadId);
  }
}
