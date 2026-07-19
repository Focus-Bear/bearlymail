import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosInstance } from "axios";
import type { PgBoss } from "pg-boss";

import {
  EMAIL_IMPORTANCE,
  OFFICE365_FOLDER_IDS,
} from "../../constants/domain-types";
import { HTTP_STATUS } from "../../constants/http-status";
import { INJECT_TOKENS } from "../../constants/inject-tokens";
import { JOB_NAMES } from "../../constants/job-names";
import { BODY_PREVIEW_LENGTHS } from "../../constants/llm-constants";
import { QUERY_LIMITS } from "../../constants/query-limits";
import { DAYS } from "../../constants/time-constants";
import { Office365Account } from "../../database/entities/office365-account.entity";
import { User } from "../../database/entities/user.entity";
import { Office365AccountsService } from "../../office365-accounts/office365-accounts.service";
import { getJobPriority } from "../../queue/job-priorities";
import { isApiError, isError } from "../../types/common";
import { UsersService } from "../../users/users.service";
import { sanitizeAxiosError } from "../../utils/axios-error.utils";
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
} from "../sync-window-policy";
import {
  archiveThread,
  fetchThreadMessagesOffice365,
  searchEmails,
  sendEmail,
  sendReply,
  trashThread,
  unarchiveThread,
} from "./office365/office365-actions.service";
import {
  fetchAttachmentMetadata,
  getAttachment as getAttachmentFromGraph,
} from "./office365/office365-attachments";
import {
  handleMissingOffice365RefreshToken,
  isWithinGracePeriod,
  logOffice365AuthFailure as logAuthFailure,
} from "./office365/office365-auth";
import { Office365Client } from "./office365/office365-client";
import {
  MicrosoftGraphMessage,
  parseOffice365Message,
} from "./office365/office365-message-parser";
import { isAuthError } from "./office365/office365-operations";
import {
  getExistingThreadUpdates,
  verifyThreadStatusesInOffice365,
} from "./office365/office365-sync";
import { flagSyncWindowLimitedIfNeeded } from "./office365/office365-sync-window";

@Injectable()
export class Office365Provider implements EmailProvider {
  public readonly logger = new Logger(Office365Provider.name);
  private readonly progressUpdateCounters = new Map<string, number>();
  public readonly client: Office365Client;

  constructor(
    private usersService: UsersService,
    @Inject(forwardRef(() => EmailsService))
    public emailsService: EmailsService,
    private scanEmailService: ScanEmailService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    public office365AccountsService: Office365AccountsService,
    private configService: ConfigService,
  ) {
    this.client = new Office365Client(office365AccountsService, configService);
  }
  async isConnected(userId: string): Promise<boolean> {
    return this.office365AccountsService.hasConnectedOffice365(userId);
  }

  async getAccountInfo(userId: string): Promise<{
    email?: string;
    name?: string;
    isPrimary?: boolean;
  } | null> {
    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
    if (!primaryAccount) return null;

    return {
      email: primaryAccount.email,
      name: primaryAccount.name,
      isPrimary: primaryAccount.isPrimary,
    };
  }

