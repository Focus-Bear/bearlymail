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
import { Office365AccountsService } from "../../office365-accounts/office365-accounts.service";
import { ConfigService } from "@nestjs/config";
import {
  parseOffice365Message,
  MicrosoftGraphMessage,
} from "./office365/office365-message-parser";
import { Office365Client } from "./office365/office365-client";
import {
  isWithinGracePeriod,
  logOffice365AuthFailure as logAuthFailure,
} from "./office365/office365-auth";

@Injectable()
export class Office365Provider implements EmailProvider {
  private readonly logger = new Logger(Office365Provider.name);
  // Track progress update counters per user to batch updates every 10 emails
  private readonly progressUpdateCounters = new Map<string, number>();
  private readonly client: Office365Client;

  constructor(
    private usersService: UsersService,
    @Inject(forwardRef(() => EmailsService))
    private emailsService: EmailsService,
    private scanEmailService: ScanEmailService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private office365AccountsService: Office365AccountsService,
    private configService: ConfigService,
  ) {
    this.client = new Office365Client(office365AccountsService, configService);
  }

  async isConnected(userId: string): Promise<boolean> {
    return this.office365AccountsService.hasConnectedOffice365(userId);
  }

  /**
   * Verify thread statuses in Office365 API in batches with concurrency limits
   * Returns array of updates: { threadId, starCount, isArchived }[]
   */
  private async verifyThreadStatusesInOffice365(
    userId: string,
    threadIds: string[],
    graphClient: any,
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
            // Get conversation from Office365 to check current status
            const conversationResponse = await graphClient.get(`/me/messages`, {
              params: {
                $filter: `conversationId eq '${threadId}'`,
                $top: 1,
                $select: "id,conversationId,importance,parentFolderId",
              },
            });

            const conversationMessages = conversationResponse.data.value || [];
            if (conversationMessages.length === 0) {
              // Thread deleted in Office365 - mark as archived
              updates.push({
                threadId,
                starCount: 0,
                isArchived: true,
              });
              return;
            }

            const latestMessage = conversationMessages[0];
            const isImportant = latestMessage.importance === "high";
            const isInInbox = latestMessage.parentFolderId === "inbox";
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
                `Thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found in Office365 (may be deleted)`,
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

  // eslint-disable-next-line max-lines-per-function, complexity, max-statements
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
      `[Office365Provider] User ${userId} sync check:`,
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
        await this.office365AccountsService.updateTokens(
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
    const graphClient = this.client.createGraphClient(accessToken);

    // Try to proactively validate token by making a lightweight API call
    try {
      await graphClient.get("/me", {
        params: {
          $select: "id",
        },
      });
      this.logger.debug(`Token validated for user ${userId}`);
    } catch (refreshError: unknown) {
      // GRACE PERIOD: If user just logged in, don't flag for re-login immediately
      let currentAccount = primaryAccount;
      try {
        currentAccount =
          await this.office365AccountsService.findPrimary(userId);
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
        await this.office365AccountsService.updateTokens(
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
      // Fetch conversations/threads from inbox and important messages
      // Microsoft Graph doesn't have a direct "starred" concept, so we use importance
      const [inboxResponse, importantResponse] = await Promise.all([
        // Fetch unread messages from inbox
        graphClient.get("/me/mailFolders/inbox/messages", {
          params: {
            $filter: "isRead eq false",
            $orderby: "receivedDateTime desc",
            $top: 500,
            $select:
              "id,conversationId,subject,from,receivedDateTime,isRead,importance",
          },
        }),
        // Fetch important messages (high importance = starred equivalent)
        graphClient.get("/me/messages", {
          params: {
            $filter: "importance eq 'high'",
            $orderby: "receivedDateTime desc",
            $top: 500,
            $select:
              "id,conversationId,subject,from,receivedDateTime,isRead,importance",
          },
        }),
      ]);

      const inboxMessages = inboxResponse.data.value || [];
      const importantMessages = importantResponse.data.value || [];

      // Group messages by conversationId to get threads
      const conversationMap = new Map<string, MicrosoftGraphMessage[]>();
      const allMessageIds = new Set<string>();

      for (const msg of [...inboxMessages, ...importantMessages]) {
        if (!msg.id) continue;
        allMessageIds.add(msg.id);
        const conversationId = msg.conversationId || msg.id;
        if (!conversationMap.has(conversationId)) {
          conversationMap.set(conversationId, []);
        }
        conversationMap.get(conversationId)!.push(msg);
      }

      this.logger.debug(
        `Found ${inboxMessages.length} inbox messages and ${importantMessages.length} important messages (${conversationMap.size} unique conversations) for user ${userId}`,
      );

      // Process each conversation/thread
      const threadStarCountUpdates: { threadId: string; starCount: number }[] =
        [];
      const threadArchivedUpdates: {
        threadId: string;
        isArchived: boolean;
      }[] = [];

      for (const [conversationId, messages] of conversationMap.entries()) {
        if (!conversationId || messages.length === 0) continue;

        try {
          // Get the latest message to determine current status
          const latestMessage = messages.sort(
            (a, b) =>
              new Date(b.receivedDateTime || 0).getTime() -
              new Date(a.receivedDateTime || 0).getTime(),
          )[0];

          // Check if conversation is in inbox (if any message is in inbox, thread is not archived)
          const isInInbox = inboxMessages.some(
            (m) =>
              m.conversationId === conversationId || m.id === conversationId,
          );
          const isArchived = !isInInbox;
          const isImportant = latestMessage.importance === "high";
          const starCount = isImportant ? 3 : 0;

          // Collect thread updates
          threadStarCountUpdates.push({ threadId: conversationId, starCount });
          threadArchivedUpdates.push({ threadId: conversationId, isArchived });

          // Process all messages in the conversation
          for (const message of messages) {
            if (!message.id) continue;

            // Get full message details
            const fullMsg = await graphClient.get(
              `/me/messages/${message.id}`,
              {
                params: {
                  $select:
                    "id,subject,from,receivedDateTime,isRead,body,bodyPreview,conversationId,importance,parentFolderId",
                },
              },
            );

            const messageData = fullMsg.data as MicrosoftGraphMessage;
            const rawEmail = parseOffice365Message(messageData);
            if (!rawEmail) continue;

            const existing = await this.emailsService.getEmailByMessageId(
              userId,
              message.id,
            );

            if (existing) {
              // Sync read status from Office 365
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
          // Skip conversations that fail (deleted, permissions, etc.)
          if (isApiError(threadError) && threadError.code === 404) {
            this.logger.debug(
              `Conversation ${conversationId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found (may be deleted)`,
            );
          } else {
            const errorMsg = isError(threadError)
              ? threadError.message
              : isApiError(threadError)
                ? threadError.message
                : "Unknown error";
            this.logger.warn(
              `Error processing conversation ${conversationId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...:`,
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

      // Also check existing starred threads against Office 365
      const existingStarredThreads =
        await this.emailsService.getExistingStarredThreads(userId);

      this.logger.debug(
        `Checking ${existingStarredThreads.length} existing starred threads against Office 365`,
      );

      const existingThreadUpdates: {
        threadId: string;
        starCount: number;
        isArchived: boolean;
      }[] = [];

      // Check each existing starred thread against Office 365
      for (const dbThread of existingStarredThreads) {
        // Skip if we already processed this thread in the main sync
        if (conversationMap.has(dbThread.threadId)) {
          continue;
        }

        try {
          // Get conversation from Office 365 to check current status
          const conversationResponse = await graphClient.get(`/me/messages`, {
            params: {
              $filter: `conversationId eq '${dbThread.threadId}'`,
              $top: 1,
              $select: "id,conversationId,importance,parentFolderId",
            },
          });

          const conversationMessages = conversationResponse.data.value || [];
          if (conversationMessages.length === 0) {
            // Thread deleted in Office 365 - mark as archived
            existingThreadUpdates.push({
              threadId: dbThread.threadId,
              starCount: 0,
              isArchived: true,
            });
            continue;
          }

          const latestMessage = conversationMessages[0];
          const isImportant = latestMessage.importance === "high";
          const isInInbox = latestMessage.parentFolderId === "inbox";
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
              `Existing thread ${dbThread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found in Office 365 (may be deleted)`,
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
      // This ensures we catch threads that were archived in Office365 but are still marked as non-archived in DB
      // We check a limited number per user per run (50) and prioritize threads that haven't been checked recently
      // This spreads the work across multiple sync cycles to handle 1000+ users efficiently
      const threadsNeedingCheck =
        await this.emailsService.getNonArchivedThreadsNeedingCheck(
          userId,
          50, // Limit to 50 threads per user per 5-minute sync cycle
        );
      const threadsToCheck = threadsNeedingCheck.filter(
        (threadId) => !conversationMap.has(threadId), // Skip already processed threads
      );

      if (threadsToCheck.length > 0) {
        this.logger.debug(
          `Checking ${threadsToCheck.length} non-archived threads against Office365`,
        );

        const nonArchivedUpdates = await this.verifyThreadStatusesInOffice365(
          userId,
          threadsToCheck,
          graphClient,
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
          "syncEmails-office365Api",
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
          await this.office365AccountsService.updateTokens(
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

    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
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
    const graphClient = this.client.createGraphClient(accessToken);

    try {
      const fullMsg = await graphClient.get(`/me/messages/${messageId}`, {
        params: {
          $select:
            "id,subject,from,receivedDateTime,isRead,body,bodyPreview,conversationId,importance,parentFolderId",
        },
      });

      const messageData = fullMsg.data as MicrosoftGraphMessage;
      const rawEmail = parseOffice365Message(messageData);
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
      const isArchived = messageData.parentFolderId !== "inbox";

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
    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
    if (!primaryAccount) {
      this.logger.log(
        `User ${userId} not connected to Office 365, skipping historical scan.`,
      );
      return;
    }

    let { accessToken } = primaryAccount;
    const graphClient = this.client.createGraphClient(accessToken);

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DAYS.WEEK);

      const response = await graphClient.get("/me/mailFolders/inbox/messages", {
        params: {
          $filter: `receivedDateTime ge ${sevenDaysAgo.toISOString()}`,
          $orderby: "receivedDateTime desc",
          $top: 300,
          $select: "id",
        },
      });

      const messages = response.data.value || [];
      const total = Math.min(messages.length, 300);

      await this.usersService.update(userId, {
        scanTotal: total,
        scanProgress: 0,
      });

      // Initialize progress counter
      this.progressUpdateCounters.set(userId, 0);

      // Process each message using processScanEmail for consistent progress tracking
      for (let i = 0; i < total; i++) {
        const msg = messages[i];
        if (!msg.id) continue;

        try {
          await this.processScanEmail(userId, msg.id);
        } catch (error) {
          this.logger.error(`Error processing message ${msg.id}:`, error);
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
    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
    if (!primaryAccount) {
      throw new Error("Office 365 account not connected. Cannot send email.");
    }

    let { accessToken } = primaryAccount;
    const graphClient = this.client.createGraphClient(accessToken);

    try {
      const response = await graphClient.post("/me/sendMail", {
        message: {
          subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
          body: {
            contentType: "HTML",
            content: htmlBody || body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: to,
              },
            },
          ],
        },
      });

      this.logger.log(`Reply sent successfully for user ${userId} to ${to}`);
      return {
        messageId: response?.data?.id || `office365-${Date.now()}`,
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
    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
    if (!primaryAccount) {
      throw new Error("Office 365 account not connected. Cannot send email.");
    }

    let { accessToken } = primaryAccount;
    const graphClient = this.client.createGraphClient(accessToken);

    try {
      const message: any = {
        subject,
        body: {
          contentType: "HTML",
          content: body,
        },
        toRecipients: to.map((r) => ({
          emailAddress: {
            address: r.email,
            name: r.name,
          },
        })),
      };

      if (cc && cc.length > 0) {
        message.ccRecipients = cc.map((r) => ({
          emailAddress: {
            address: r.email,
            name: r.name,
          },
        }));
      }

      if (bcc && bcc.length > 0) {
        message.bccRecipients = bcc.map((r) => ({
          emailAddress: {
            address: r.email,
            name: r.name,
          },
        }));
      }

      await graphClient.post("/me/sendMail", {
        message,
      });

      // Microsoft Graph doesn't return messageId directly, so we'll use a generated one
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const threadId = messageId; // Microsoft uses conversationId, but we'll use messageId as fallback

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
    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
    if (!primaryAccount) {
      return [];
    }

    let { accessToken } = primaryAccount;
    const graphClient = this.client.createGraphClient(accessToken);

    try {
      // Microsoft Graph search syntax
      const searchQuery =
        query.includes("from:") || query.includes("subject:")
          ? query
          : `subject:"${query}" OR from:"${query}" OR body:"${query}"`;

      const response = await graphClient.get("/me/messages", {
        params: {
          $search: searchQuery,
          $top: maxResults,
          $select:
            "id,subject,from,receivedDateTime,isRead,body,bodyPreview,conversationId,importance",
        },
      });

      const messages = response.data.value || [];

      return messages
        .map((msg: any) => {
          const parsed = parseOffice365Message(msg);
          if (!parsed) {
            return null;
          }
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
      `[Office365 Archive] Starting archiveThread: userId=${userId}, threadId=${threadId}`,
    );
    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
    if (!primaryAccount) {
      this.logger.error(
        `[Office365 Archive] Office 365 account not connected: userId=${userId}`,
      );
      throw new Error("Office 365 account not connected");
    }

    this.logger.log(
      `[Office365 Archive] Primary account found, creating Graph client: userId=${userId}`,
    );
    let { accessToken } = primaryAccount;
    const graphClient = this.client.createGraphClient(accessToken);

    try {
      // Get all messages in the conversation
      this.logger.log(
        `[Office365 Archive] Fetching messages for conversation: userId=${userId}, threadId=${threadId}`,
      );
      const response = await graphClient.get("/me/messages", {
        params: {
          $filter: `conversationId eq '${threadId}'`,
          $select: "id",
        },
      });

      const messages = response.data.value || [];
      this.logger.log(
        `[Office365 Archive] Found ${messages.length} messages in conversation: userId=${userId}, threadId=${threadId}`,
      );

      // Mark messages as read and move to archive folder
      let archivedCount = 0;
      for (const msg of messages) {
        try {
          // First mark the message as read
          this.logger.log(
            `[Office365 Archive] Marking message as read: userId=${userId}, threadId=${threadId}, messageId=${msg.id}`,
          );
          await graphClient.patch(`/me/messages/${msg.id}`, {
            isRead: true,
          });

          // Then move to archive folder
          this.logger.log(
            `[Office365 Archive] Moving message to archive: userId=${userId}, threadId=${threadId}, messageId=${msg.id}`,
          );
          await graphClient.post(`/me/messages/${msg.id}/move`, {
            destinationId: "archive",
          });
          archivedCount++;
        } catch (error) {
          this.logger.error(
            `[Office365 Archive] Failed to archive message ${msg.id}:`,
            error,
          );
        }
      }
      this.logger.log(
        `[Office365 Archive] Marked as read and moved ${archivedCount}/${messages.length} messages to archive: userId=${userId}, threadId=${threadId}`,
      );

      // Update in our database
      this.logger.log(
        `[Office365 Archive] Updating thread archived status in database: userId=${userId}, threadId=${threadId}`,
      );
      await this.emailsService.updateThreadArchivedStatus(
        userId,
        threadId,
        true,
      );
      this.logger.log(
        `[Office365 Archive] Thread archived successfully: userId=${userId}, threadId=${threadId}`,
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
    const primaryAccount =
      await this.office365AccountsService.findPrimary(userId);
    if (!primaryAccount) {
      throw new Error("Office 365 account not connected");
    }

    let { accessToken } = primaryAccount;
    const graphClient = this.client.createGraphClient(accessToken);

    try {
      // Get all messages in the conversation from archive
      const archiveResponse = await graphClient.get(
        "/me/mailFolders/archive/messages",
        {
          params: {
            $filter: `conversationId eq '${threadId}'`,
            $select: "id",
          },
        },
      );

      const messages = archiveResponse.data.value || [];

      // Move messages back to inbox
      for (const msg of messages) {
        try {
          await graphClient.post(`/me/messages/${msg.id}/move`, {
            destinationId: "inbox",
          });
        } catch (error) {
          this.logger.error(`Failed to unarchive message ${msg.id}:`, error);
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
    // TODO: Implement star sync for Office365
    // For now, this is a no-op as star functionality may differ between providers
    // Office365 uses importance/flag system rather than stars
    this.logger.debug(
      `syncStarStatusToGmail called for Office365 (not yet implemented): userId=${userId}, threadId=${threadId}, starCount=${starCount}`,
    );
  }

  async snoozeThread(
    userId: string,
    threadId: string,
    snoozeUntil: Date,
  ): Promise<void> {
    // TODO: Implement snooze for Office365
    // Office365 doesn't have native snooze like Gmail, but could use:
    // - Categories (if supported)
    // - Custom folders
    // - Flag with reminder date
    // For now, log a warning but don't fail
    this.logger.warn(
      `snoozeThread called for Office365 (not yet implemented): userId=${userId}, threadId=${threadId}, snoozeUntil=${snoozeUntil.toISOString()}`,
    );
    // Database update will still succeed, but provider sync is skipped
  }

  async unsnoozeThread(userId: string, threadId: string): Promise<void> {
    // TODO: Implement unsnooze for Office365
    this.logger.warn(
      `unsnoozeThread called for Office365 (not yet implemented): userId=${userId}, threadId=${threadId}`,
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
    // TODO: Implement attachment download for Office365
    throw new Error("Attachment download not yet implemented for Office365");
  }

  async trashThread(userId: string, threadId: string): Promise<void> {
    // TODO: Implement trash for Office365
    // For now, archive instead of trash
    this.logger.debug(
      `trashThread called for Office365 (using archive instead): userId=${userId}, threadId=${threadId}`,
    );
    await this.archiveThread(userId, threadId);
  }
}
