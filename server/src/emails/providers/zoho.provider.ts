import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosInstance } from "axios";
import type { PgBoss } from "pg-boss";

import {
  EMAIL_IMPORTANCE,
  ZOHO_FOLDER_IDS,
} from "../../constants/domain-types";
import { ERROR_MESSAGES } from "../../constants/error-messages";
import { HTTP_STATUS } from "../../constants/http-status";
import { INJECT_TOKENS } from "../../constants/inject-tokens";
import { JOB_NAMES } from "../../constants/job-names";
import { BODY_PREVIEW_LENGTHS } from "../../constants/llm-constants";
import { QUERY_LIMITS } from "../../constants/query-limits";
import { DAYS, MS_PER_SECOND } from "../../constants/time-constants";
import { User } from "../../database/entities/user.entity";
import { ZohoAccount } from "../../database/entities/zoho-account.entity";
import { getJobPriority } from "../../queue/job-priorities";
import { isApiError, isError } from "../../types/common";
import { UsersService } from "../../users/users.service";
import { sanitizeAxiosError } from "../../utils/axios-error.utils";
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
  getOldestAllowedSyncDate,
  resolveMaxFetchResults,
  shouldFlagSyncWindowLimited,
} from "../sync-window-policy";
import {
  archiveThread,
  fetchThreadMessagesZoho,
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
import {
  parseReceivedTimeMs,
  parseZohoMessage,
  ZohoMailMessage,
} from "./zoho/zoho-message-parser";
import { isAuthError } from "./zoho/zoho-operations";
import {
  getExistingThreadUpdates,
  verifyThreadStatusesInZoho,
} from "./zoho/zoho-sync";

const ZOHO_SECONDS_EPOCH_THRESHOLD =
  10 * MS_PER_SECOND * MS_PER_SECOND * MS_PER_SECOND;

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
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
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

    // Validate/build the client BEFORE the sync try-catch-finally. A token
    // validation failure means no sync was attempted, so it must NOT advance
    // lastEmailSyncAt (which would burn the one-time initial-sync immediate
    // delivery for a new user who later authenticates). Mirrors the Gmail /
    // Office365 providers, where token validation sits outside the sync block.
    let client: { zohoClient: AxiosInstance; zohoAccountId: string };
    try {
      client = await this.validateAndGetZohoClient(
        userId,
        user,
        primaryAccount,
      );
    } catch (error: unknown) {
      await this.handleSyncError(userId, user, primaryAccount, error);
      return;
    }

    try {
      await this.performSync(
        userId,
        client.zohoClient,
        client.zohoAccountId,
        isInitialSync,
      );
    } catch (error: unknown) {
      await this.handleSyncError(userId, user, primaryAccount, error);
    } finally {
      // Always advance lastEmailSyncAt once a sync has been attempted, even if
      // performSync threw — otherwise a failed sync leaves it null and every
      // subsequent sync is treated as initial (skipBatching), permanently
      // disabling batching. See gmail.provider.ts for the full rationale.
      await this.usersService.update(userId, { lastEmailSyncAt: new Date() });
    }
  }

  private async validateAndGetZohoClient(
    userId: string,
    user: User,
    primaryAccount: ZohoAccount,
  ): Promise<{
    accessToken: string;
    zohoClient: AxiosInstance;
    zohoAccountId: string;
  }> {
    let { accessToken } = primaryAccount;
    const { accountsServer } = primaryAccount;
    let zohoClient = this.client.createZohoClient(accessToken, accountsServer);

    try {
      const { zohoAccountId } = await this.client.getAccountId(
        userId,
        accessToken,
        accountsServer,
      );
      this.logger.debug(`Token validated for user ${userId}`);
      return { accessToken, zohoClient, zohoAccountId };
    } catch (refreshError: unknown) {
      if (!isAuthError(refreshError)) {
        this.logger.error(
          `Non-auth error during token validation for user ${userId}: ${sanitizeAxiosError(refreshError)}`,
          refreshError instanceof Error ? refreshError.stack : undefined,
        );
        return await this.handleTokenValidationError(
          userId,
          user,
          primaryAccount,
          refreshError,
        );
      }
      this.logger.debug(
        `Token validation failed for user ${userId}, attempting refresh...`,
      );
      try {
        accessToken = await this.client.refreshTokenIfNeeded(
          userId,
          primaryAccount.id,
        );
        this.logger.debug(`Token successfully refreshed for user ${userId}`);
        zohoClient = this.client.createZohoClient(accessToken, accountsServer);
        const { zohoAccountId } = await this.client.getAccountId(
          userId,
          accessToken,
          accountsServer,
        );
        this.logger.debug(
          `Token re-validated after refresh for user ${userId}`,
        );
        return { accessToken, zohoClient, zohoAccountId };
      } catch (retryError) {
        this.logger.error(
          `Token refresh OR re-validation failed for user ${userId}: ${sanitizeAxiosError(retryError)}`,
        );
        return await this.handleTokenValidationError(
          userId,
          user,
          primaryAccount,
          retryError,
        );
      }
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
    } catch (_err) {
      this.logger.warn(
        `[handleTokenValidationError] Could not refresh account for user ${userId}`,
      );
    }

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
      await this.zohoAccountsService.update(currentAccount.id, {
        needsRelogin: true,
      });
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
    // Fetch folders to get numeric folder IDs (cached per account; refreshed every hour)
    const folderMap = await this.client.getFolderMap(zohoClient, zohoAccountId);

    const inboxFolderId = folderMap[ZOHO_FOLDER_IDS.INBOX];
    this.logger.debug(`[performSync] inboxFolderId: ${inboxFolderId}`);

    // Single inbox fetch — sortorder and importance not supported by Zoho AU.
    // Sync-window policy: the initial sync caps at INITIAL_SYNC_MAX_EMAILS.
    const fetchLimit = resolveMaxFetchResults(isInitialSync);
    const inboxResponse = await zohoClient.get(
      `accounts/${zohoAccountId}/messages/view`,
      { params: { limit: fetchLimit, folderId: inboxFolderId } },
    );

    this.logger.debug(
      `[performSync] inboxMessages count: ${inboxResponse.data.data?.length}`,
    );

    const allInboxMessages: ZohoMailMessage[] = inboxResponse.data.data || [];

    // Zoho's list endpoint has no date-filter parameter, so the ongoing
    // sync window is applied here. High-importance ("starred") messages are
    // kept regardless of age, matching the policy.
    const syncWindowStart = getOldestAllowedSyncDate();
    const inboxMessages = allInboxMessages.filter(
      (message) =>
        message.importance === EMAIL_IMPORTANCE.HIGH ||
        parseReceivedTimeMs(message.receivedTime) >= syncWindowStart.getTime(),
    );

    // Initial-sync overflow: a full page means the mailbox holds more mail
    // than the cap imported; window-filtered messages were skipped too.
    if (
      shouldFlagSyncWindowLimited({
        isInitialSync,
        hitFetchCap: allInboxMessages.length >= fetchLimit,
        olderMailExists: inboxMessages.length < allInboxMessages.length,
      })
    ) {
      await this.usersService.markSyncWindowLimited(userId);
    }

    const threadMap = new Map<string, ZohoMailMessage[]>();
    for (const msg of inboxMessages) {
      // Zoho list response uses messageId not uid — normalize
      const msgId = msg.uid || msg.messageId;
      if (!msgId) continue;
      msg.uid = msgId;

      const threadId = msg.threadId || msgId;
      if (!threadMap.has(threadId)) threadMap.set(threadId, []);
      threadMap.get(threadId)!.push(msg);
    }

    this.logger.debug(
      `Found ${inboxMessages.length} inbox messages, ${threadMap.size} threads`,
    );

    const threadUpdates = await this.processThreads({
      userId,
      threadMap,
      inboxMessages,
      zohoClient,
      zohoAccountId,
      isInitialSync,
      folderId: inboxFolderId,
    });
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

  private async processThreads(options: {
    userId: string;
    threadMap: Map<string, ZohoMailMessage[]>;
    inboxMessages: ZohoMailMessage[];
    zohoClient: AxiosInstance;
    zohoAccountId: string;
    folderId: string;
    isInitialSync: boolean;
  }): Promise<{
    starUpdates: { threadId: string; starCount: number }[];
    archivedUpdates: { threadId: string; isArchived: boolean }[];
  }> {
    const {
      userId,
      threadMap,
      inboxMessages,
      zohoClient,
      zohoAccountId,
      folderId,
      isInitialSync,
    } = options;
    const starUpdates: { threadId: string; starCount: number }[] = [];
    const archivedUpdates: { threadId: string; isArchived: boolean }[] = [];

    for (const [threadId, messages] of threadMap.entries()) {
      if (!threadId || messages.length === 0) continue;

      try {
        const latestMessage = messages.sort(
          (itemA, itemB) =>
            Number(itemB.receivedTime || 0) - Number(itemA.receivedTime || 0),
        )[0];
        const isInInbox = inboxMessages.some(
          (message) =>
            message.threadId === threadId || message.uid === threadId,
        );
        const isImportant = latestMessage.importance === EMAIL_IMPORTANCE.HIGH;

        starUpdates.push({ threadId, starCount: isImportant ? 3 : 0 });
        archivedUpdates.push({ threadId, isArchived: !isInInbox });

        for (const message of messages) {
          if (!message.uid) continue;
          await this.processMessage({
            userId,
            message,
            threadId,
            zohoClient,
            zohoAccountId,
            folderId,
            starCount: isImportant ? 3 : 0,
            isInitialSync,
          });
        }
      } catch (threadError: unknown) {
        this.handleThreadProcessingError(threadId, threadError);
      }
    }

    return { starUpdates, archivedUpdates };
  }

  private async processMessage(options: {
    userId: string;
    message: ZohoMailMessage;
    threadId: string;
    zohoClient: AxiosInstance;
    zohoAccountId: string;
    starCount: number;
    folderId: string;
    isInitialSync: boolean;
  }): Promise<void> {
    const {
      userId,
      message,
      zohoClient,
      zohoAccountId,
      starCount,
      folderId,
      isInitialSync,
    } = options;

    const fullMsg = await zohoClient.get(
      `accounts/${zohoAccountId}/folders/${folderId}/messages/${message.uid}/content`,
    );
    const responseBody = fullMsg.data as {
      content?: string;
      [key: string]: unknown;
    };
    const nestedBody = responseBody["data"] as { content?: string } | undefined;
    const bodyContent = nestedBody?.content || responseBody.content || "";
    const mergedMessageData = { ...message, content: bodyContent };
    const rawEmail = parseZohoMessage(mergedMessageData);
    if (!rawEmail) return;

    const existing = await this.emailsService.getEmailByMessageId(
      userId,
      message.uid,
    );
    if (existing) {
      if (existing.isRead !== mergedMessageData.isRead) {
        await this.emailsService.updateEmail(userId, existing.id, {
          isRead: mergedMessageData.isRead || false,
        });
      }
      return;
    }

    await this.emailsService.createEmail(
      userId,
      { ...rawEmail, starCount } as RawEmailMessage,
      { skipBatching: isInitialSync, countTowardVolume: !isInitialSync },
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
      } catch (_err) {
        this.logger.warn(
          `[handleSyncError] Could not refresh user record for ${userId}`,
        );
      }
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

    const { accessToken, accountsServer } = primaryAccount;
    const zohoClient = this.client.createZohoClient(
      accessToken,
      accountsServer,
    );

    try {
      const { zohoAccountId } = await this.client.getAccountId(
        userId,
        accessToken,
        accountsServer,
      );
      const fullMsg = await zohoClient.get(
        `accounts/${zohoAccountId}/messages/${messageId}/content`,
      );
      const messageData = (fullMsg.data.data ||
        fullMsg.data) as ZohoMailMessage;
      const rawEmail = parseZohoMessage(messageData);
      if (!rawEmail) {
        await this.updateScanProgress(userId);
        return;
      }

      const isArchived =
        messageData.folderId !== ZOHO_FOLDER_IDS.INBOX &&
        messageData.folderId !== ZOHO_FOLDER_IDS.TRASH;
      const isDeleted = messageData.folderId === ZOHO_FOLDER_IDS.TRASH;
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
        } catch (_retryErr) {
          this.logger.warn(
            `[processScanEmail] Token refresh retry failed for user ${userId}`,
          );
        }
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

  private async fetchRecentZohoMessages(
    zohoClient: AxiosInstance,
    zohoAccountId: string,
  ): Promise<ZohoMailMessage[]> {
    const foldersResponse = await zohoClient.get(
      `accounts/${zohoAccountId}/folders`,
    );
    const folders: { folderName: string; folderId: string }[] =
      foldersResponse.data.data || [];
    const folderMap = folders.reduce<Record<string, string>>((acc, folder) => {
      acc[folder.folderName.toLowerCase()] = folder.folderId;
      return acc;
    }, {});

    const inboxFolderId = folderMap[ZOHO_FOLDER_IDS.INBOX];
    const trashFolderId = folderMap[ZOHO_FOLDER_IDS.TRASH];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DAYS.WEEK);
    const sevenDaysAgoMs = sevenDaysAgo.getTime();

    const [inboxResponse, trashResponse] = await Promise.all([
      zohoClient.get(`accounts/${zohoAccountId}/messages/view`, {
        params: {
          limit: QUERY_LIMITS.MAX_THREADS_FOR_ANALYSIS,
          folderId: inboxFolderId,
        },
      }),
      zohoClient.get(`accounts/${zohoAccountId}/messages/view`, {
        params: { limit: QUERY_LIMITS.THREAD_QUERY, folderId: trashFolderId },
      }),
    ]);

    const allMessages = [
      ...(inboxResponse.data.data || []),
      ...(trashResponse.data.data || []),
    ] as ZohoMailMessage[];

    // Normalize messageId to uid
    for (const msg of allMessages) {
      msg.uid = msg.uid || msg.messageId;
    }

    return allMessages.filter((msg) => {
      const rt = Number(msg.receivedTime) || 0;
      const rtMs = rt < ZOHO_SECONDS_EPOCH_THRESHOLD ? rt * MS_PER_SECOND : rt;
      return rtMs >= sevenDaysAgoMs;
    });
  }

  async scanHistory(userId: string): Promise<void> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) return;

    const { accessToken, accountsServer } = primaryAccount;
    const zohoClient = this.client.createZohoClient(
      accessToken,
      accountsServer,
    );

    try {
      const { zohoAccountId } = await this.client.getAccountId(
        userId,
        accessToken,
        accountsServer,
      );
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
        } catch (_scanErr) {
          this.logger.warn(
            `[scanHistory] Failed to scan message ${filteredMessages[i].uid} for user ${userId}`,
          );
        }
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
          await this.client.refreshTokenIfNeeded(userId, primaryAccount.id);
          await this.scanHistory(userId);
          return;
        } catch (_retryErr) {
          this.logger.warn(
            `[scanHistory] Token refresh retry failed for user ${userId}`,
          );
        }
        throw new Error("Token refresh failed - please reconnect");
      }
      throw error;
    }
  }

  async sendReply(
    userId: string,
    params: {
      threadId: string;
      to: string;
      subject: string;
      body: string;
      options?: SendReplyOptions;
    },
  ): Promise<{ messageId: string; threadId: string }> {
    return sendReply(this, userId, params);
  }

  async sendEmail(
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
    return sendEmail(this, userId, params);
  }

  async searchEmails(
    userId: string,
    query: string,
    maxResults = QUERY_LIMITS.SEARCH_DEFAULT_RESULTS,
  ): Promise<RawEmailMessage[]> {
    return searchEmails(this, userId, query, maxResults);
  }

  async fetchThreadMessages(
    userId: string,
    threadId: string,
    limit = 50,
  ): Promise<RawEmailMessage[]> {
    return fetchThreadMessagesZoho(this, userId, threadId, limit);
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