  async syncEmails(userId: string): Promise<void> {
    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
    if (!primaryAccount) {
      this.logger.log(
        `User ${userId} not connected to Office 365, skipping email sync.`,
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

    // Validate refresh token
    if (!primaryAccount.refreshToken) {
      await handleMissingOffice365RefreshToken(
        {
          office365AccountsService: this.office365AccountsService,
          logger: this.logger,
        },
        { userId, user, primaryAccount, isRecentLogin },
      );
    }

    let currentAccessToken = primaryAccount.accessToken;
    let graphClient = this.client.createGraphClient(currentAccessToken);

    // Validate token — attempt a refresh on 401 before giving up
    try {
      await graphClient.get("/me", { params: { $select: "id" } });
      this.logger.debug(`Token validated for user ${userId}`);
    } catch (validationError: unknown) {
      if (isAuthError(validationError) && primaryAccount.refreshToken) {
        try {
          currentAccessToken = await this.client.refreshTokenIfNeeded(
            userId,
            primaryAccount.id,
          );
          graphClient = this.client.createGraphClient(currentAccessToken);
        } catch {
          await this.handleTokenValidationError(
            userId,
            user,
            primaryAccount,
            validationError,
          );
        }
      } else {
        await this.handleTokenValidationError(
          userId,
          user,
          primaryAccount,
          validationError,
        );
      }
    }

    try {
      await this.performSync(userId, graphClient, isInitialSync);
    } catch (error: unknown) {
      await this.handleSyncError(userId, user, primaryAccount, error);
    } finally {
      // Always advance lastEmailSyncAt once a sync has been attempted, even if
      // performSync threw — otherwise a failed sync leaves it null and every
      // subsequent sync is treated as initial (skipBatching), permanently
      // disabling batching. See gmail.provider.ts for the full rationale.
      await this.usersService.update(userId, {
        lastEmailSyncAt: new Date(),
      });
    }
  }

  private async handleTokenValidationError(
    userId: string,
    user: User,
    primaryAccount: Office365Account,
    refreshError: unknown,
  ): Promise<never> {
    let currentAccount: Office365Account | null = primaryAccount;
    try {
      currentAccount = await this.office365AccountsService.findPrimary(userId);
    } catch (accountError) {
      this.logger.error(
        `Could not re-fetch account for grace period check: ${sanitizeAxiosError(accountError)}`,
      );
    }

    const resolvedAccount = currentAccount || primaryAccount;
    const isRecentLoginNow = isWithinGracePeriod(user);
    await logAuthFailure(
      userId,
      user.email || null,
      "syncEmails-tokenValidation",
      refreshError,
      {
        hasRefreshToken: !!resolvedAccount?.refreshToken,
        hasAccessToken: !!resolvedAccount?.accessToken,
        isRecentLogin: isRecentLoginNow,
        gracePeriodActive: isRecentLoginNow,
      },
    );

    if (!isRecentLoginNow) {
      await this.office365AccountsService.updateTokens(
        resolvedAccount.id,
        userId,
        resolvedAccount.accessToken,
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
    graphClient: AxiosInstance,
    isInitialSync: boolean,
  ): Promise<void> {
    // Sync-window policy: every fetch is limited to the ongoing window, and
    // the initial sync caps at the most recent INITIAL_SYNC_MAX_EMAILS.
    const since = getOldestAllowedSyncDate().toISOString();
    const maxResults = resolveMaxFetchResults(isInitialSync);

    const inboxResponse = await graphClient.get(
      "/me/mailFolders/inbox/messages",
      {
        params: {
          $filter: `receivedDateTime ge ${since}`,
          $orderby: "receivedDateTime desc",
          $top: maxResults,
          $select:
            "id,conversationId,subject,from,receivedDateTime,isRead,importance",
        },
      },
    );

    const inboxMessages = inboxResponse.data.value || [];
    const importantMessages: MicrosoftGraphMessage[] = [];

    if (isInitialSync) {
      await flagSyncWindowLimitedIfNeeded(
        { usersService: this.usersService, logger: this.logger },
        {
          userId,
          graphClient,
          since,
          hitFetchCap: inboxMessages.length >= maxResults,
        },
      );
    }

    const conversationMap = new Map<string, MicrosoftGraphMessage[]>();
    for (const msg of [...inboxMessages, ...importantMessages]) {
      if (!msg.id) continue;
      const conversationId = msg.conversationId || msg.id;
      if (!conversationMap.has(conversationId)) {
        conversationMap.set(conversationId, []);
      }
      conversationMap.get(conversationId)!.push(msg);
    }

    this.logger.debug(
      `Found ${inboxMessages.length} inbox and ${importantMessages.length} important messages (${conversationMap.size} unique conversations)`,
    );

    const threadUpdates = await this.processConversations(
      userId,
      conversationMap,
      inboxMessages,
      graphClient,
      isInitialSync,
    );

    await this.applyThreadUpdates(userId, threadUpdates);
    await this.checkExistingStarredThreads(
      userId,
      conversationMap,
      graphClient,
    );
    await this.checkNonArchivedThreads(userId, conversationMap, graphClient);
  }

  private async processConversations(
    userId: string,
    conversationMap: Map<string, MicrosoftGraphMessage[]>,
    inboxMessages: MicrosoftGraphMessage[],
    graphClient: AxiosInstance,
    isInitialSync: boolean,
  ): Promise<{
    starUpdates: { threadId: string; starCount: number }[];
    archivedUpdates: { threadId: string; isArchived: boolean }[];
  }> {
    const starUpdates: { threadId: string; starCount: number }[] = [];
    const archivedUpdates: { threadId: string; isArchived: boolean }[] = [];

    for (const [conversationId, messages] of conversationMap.entries()) {
      if (!conversationId || messages.length === 0) continue;

      try {
        const latestMessage = messages.sort(
          (itemA, itemB) =>
            new Date(itemB.receivedDateTime || 0).getTime() -
            new Date(itemA.receivedDateTime || 0).getTime(),
        )[0];

        const isInInbox = inboxMessages.some(
          (message) =>
            message.conversationId === conversationId ||
            message.id === conversationId,
        );
        const isImportant = latestMessage.importance === EMAIL_IMPORTANCE.HIGH;

        starUpdates.push({
          threadId: conversationId,
          starCount: isImportant ? 3 : 0,
        });
        archivedUpdates.push({
          threadId: conversationId,
          isArchived: !isInInbox,
        });

        for (const message of messages) {
          if (!message.id) continue;
          await this.processMessage({
            userId,
            message,
            conversationId,
            graphClient,
            starCount: isImportant ? 3 : 0,
            isInitialSync,
          });
        }
      } catch (threadError: unknown) {
        this.handleThreadProcessingError(conversationId, threadError);
      }
    }

    return { starUpdates, archivedUpdates };
  }

  private async processMessage(options: {
    userId: string;
    message: MicrosoftGraphMessage;
    conversationId: string;
    graphClient: AxiosInstance;
    starCount: number;
    isInitialSync: boolean;
  }): Promise<void> {
    const {
      userId,
      message,
      conversationId: _conversationId,
      graphClient,
      starCount,
      isInitialSync,
    } = options;
    const fullMsg = await graphClient.get(`/me/messages/${message.id}`, {
      params: {
        $select:
          "id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,body,bodyPreview,conversationId,importance,parentFolderId,hasAttachments",
      },
    });

    const messageData = fullMsg.data as MicrosoftGraphMessage;
    // hasAttachments can be unreliable for emails from external senders
    // (e.g. Gmail inline images), so also fetch when the HTML body references
    // cid: inline images. Skip otherwise to avoid Graph API throttling.
    const hasInlineImages =
      messageData.body?.content?.includes("cid:") ?? false;
    if (messageData.hasAttachments || hasInlineImages) {
      messageData.attachments = await fetchAttachmentMetadata(
        graphClient,
        message.id,
        this.logger,
      );
    }
    const rawEmail = parseOffice365Message(messageData);
    if (!rawEmail) return;

    const existing = await this.emailsService.getEmailByMessageId(
      userId,
      message.id,
    );
    if (existing) {
      const updates: Partial<typeof existing> = {};
      if (existing.isRead !== messageData.isRead) {
        updates.isRead = messageData.isRead || false;
      }
      // Backfill attachments for emails that were synced before attachment
      // support was implemented (existing.attachments is null/empty).
      if (
        rawEmail.attachments &&
        rawEmail.attachments.length > 0 &&
        (!existing.attachments || existing.attachments.length === 0)
      ) {
        updates.attachments =
          rawEmail.attachments as typeof existing.attachments;
      }
      if (Object.keys(updates).length > 0) {
        await this.emailsService.updateEmail(userId, existing.id, updates);
      }
      return;
    }

    await this.emailsService.createEmail(
      userId,
      { ...rawEmail, starCount } as RawEmailMessage,
      { skipBatching: isInitialSync, countTowardVolume: !isInitialSync },
    );
  }

  private handleThreadProcessingError(
    conversationId: string,
    error: unknown,
  ): void {
    if (isApiError(error) && error.code === HTTP_STATUS.NOT_FOUND) {
      this.logger.debug(
        `Conversation ${conversationId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found`,
      );
    } else {
      const errorMsg =
        isError(error) || isApiError(error) ? error.message : "Unknown error";
      this.logger.warn(
        `Error processing conversation ${conversationId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...`,
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
    if (updates.starUpdates.length > 0) {
      await this.emailsService.batchUpdateThreadStarCount(
        userId,
        updates.starUpdates,
      );
    }
    if (updates.archivedUpdates.length > 0) {
      await this.emailsService.batchUpdateThreadArchivedStatuses(
        userId,
        updates.archivedUpdates,
      );
    }
  }

  private async checkExistingStarredThreads(
    userId: string,
    conversationMap: Map<string, MicrosoftGraphMessage[]>,
    graphClient: AxiosInstance,
  ): Promise<void> {
    const existingStarredThreads =
      await this.emailsService.getExistingStarredThreads(userId);
    const threadMapKeys = new Set(conversationMap.keys());
    const existingThreadUpdates = await getExistingThreadUpdates(
      userId,
      existingStarredThreads,
      threadMapKeys,
      graphClient,
    );

    if (existingThreadUpdates.length > 0) {
      await this.emailsService.batchUpdateThreadStarCount(
        userId,
        existingThreadUpdates.map((update) => ({
          threadId: update.threadId,
          starCount: update.starCount,
        })),
      );
      await this.emailsService.batchUpdateThreadArchivedStatuses(
        userId,
        existingThreadUpdates.map((update) => ({
          threadId: update.threadId,
          isArchived: update.isArchived,
        })),
      );
    }
  }

  private async checkNonArchivedThreads(
    userId: string,
    conversationMap: Map<string, MicrosoftGraphMessage[]>,
    graphClient: AxiosInstance,
  ): Promise<void> {
    const threadsNeedingCheck =
      await this.emailsService.getNonArchivedThreadsNeedingCheck(
        userId,
        QUERY_LIMITS.PROVIDER_BATCH_SIZE,
      );
    const threadsToCheck = threadsNeedingCheck.filter(
      (threadId) => !conversationMap.has(threadId),
    );

    if (threadsToCheck.length > 0) {
      const updates = await verifyThreadStatusesInOffice365(
        userId,
        threadsToCheck,
        graphClient,
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
    primaryAccount: Office365Account,
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
        "syncEmails-office365Api",
        error,
        {
          hasRefreshToken: !!primaryAccount.refreshToken,
          isRecentLogin,
          gracePeriodActive: isRecentLogin,
        },
      );

      if (!isRecentLogin) {
        await this.office365AccountsService.updateTokens(
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
    const startTime = Date.now();
    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
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
    const graphClient = this.client.createGraphClient(accessToken);

    try {
      const fullMsg = await graphClient.get(`/me/messages/${messageId}`, {
        params: {
          $select:
            "id,subject,from,toRecipients,ccRecipients,receivedDateTime,isRead,body,bodyPreview,conversationId,importance,parentFolderId,categories,hasAttachments",
        },
      });

      const messageData = fullMsg.data as MicrosoftGraphMessage;
      messageData.attachments = await fetchAttachmentMetadata(
        graphClient,
        messageId,
        this.logger,
      );
      const rawEmail = parseOffice365Message(messageData);
      if (!rawEmail) {
        await this.updateScanProgress(userId);
        return;
      }

      const isArchived =
        messageData.parentFolderId !== OFFICE365_FOLDER_IDS.INBOX &&
        messageData.parentFolderId !== OFFICE365_FOLDER_IDS.DELETED_ITEMS;
      const isDeleted =
        messageData.parentFolderId === OFFICE365_FOLDER_IDS.DELETED_ITEMS;
      const categories = (messageData.categories as string[]) || [];
      await this.scanEmailService.createScanEmail(userId, {
        ...rawEmail,
        isArchived: isArchived || isDeleted,
        labels: categories,
      });
      await this.updateScanProgress(userId);
      this.logger.log(
        `[processScanEmail] Completed email ${messageId} in ${Date.now() - startTime}ms`,
      );
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
          {
            priority: getJobPriority(JOB_NAMES.ANALYZE_SCAN_RESULTS, false),
          },
        );
      }
    }
  }

  async scanHistory(userId: string): Promise<void> {
    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
    if (!primaryAccount) return;

    let { accessToken } = primaryAccount;
    const graphClient = this.client.createGraphClient(accessToken);

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DAYS.WEEK);

      // Fetch from both inbox and deleted items
      const [inboxResponse, deletedResponse] = await Promise.all([
        graphClient.get("/me/mailFolders/inbox/messages", {
          params: {
            $filter: `receivedDateTime ge ${sevenDaysAgo.toISOString()}`,
            $orderby: "receivedDateTime desc",
            $top: 200,
            $select: "id",
          },
          headers: { ConsistencyLevel: "eventual" },
        }),
        graphClient.get("/me/mailFolders/deleteditems/messages", {
          params: {
            $filter: `receivedDateTime ge ${sevenDaysAgo.toISOString()}`,
            $top: 100,
            $select: "id",
          },
          headers: { ConsistencyLevel: "eventual" },
        }),
      ]);

      const inboxMessages = inboxResponse.data.value || [];
      const deletedMessages = deletedResponse.data.value || [];
      const messages = [...inboxMessages, ...deletedMessages];
      const total = Math.min(
        messages.length,
        BODY_PREVIEW_LENGTHS.BATCH_PREVIEW,
      );

      await this.usersService.update(userId, {
        scanTotal: total,
        scanProgress: 0,
      });
      this.progressUpdateCounters.set(userId, 0);

      for (let i = 0; i < total; i++) {
        if (!messages[i].id) continue;
        try {
          await this.processScanEmail(userId, messages[i].id);
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
    return fetchThreadMessagesOffice365(this, userId, threadId, limit);
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
      `syncStarStatusToGmail called for Office365 (not implemented): ${threadId}`,
    );
  }

  async snoozeThread(
    _userId: string,
    threadId: string,
    _snoozeUntil: Date,
  ): Promise<void> {
    this.logger.warn(
      `snoozeThread called for Office365 (not implemented): ${threadId}`,
    );
  }

  async unsnoozeThread(userId: string, threadId: string): Promise<void> {
    this.logger.warn(
      `unsnoozeThread called for Office365 (not implemented): ${threadId}`,
    );
  }

  async getAttachment(
    userId: string,
    messageId: string,
    attachmentId: string,
    attachmentMetadata?: { filename: string; mimeType: string; size: number },
  ): Promise<{
    attachmentBuffer: Buffer;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    return getAttachmentFromGraph(
      this,
      userId,
      messageId,
      attachmentId,
      attachmentMetadata,
    );
  }

  async addLabelToThread(
    _userId: string,
    threadId: string,
    labelName: string,
  ): Promise<void> {
    this.logger.debug(
      `addLabelToThread called for Office365 (not implemented): ${threadId}, label=${labelName}`,
    );
  }

  async trashThread(userId: string, threadId: string): Promise<void> {
    return trashThread(this, userId, threadId);
  }
}
