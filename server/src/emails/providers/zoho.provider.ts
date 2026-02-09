/* eslint-disable max-lines */
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

@Injectable()
export class ZohoProvider implements EmailProvider {
  private readonly logger = new Logger(ZohoProvider.name);
  // Track progress update counters per user to batch updates every 10 emails
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

  /**
   * Verify thread statuses in Zoho API in batches with concurrency limits
   * Returns array of updates: { threadId, starCount, isArchived }[]
   */
  private async verifyThreadStatusesInZoho(
    userId: string,
    threadIds: string[],
    zohoClient: any,
    zohoAccountId: string,
  ): Promise<
    Array<{ threadId: string; starCount: number; isArchived: boolean }>
  > {
    const updates: Array<{
      threadId: string;
      starCount: number;
      isArchived: boolean;
    }> = [];

    // Process threads in batches with concurrency limit
    const BATCH_SIZE = 50;
    const CONCURRENCY_LIMIT = 10;

    for (let i = 0; i < threadIds.length; i += BATCH_SIZE) {
      const batch = threadIds.slice(i, i + BATCH_SIZE);
      this.logger.debug(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(threadIds.length / BATCH_SIZE)} (${batch.length} threads)`,
      );

      // Process batch with concurrency limit
      const batchPromises: Promise<void>[] = [];
      for (let j = 0; j < batch.length; j += CONCURRENCY_LIMIT) {
        const concurrentBatch = batch.slice(j, j + CONCURRENCY_LIMIT);
        const concurrentPromises = concurrentBatch.map(async (threadId) => {
          if (!threadId) return;

          try {
            // Get thread from Zoho to check current status
            const threadResponse = await zohoClient.get(
              `/accounts/${zohoAccountId}/messages`,
              {
                params: {
                  threadId,
                  limit: 1,
                },
              },
            );

            const threadMessages = threadResponse.data.data || [];
            if (threadMessages.length === 0) {
              // Thread deleted in Zoho - mark as archived
              updates.push({
                threadId,
                starCount: 0,
                isArchived: true,
              });
              return;
            }

            const latestMessage = threadMessages[0];
            const isImportant = latestMessage.importance === "high";
            const isInInbox = latestMessage.folderId === "inbox";
            const starCount = isImportant ? 3 : 0;
            const isArchived = !isInInbox;

            updates.push({
              threadId,
              starCount,
              isArchived,
            });
          } catch (threadError: unknown) {
            // Thread not found (404) or other error - mark as archived
            if (isApiError(threadError) && threadError.code === 404) {
              this.logger.debug(
                `Thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found in Zoho (may be deleted)`,
              );
              updates.push({
                threadId,
                starCount: 0,
                isArchived: true,
              });
            } else {
              const errorMsg = isError(threadError)
                ? threadError.message
                : isApiError(threadError)
                  ? threadError.message
                  : "Unknown error";
              this.logger.warn(
                `Error checking thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...:`,
                errorMsg,
              );
              // Don't add to updates if we can't verify status
            }
          }
        });

        batchPromises.push(...concurrentPromises);
        // Wait for this concurrent batch to complete before starting next
        await Promise.all(concurrentPromises);
      }

      // Wait for entire batch to complete
      await Promise.all(batchPromises);
    }

    return updates;
  }

  /**
   * Parse Zoho Mail message to RawEmailMessage format
   */

  /**
   * Extract body content from Zoho Mail message
   */

  /**
   * Check if user is within grace period (5 minutes after login)
   */

  /**
   * Log auth failure with comprehensive details
   */

  // eslint-disable-next-line max-lines-per-function, complexity, max-statements
  async syncEmails(
    userId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    syncWindowHoursOrOptions?:
      | number
      | import("../interfaces/email-provider.interface").SyncEmailsOptions,
  ): Promise<void> {
    // Note: Zoho doesn't support continuation jobs yet - syncWindowHoursOrOptions is ignored
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) {
      this.logger.log(
        `User ${userId} not connected to Zoho Mail, skipping email sync.`,
      );
      return;
    }

    const user = await this.usersService.findOne(userId);
    if (!user) {
      this.logger.warn(`User ${userId} not found`);
      return;
    }

    // Detect initial sync (new user) - skip batching so their triage isn't blank
    const isInitialSync = !user.lastEmailSyncAt;

    // GRACE PERIOD: If user just logged in (within last 5 minutes), be lenient with errors
    const isRecentLogin = isWithinGracePeriod(user);
    const minutesSinceUpdate = user.updatedAt
      ? Math.round(
          (Date.now() - new Date(user.updatedAt).getTime()) / 1000 / 60,
        )
      : null;

    const debugInfo = [
      `[ZohoProvider] User ${userId} sync check:`,
      `  - updatedAt: ${user?.updatedAt?.toISOString() || "null"}`,
      `  - minutesSinceUpdate: ${minutesSinceUpdate}`,
      `  - isRecentLogin: ${isRecentLogin}`,
      `  - hasRefreshToken: ${!!primaryAccount.refreshToken}`,
      `  - hasAccessToken: ${!!primaryAccount.accessToken}`,
    ].join("\n");
    this.logger.debug(debugInfo);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeDebugLog } = require("../../auth/auth-logger");
    writeDebugLog(debugInfo);

    // Check if refresh token exists
    if (!primaryAccount.refreshToken) {
      await logAuthFailure(
        userId,
        user.email || null,
        "syncEmails-missingRefreshToken",
        new Error("Refresh token missing"),
        {
          hasAccessToken: !!primaryAccount.accessToken,
          isRecentLogin,
          userUpdatedAt: user?.updatedAt?.toISOString() || null,
          minutesSinceUpdate,
        },
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
        this.logger.warn(
          `⚠️ Refresh token missing for recently logged-in user ${userId}, but within grace period. Will retry later.`,
        );
        throw new Error(
          "Refresh token missing (within grace period - will retry)",
        );
      }
      throw new Error("Refresh token missing - please log in again");
    }

    const { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    // Try to proactively validate token by getting account ID
    let zohoAccountId: string;
    try {
      zohoAccountId = await this.client.getAccountId(userId, accessToken);
      this.logger.debug(`Token validated for user ${userId}`);
    } catch (refreshError: unknown) {
      // GRACE PERIOD: If user just logged in, don't flag for re-login immediately
      let currentAccount = primaryAccount;
      try {
        currentAccount = await this.zohoAccountsService.findPrimary(userId);
      } catch (accountError) {
        this.logger.error(
          `Could not re-fetch account ${userId} for grace period check:`,
          accountError,
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
          hasAccessToken: !!currentAccount?.accessToken,
          isRecentLogin: isRecentLoginNow,
          userUpdatedAt: user?.updatedAt?.toISOString() || null,
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
      } else {
        this.logger.warn(
          `⚠️ Token validation failed for recently logged-in user ${userId}, but within grace period. Will retry later.`,
        );
        throw new Error(
          "Token validation failed (within grace period - will retry)",
        );
      }
    }

    try {
      // Fetch threads/conversations from inbox and important messages
      // Zoho Mail uses threadId to group messages
      const [inboxResponse, importantResponse] = await Promise.all([
        // Fetch unread messages from inbox
        zohoClient.get(`/accounts/${zohoAccountId}/messages`, {
          params: {
            limit: 500,
            sort: "receivedTime",
            sortorder: "desc",
            folderid: "inbox",
            isRead: false,
          },
        }),
        // Fetch important messages (high importance = starred equivalent)
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

      // Group messages by threadId to get threads
      const threadMap = new Map<string, ZohoMailMessage[]>();
      const allMessageIds = new Set<string>();

      for (const msg of [...inboxMessages, ...importantMessages]) {
        if (!msg.uid) continue;
        allMessageIds.add(msg.uid);
        const threadId = msg.threadId || msg.uid;
        if (!threadMap.has(threadId)) {
          threadMap.set(threadId, []);
        }
        threadMap.get(threadId)!.push(msg);
      }

      this.logger.debug(
        `Found ${inboxMessages.length} inbox messages and ${importantMessages.length} important messages (${threadMap.size} unique threads) for user ${userId}`,
      );

      // Process each thread
      const threadStarCountUpdates: { threadId: string; starCount: number }[] =
        [];
      const threadArchivedUpdates: {
        threadId: string;
        isArchived: boolean;
      }[] = [];

      for (const [threadId, messages] of threadMap.entries()) {
        if (!threadId || messages.length === 0) continue;

        try {
          // Get the latest message to determine current status
          const latestMessage = messages.sort(
            (a, b) => (b.receivedTime || 0) - (a.receivedTime || 0),
          )[0];

          // Check if thread is in inbox (if any message is in inbox, thread is not archived)
          const isInInbox = inboxMessages.some(
            (m) => m.threadId === threadId || m.uid === threadId,
          );
          const isArchived = !isInInbox;
          const isImportant = latestMessage.importance === "high";
          const starCount = isImportant ? 3 : 0;

          // Collect thread updates
          threadStarCountUpdates.push({ threadId, starCount });
          threadArchivedUpdates.push({ threadId, isArchived });

          // Process all messages in the thread
          for (const message of messages) {
            if (!message.uid) continue;

            // Get full message details
            const fullMsg = await zohoClient.get(
              `/accounts/${zohoAccountId}/messages/${message.uid}`,
            );

            const messageData = (fullMsg.data.data ||
              fullMsg.data) as ZohoMailMessage;
            const rawEmail = parseZohoMessage(messageData);
            if (!rawEmail) continue;

            const existing = await this.emailsService.getEmailByMessageId(
              userId,
              message.uid,
            );

            if (existing) {
              // Sync read status from Zoho
              if (existing.isRead !== messageData.isRead) {
                await this.emailsService.updateEmail(existing.id, {
                  isRead: messageData.isRead || false,
                });
              }
              continue;
            }

            // Create new email - use thread-level archived/starred status
            await this.emailsService.createEmail(
              userId,
              {
                messageId: rawEmail.messageId,
                threadId: rawEmail.threadId,
                subject: rawEmail.subject,
                from: rawEmail.from,
                fromName: rawEmail.fromName,
                body: rawEmail.body,
                htmlBody: rawEmail.htmlBody,
                starCount,
                receivedAt: rawEmail.receivedAt,
                isRead: rawEmail.isRead,
              } as RawEmailMessage,
              // Skip batching for initial sync so new users see emails immediately
              { skipBatching: isInitialSync },
            );
          }
        } catch (threadError: unknown) {
          // Skip threads that fail (deleted, permissions, etc.)
          if (isApiError(threadError) && threadError.code === 404) {
            this.logger.debug(
              `Thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found (may be deleted)`,
            );
          } else {
            const errorMsg = isError(threadError)
              ? threadError.message
              : isApiError(threadError)
                ? threadError.message
                : "Unknown error";
            this.logger.warn(
              `Error processing thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...:`,
              errorMsg,
            );
          }
          continue;
        }
      }

      // Batch update all thread star counts and archived statuses
      if (threadStarCountUpdates.length > 0) {
        await this.emailsService.batchUpdateThreadStarCount(
          userId,
          threadStarCountUpdates,
        );
      }
      if (threadArchivedUpdates.length > 0) {
        await this.emailsService.batchUpdateThreadArchivedStatuses(
          userId,
          threadArchivedUpdates,
        );
      }

      // Also check existing starred threads against Zoho
      const existingStarredThreads =
        await this.emailsService.getExistingStarredThreads(userId);

      this.logger.debug(
        `Checking ${existingStarredThreads.length} existing starred threads against Zoho`,
      );

      const existingThreadUpdates: {
        threadId: string;
        starCount: number;
        isArchived: boolean;
      }[] = [];

      // Check each existing starred thread against Zoho
      for (const dbThread of existingStarredThreads) {
        // Skip if we already processed this thread in the main sync
        if (threadMap.has(dbThread.threadId)) {
          continue;
        }

        try {
          // Get thread from Zoho to check current status
          const threadResponse = await zohoClient.get(
            `/accounts/${zohoAccountId}/messages`,
            {
              params: {
                threadId: dbThread.threadId,
                limit: 1,
              },
            },
          );

          const threadMessages = threadResponse.data.data || [];
          if (threadMessages.length === 0) {
            // Thread deleted in Zoho - mark as archived
            existingThreadUpdates.push({
              threadId: dbThread.threadId,
              starCount: 0,
              isArchived: true,
            });
            continue;
          }

          const latestMessage = threadMessages[0];
          const isImportant = latestMessage.importance === "high";
          const isInInbox = latestMessage.folderId === "inbox";
          const starCount = isImportant ? 3 : 0;
          const isArchived = !isInInbox;

          existingThreadUpdates.push({
            threadId: dbThread.threadId,
            starCount,
            isArchived,
          });
        } catch (threadError: unknown) {
          // Thread not found (404) or other error - mark as archived
          if (isApiError(threadError) && threadError.code === 404) {
            this.logger.debug(
              `Existing thread ${dbThread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found in Zoho (may be deleted)`,
            );
            existingThreadUpdates.push({
              threadId: dbThread.threadId,
              starCount: 0,
              isArchived: true,
            });
          } else {
            const errorMsg = isError(threadError)
              ? threadError.message
              : isApiError(threadError)
                ? threadError.message
                : "Unknown error";
            this.logger.warn(
              `Error checking existing thread ${dbThread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...:`,
              errorMsg,
            );
          }
          continue;
        }
      }

      // Batch update existing threads that changed
      if (existingThreadUpdates.length > 0) {
        this.logger.debug(
          `Updating ${existingThreadUpdates.length} existing threads with changed status`,
        );
        const existingStarUpdates = existingThreadUpdates.map((update) => ({
          threadId: update.threadId,
          starCount: update.starCount,
        }));
        const existingArchivedUpdates = existingThreadUpdates.map((update) => ({
          threadId: update.threadId,
          isArchived: update.isArchived,
        }));

        if (existingStarUpdates.length > 0) {
          await this.emailsService.batchUpdateThreadStarCount(
            userId,
            existingStarUpdates,
          );
        }
        if (existingArchivedUpdates.length > 0) {
          await this.emailsService.batchUpdateThreadArchivedStatuses(
            userId,
            existingArchivedUpdates,
          );
        }
      }

      // Also check non-archived threads from DB that need verification
      // This ensures we catch threads that were archived in Zoho but are still marked as non-archived in DB
      // We check a limited number per user per run (50) and prioritize threads that haven't been checked recently
      // This spreads the work across multiple sync cycles to handle 1000+ users efficiently
      const threadsNeedingCheck =
        await this.emailsService.getNonArchivedThreadsNeedingCheck(
          userId,
          50, // Limit to 50 threads per user per 5-minute sync cycle
        );
      const threadsToCheck = threadsNeedingCheck.filter(
        (threadId) => !threadMap.has(threadId), // Skip already processed threads
      );

      if (threadsToCheck.length > 0) {
        this.logger.debug(
          `Checking ${threadsToCheck.length} non-archived threads against Zoho`,
        );

        const nonArchivedUpdates = await this.verifyThreadStatusesInZoho(
          userId,
          threadsToCheck,
          zohoClient,
          zohoAccountId,
        );

        // Batch update non-archived threads that changed
        // Also update lastCheckedAt for all checked threads (even if unchanged) to avoid re-checking
        if (nonArchivedUpdates.length > 0) {
          this.logger.debug(
            `Updating ${nonArchivedUpdates.length} non-archived threads with changed status`,
          );
          const nonArchivedStarUpdates = nonArchivedUpdates.map((update) => ({
            threadId: update.threadId,
            starCount: update.starCount,
          }));
          const nonArchivedArchivedUpdates = nonArchivedUpdates.map(
            (update) => ({
              threadId: update.threadId,
              isArchived: update.isArchived,
            }),
          );

          // Update star counts (this also updates lastCheckedAt for changed threads)
          if (nonArchivedStarUpdates.length > 0) {
            await this.emailsService.batchUpdateThreadStarCount(
              userId,
              nonArchivedStarUpdates,
            );
          }
          // Update archived statuses (this also updates lastCheckedAt for changed threads)
          if (nonArchivedArchivedUpdates.length > 0) {
            await this.emailsService.batchUpdateThreadArchivedStatuses(
              userId,
              nonArchivedArchivedUpdates,
            );
          }

          // Update lastCheckedAt for all checked threads (even if unchanged)
          // This ensures we don't re-check the same threads in the next sync cycle
          const allCheckedThreadIds = nonArchivedUpdates.map(
            (update) => update.threadId,
          );
          await this.emailsService.updateThreadsLastCheckedAt(
            userId,
            allCheckedThreadIds,
          );
        }
      }
    } catch (error: unknown) {
      // Check for authentication errors
      const apiError = isApiError(error) ? error : null;
      const errorMsg = isError(error) ? error.message : apiError?.message || "";
      const isAuthError =
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401) ||
        errorMsg.includes("Token refresh failed") ||
        errorMsg.includes("Refresh token missing");

      if (isAuthError) {
        // Re-fetch user to check grace period
        let currentUser = user;
        try {
          currentUser = await this.usersService.findOne(userId);
        } catch (userError) {
          this.logger.error(
            `Could not re-fetch user ${userId} for auth logging:`,
            userError,
          );
        }

        const isRecentLogin = isWithinGracePeriod(currentUser);

        await logAuthFailure(
          userId,
          currentUser?.email || null,
          "syncEmails-zohoApi",
          error,
          {
            hasRefreshToken: !!primaryAccount.refreshToken,
            hasAccessToken: !!primaryAccount.accessToken,
            isRecentLogin,
            userUpdatedAt: currentUser?.updatedAt?.toISOString() || null,
            gracePeriodActive: isRecentLogin,
          },
        );

        // Only flag for re-login if NOT within grace period
        if (!isRecentLogin) {
          await this.zohoAccountsService.updateTokens(
            primaryAccount.id,
            userId,
            primaryAccount.accessToken,
            undefined,
          );
        } else {
          this.logger.warn(
            `⚠️ Auth error for recently logged-in user ${userId} (${currentUser?.email}), but within grace period. Will retry later.`,
          );
        }
        throw error;
      }

      // Log other errors too (but not as auth failures)
      this.logger.error(
        `❌ Error syncing emails for user ${userId}:`,
        isError(error)
          ? error.message
          : isApiError(error)
            ? error.message
            : String(error),
      );
      throw error;
    }
  }

  /**
   * Process individual scan email with progress tracking
   */
  async processScanEmail(userId: string, messageId: string): Promise<void> {
    const startTime = Date.now();
    this.logger.debug(
      `[processScanEmail] Starting to process email ${messageId} for user ${userId}`,
    );

    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) {
      this.logger.log(
        `[processScanEmail] User ${userId} not connected, skipping`,
      );
      return;
    }

    // Check if email already exists in temporary scan table
    const existing = await this.scanEmailService.findByMessageId(
      userId,
      messageId,
    );
    if (existing) {
      // Track progress counter (batch updates every 10 emails)
      const currentCount = (this.progressUpdateCounters.get(userId) || 0) + 1;
      this.progressUpdateCounters.set(userId, currentCount);

      // Update progress every 10 emails
      if (currentCount % 10 === 0) {
        const result = await this.usersService.incrementScanProgress(
          userId,
          10,
        );
        this.progressUpdateCounters.set(userId, 0);
        if (result.isComplete) {
          // Trigger analysis job when scan completes
          this.progressUpdateCounters.delete(userId);
          await this.boss.send(
            "analyze-scan-results",
            { userId },
            {
              priority: getJobPriority("analyze-scan-results", false),
            },
          );
        }
      }
      const duration = Date.now() - startTime;
      this.logger.debug(
        `[processScanEmail] Skipped existing email ${messageId} in ${duration}ms`,
      );
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
        // Track progress counter (batch updates every 10 emails)
        const currentCount = (this.progressUpdateCounters.get(userId) || 0) + 1;
        this.progressUpdateCounters.set(userId, currentCount);

        // Update progress every 10 emails
        if (currentCount % 10 === 0) {
          const result = await this.usersService.incrementScanProgress(
            userId,
            10,
          );
          this.progressUpdateCounters.set(userId, 0);
          if (result.isComplete) {
            // Trigger analysis job when scan completes
            this.progressUpdateCounters.delete(userId);
            await this.boss.send(
              "analyze-scan-results",
              { userId },
              {
                priority: getJobPriority("analyze-scan-results", false),
              },
            );
          }
        }
        const duration = Date.now() - startTime;
        this.logger.warn(
          `[processScanEmail] Failed to parse email ${messageId} in ${duration}ms`,
        );
        return;
      }

      // Check if archived (not in inbox)
      const isArchived = messageData.folderId !== "inbox";

      // Save to temporary scan table instead of main emails table
      await this.scanEmailService.createScanEmail(userId, {
        messageId: rawEmail.messageId,
        threadId: rawEmail.threadId,
        subject: rawEmail.subject,
        from: rawEmail.from,
        fromName: rawEmail.fromName,
        body: rawEmail.body,
        htmlBody: rawEmail.htmlBody,
        starCount: rawEmail.starCount || 0,
        receivedAt: rawEmail.receivedAt,
        isRead: rawEmail.isRead || false,
        isArchived,
      });

      // Track progress counter (batch updates every 10 emails)
      const currentCount = (this.progressUpdateCounters.get(userId) || 0) + 1;
      this.progressUpdateCounters.set(userId, currentCount);

      // Update progress every 10 emails
      if (currentCount % 10 === 0) {
        const result = await this.usersService.incrementScanProgress(
          userId,
          10,
        );
        this.progressUpdateCounters.set(userId, 0);
        if (result.isComplete) {
          // Trigger analysis job when scan completes
          this.progressUpdateCounters.delete(userId);
          this.logger.log(
            `[processScanEmail] Scan complete for user ${userId}, triggering analysis`,
          );
          await this.boss.send(
            "analyze-scan-results",
            { userId },
            {
              priority: getJobPriority("analyze-scan-results", false),
            },
          );
        }
      }
      const duration = Date.now() - startTime;
      this.logger.log(
        `[processScanEmail] Completed email ${messageId} in ${duration}ms`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Error processing message ${messageId} for user ${userId}:`,
        error,
      );
      // Track progress counter (batch updates every 10 emails)
      const currentCount = (this.progressUpdateCounters.get(userId) || 0) + 1;
      this.progressUpdateCounters.set(userId, currentCount);

      // Update progress every 10 emails
      if (currentCount % 10 === 0) {
        const result = await this.usersService.incrementScanProgress(
          userId,
          10,
        );
        this.progressUpdateCounters.set(userId, 0);
        if (result.isComplete) {
          // Trigger analysis job when scan completes
          this.progressUpdateCounters.delete(userId);
          await this.boss.send(
            "analyze-scan-results",
            { userId },
            {
              priority: getJobPriority("analyze-scan-results", false),
            },
          );
        }
      }
      const apiError = isApiError(error) ? error : null;
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401)
      ) {
        try {
          await this.client.refreshTokenIfNeeded(userId, primaryAccount.id);
          // Retry with new token
          await this.processScanEmail(userId, messageId);
          return;
        } catch (refreshError) {
          this.logger.error(
            "Failed to refresh token during scan:",
            refreshError,
          );
        }
      }
    }
  }

  async scanHistory(userId: string): Promise<void> {
    this.logger.log(`Starting historical email scan for user ${userId}`);
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) {
      this.logger.log(
        `User ${userId} not connected to Zoho Mail, skipping historical scan.`,
      );
      return;
    }

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
      const total = Math.min(filteredMessages.length, 300);

      await this.usersService.update(userId, {
        scanTotal: total,
        scanProgress: 0,
      });

      // Initialize progress counter
      this.progressUpdateCounters.set(userId, 0);

      // Process each message using processScanEmail for consistent progress tracking
      for (let i = 0; i < total; i++) {
        const msg = filteredMessages[i];
        if (!msg.uid) continue;

        try {
          await this.processScanEmail(userId, msg.uid);
        } catch (error) {
          this.logger.error(`Error processing message ${msg.uid}:`, error);
        }
      }

      // Final progress update
      const finalProgress = await this.usersService.incrementScanProgress(
        userId,
        this.progressUpdateCounters.get(userId) || 0,
      );
      this.progressUpdateCounters.delete(userId);

      if (finalProgress.isComplete) {
        await this.boss.send(
          "analyze-scan-results",
          { userId },
          {
            priority: getJobPriority("analyze-scan-results", false),
          },
        );
      }

      await this.usersService.update(userId, {
        hasScannedHistory: true,
      });

      this.logger.log(`Historical scan completed for user ${userId}`);
    } catch (error: unknown) {
      const apiError = isApiError(error) ? error : null;
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401)
      ) {
        try {
          accessToken = await this.client.refreshTokenIfNeeded(
            userId,
            primaryAccount.id,
          );
          // Retry scan
          await this.scanHistory(userId);
          return;
        } catch (refreshError) {
          this.logger.error(
            "Failed to refresh token during scan:",
            refreshError,
          );
          throw new Error("Token refresh failed - please reconnect");
        }
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
    attachments?: import("../interfaces/email-provider.interface").EmailAttachmentData[],
    htmlBody?: string,
  ): Promise<{ messageId: string; threadId: string }> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) {
      throw new Error("Zoho Mail account not connected. Cannot send email.");
    }

    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);

      const response = await zohoClient.post(
        `/accounts/${zohoAccountId}/messages`,
        {
          to: [{ address: to }],
          subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
          content: {
            html: htmlBody || body,
          },
          inReplyTo: threadId,
        },
      );

      this.logger.log(`Reply sent successfully for user ${userId} to ${to}`);
      return {
        messageId: response?.data?.messageId || `zoho-${Date.now()}`,
        threadId,
      };
    } catch (error: unknown) {
      const apiError = isApiError(error) ? error : null;
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401)
      ) {
        try {
          accessToken = await this.client.refreshTokenIfNeeded(
            userId,
            primaryAccount.id,
          );
          // Retry with new token
          return await this.sendReply(
            userId,
            threadId,
            to,
            subject,
            body,
            attachments,
          );
        } catch (refreshError) {
          this.logger.error("Failed to refresh token:", refreshError);
          throw new Error("Token refresh failed - please reconnect");
        }
      }
      this.logger.error(`Failed to send reply for user ${userId}:`, error);
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _attachments?: EmailAttachmentData[],
  ): Promise<{ messageId: string; threadId: string }> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) {
      throw new Error("Zoho Mail account not connected. Cannot send email.");
    }

    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);

      const message: any = {
        to: to.map((r) => ({
          address: r.email,
          personal: r.name,
        })),
        subject,
        content: {
          html: body,
        },
      };

      if (cc && cc.length > 0) {
        message.cc = cc.map((r) => ({
          address: r.email,
          personal: r.name,
        }));
      }

      if (bcc && bcc.length > 0) {
        message.bcc = bcc.map((r) => ({
          address: r.email,
          personal: r.name,
        }));
      }

      const response = await zohoClient.post(
        `/accounts/${zohoAccountId}/messages`,
        message,
      );

      const messageId = response.data.data?.uid || `msg-${Date.now()}`;
      const threadId = response.data.data?.threadId || messageId;

      this.logger.log(`Email sent successfully for user ${userId}`);
      return { messageId, threadId };
    } catch (error: unknown) {
      const apiError = isApiError(error) ? error : null;
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401)
      ) {
        try {
          accessToken = await this.client.refreshTokenIfNeeded(
            userId,
            primaryAccount.id,
          );
          // Retry with new token
          return await this.sendEmail(userId, to, subject, body, cc, bcc);
        } catch (refreshError) {
          this.logger.error("Failed to refresh token:", refreshError);
          throw new Error("Token refresh failed - please reconnect");
        }
      }
      this.logger.error(`Failed to send email for user ${userId}:`, error);
      throw new Error("Failed to send email");
    }
  }

  async searchEmails(
    userId: string,
    query: string,
    maxResults: number = 50,
  ): Promise<RawEmailMessage[]> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) {
      return [];
    }

    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);

      const response = await zohoClient.get(
        `/accounts/${zohoAccountId}/messages/search`,
        {
          params: {
            query,
            limit: maxResults,
          },
        },
      );

      const messages = response.data.data || [];

      return messages
        .map((msg: any) => {
          const parsed = parseZohoMessage(msg);
          return parsed;
        })
        .filter((msg): msg is RawEmailMessage => msg !== null);
    } catch (error: unknown) {
      const apiError = isApiError(error) ? error : null;
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401)
      ) {
        try {
          accessToken = await this.client.refreshTokenIfNeeded(
            userId,
            primaryAccount.id,
          );
          // Retry with new token
          return await this.searchEmails(userId, query, maxResults);
        } catch (refreshError) {
          this.logger.error("Failed to refresh token:", refreshError);
          return [];
        }
      }
      this.logger.error(`Failed to search emails for user ${userId}:`, error);
      return [];
    }
  }

  async archiveThread(userId: string, threadId: string): Promise<void> {
    this.logger.log(
      `[Zoho Archive] Starting archiveThread: userId=${userId}, threadId=${threadId}`,
    );
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) {
      this.logger.error(
        `[Zoho Archive] Zoho Mail account not connected: userId=${userId}`,
      );
      throw new Error("Zoho Mail account not connected");
    }

    this.logger.log(
      `[Zoho Archive] Primary account found, creating Zoho client: userId=${userId}`,
    );
    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      this.logger.log(`[Zoho Archive] Getting account ID: userId=${userId}`);
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);
      this.logger.log(
        `[Zoho Archive] Account ID retrieved: userId=${userId}, accountId=${zohoAccountId}`,
      );

      // Get all messages in the thread
      this.logger.log(
        `[Zoho Archive] Fetching messages for thread: userId=${userId}, threadId=${threadId}`,
      );
      const response = await zohoClient.get(
        `/accounts/${zohoAccountId}/messages`,
        {
          params: {
            threadId,
          },
        },
      );

      const messages = response.data.data || [];
      this.logger.log(
        `[Zoho Archive] Found ${messages.length} messages in thread: userId=${userId}, threadId=${threadId}`,
      );

      // Mark messages as read and move to archive folder
      let archivedCount = 0;
      for (const msg of messages) {
        try {
          // First mark the message as read
          this.logger.log(
            `[Zoho Archive] Marking message as read: userId=${userId}, threadId=${threadId}, messageUid=${msg.uid}`,
          );
          await zohoClient.put(
            `/accounts/${zohoAccountId}/messages/${msg.uid}/markAsRead`,
            {},
          );

          // Then move to archive folder
          this.logger.log(
            `[Zoho Archive] Moving message to archive: userId=${userId}, threadId=${threadId}, messageUid=${msg.uid}`,
          );
          await zohoClient.post(
            `/accounts/${zohoAccountId}/messages/${msg.uid}/move`,
            {
              folderid: "archive",
            },
          );
          archivedCount++;
        } catch (error) {
          this.logger.error(
            `[Zoho Archive] Failed to archive message ${msg.uid}:`,
            error,
          );
        }
      }
      this.logger.log(
        `[Zoho Archive] Marked as read and moved ${archivedCount}/${messages.length} messages to archive: userId=${userId}, threadId=${threadId}`,
      );

      // Update in our database
      this.logger.log(
        `[Zoho Archive] Updating thread archived status in database: userId=${userId}, threadId=${threadId}`,
      );
      await this.emailsService.updateThreadArchivedStatus(
        userId,
        threadId,
        true,
      );
      this.logger.log(
        `[Zoho Archive] Thread archived successfully: userId=${userId}, threadId=${threadId}`,
      );
    } catch (error: unknown) {
      const apiError = isApiError(error) ? error : null;
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401)
      ) {
        try {
          accessToken = await this.client.refreshTokenIfNeeded(
            userId,
            primaryAccount.id,
          );
          // Retry with new token
          await this.archiveThread(userId, threadId);
          return;
        } catch (refreshError) {
          this.logger.error("Failed to refresh token:", refreshError);
          throw new Error("Token refresh failed - please reconnect");
        }
      }
      this.logger.error(`Failed to archive thread ${threadId}:`, error);
      throw new Error("Failed to archive thread");
    }
  }

  async unarchiveThread(userId: string, threadId: string): Promise<void> {
    const primaryAccount = await this.zohoAccountsService.findPrimary(userId);
    if (!primaryAccount) {
      throw new Error("Zoho Mail account not connected");
    }

    let { accessToken } = primaryAccount;
    const zohoClient = this.client.createZohoClient(accessToken);

    try {
      const zohoAccountId = await this.client.getAccountId(userId, accessToken);

      // Get all messages in the thread from archive
      const response = await zohoClient.get(
        `/accounts/${zohoAccountId}/messages`,
        {
          params: {
            threadId,
            folderid: "archive",
          },
        },
      );

      const messages = response.data.data || [];

      // Move messages back to inbox
      for (const msg of messages) {
        try {
          await zohoClient.post(
            `/accounts/${zohoAccountId}/messages/${msg.uid}/move`,
            {
              folderid: "inbox",
            },
          );
        } catch (error) {
          this.logger.error(`Failed to unarchive message ${msg.uid}:`, error);
        }
      }

      // Update in our database
      await this.emailsService.updateThreadArchivedStatus(
        userId,
        threadId,
        false,
      );
    } catch (error: unknown) {
      const apiError = isApiError(error) ? error : null;
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401)
      ) {
        try {
          accessToken = await this.client.refreshTokenIfNeeded(
            userId,
            primaryAccount.id,
          );
          // Retry with new token
          await this.unarchiveThread(userId, threadId);
          return;
        } catch (refreshError) {
          this.logger.error("Failed to refresh token:", refreshError);
          throw new Error("Token refresh failed - please reconnect");
        }
      }
      this.logger.error(`Failed to unarchive thread ${threadId}:`, error);
      throw new Error("Failed to unarchive thread");
    }
  }

  async syncStarStatusToGmail(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void> {
    // TODO: Implement star sync for Zoho Mail
    // For now, this is a no-op as star functionality may differ between providers
    this.logger.debug(
      `syncStarStatusToGmail called for Zoho (not yet implemented): userId=${userId}, threadId=${threadId}, starCount=${starCount}`,
    );
  }

  async snoozeThread(
    userId: string,
    threadId: string,
    snoozeUntil: Date,
  ): Promise<void> {
    // TODO: Implement snooze for Zoho
    // Zoho Mail may support labels or folders similar to Gmail
    // For now, log a warning but don't fail
    this.logger.warn(
      `snoozeThread called for Zoho (not yet implemented): userId=${userId}, threadId=${threadId}, snoozeUntil=${snoozeUntil.toISOString()}`,
    );
    // Database update will still succeed, but provider sync is skipped
  }

  async unsnoozeThread(userId: string, threadId: string): Promise<void> {
    // TODO: Implement unsnooze for Zoho
    this.logger.warn(
      `unsnoozeThread called for Zoho (not yet implemented): userId=${userId}, threadId=${threadId}`,
    );
    // Database update will still succeed, but provider sync is skipped
  }

  async getAttachment(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _userId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _messageId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _attachmentId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _attachmentMetadata?: {
      filename: string;
      mimeType: string;
      size: number;
    },
  ): Promise<{
    data: Buffer;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    // TODO: Implement attachment download for Zoho
    throw new Error("Attachment download not yet implemented for Zoho");
  }

  async trashThread(userId: string, threadId: string): Promise<void> {
    // TODO: Implement trash for Zoho Mail
    // For now, archive instead of trash
    this.logger.debug(
      `trashThread called for Zoho (using archive instead): userId=${userId}, threadId=${threadId}`,
    );
    await this.archiveThread(userId, threadId);
  }
}
