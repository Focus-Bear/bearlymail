/* eslint-disable max-lines */
import { Injectable, Inject, forwardRef, Logger } from "@nestjs/common";
import { google, gmail_v1 } from "googleapis";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { MoreThan } from "typeorm";
import { UsersService } from "../../users/users.service";
import { EmailsService } from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import {
  EmailProvider,
  RawEmailMessage,
  EmailRecipient,
  EmailAttachmentData,
} from "../interfaces/email-provider.interface";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Email } from "../../database/entities/email.entity";
import PgBoss = require("pg-boss");
import { getJobPriority } from "../../queue/job-priorities";
import { QUERY_LIMITS } from "../../constants/query-limits";
import { MINUTES, DAYS, MILLISECONDS } from "../../constants/time-constants";
import { isApiError, isError } from "../../types/common";
import { logErrorToFile } from "../../utils/error-logger";

// BearlyMail custom labels
// Note: Gmail doesn't allow adding custom labels via addLabelIds in threads.modify
// We archive by removing INBOX label only

@Injectable()
export class GmailProvider implements EmailProvider {
  // Track progress update counters per user to batch updates every 10 emails
  private readonly progressUpdateCounters = new Map<string, number>();
  // Cache for Gmail label names per user (labelId -> labelName)
  private labelCache: Map<string, Map<string, string>> = new Map();
  private labelCacheExpiry: Map<string, number> = new Map();
  // 30 minutes
  private readonly LABEL_CACHE_TTL = MINUTES.THIRTY * MILLISECONDS.MINUTE;
  // Cache for BearlyMail label IDs per user
  private bearlyMailLabelCache: Map<string, string> = new Map();
  private readonly logger = new Logger(GmailProvider.name);

  constructor(
    private usersService: UsersService,
    @Inject(forwardRef(() => EmailsService))
    private emailsService: EmailsService,
    private scanEmailService: ScanEmailService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
  ) {}

  /**
   * Fetch and cache Gmail label names for a user
   */
  async getGmailLabels(userId: string): Promise<Map<string, string>> {
    // Check cache
    const cached = this.labelCache.get(userId);
    const expiry = this.labelCacheExpiry.get(userId);
    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      return new Map();
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      const response = await gmail.users.labels.list({ userId: "me" });
      const labels = response.data.labels || [];

      const labelMap = new Map<string, string>();
      for (const label of labels) {
        if (label.id && label.name) {
          labelMap.set(label.id, label.name);
        }
      }

      // Cache the results
      this.labelCache.set(userId, labelMap);
      this.labelCacheExpiry.set(userId, Date.now() + this.LABEL_CACHE_TTL);

      return labelMap;
    } catch (error) {
      this.logger.error("Failed to fetch Gmail labels:", error);
      return cached || new Map();
    }
  }

  /**
   * Convert label IDs to human-readable names
   */
  async convertLabelIdsToNames(
    userId: string,
    labelIds: string[],
  ): Promise<string[]> {
    if (!labelIds || labelIds.length === 0) return [];

    const labelMap = await this.getGmailLabels(userId);

    // System labels to skip (internal Gmail labels)
    // These are Gmail system labels that should not be shown to users
    const skipLabels = new Set([
      "INBOX",
      "SENT",
      "TRASH",
      "SPAM",
      "DRAFT",
      "UNREAD",
      "STARRED",
      "IMPORTANT",
      "CATEGORY_PERSONAL",
      "CATEGORY_SOCIAL",
      "CATEGORY_PROMOTIONS",
      "CATEGORY_UPDATES",
      "CATEGORY_FORUMS",
      // Gmail color labels (system labels)
      "GREEN_CIRCLE",
      "BLUE_STAR",
      "YELLOW_STAR",
      "RED_BANG",
      "YELLOW_BANG",
      "PURPLE_QUESTION",
      "ORANGE_GUILLEMET",
      "BLUE_INFO",
      "RED_MINUS",
      "YELLOW_MINUS",
      "GREEN_CHECK",
      "BLUE_CHECK",
      "RED_CHECK",
      "ORANGE_CHECK",
    ]);

    // Convert IDs to names, then filter
    const converted = labelIds
      .map((id) => {
        // First check if the ID itself is a system label
        if (skipLabels.has(id)) {
          return null;
        }
        // Convert ID to name
        const name = labelMap.get(id) || id;
        // Check if the converted name is a system label (in case it was already a name)
        if (skipLabels.has(name)) {
          return null;
        }
        // Filter out Label_* patterns
        if (name.startsWith("Label_") || name.startsWith("label_")) {
          return null;
        }
        return name;
      })
      .filter((name): name is string => name !== null);

    // Remove duplicates using Set
    const uniqueConverted = Array.from(new Set(converted));

    // Debug logging
    this.logger.debug(
      `[GmailProvider] Converting labelIds ${JSON.stringify(labelIds)} to names: ${JSON.stringify(uniqueConverted)}`,
    );
    this.logger.debug(
      `[GmailProvider] Label mapping for userId ${userId}: ${Array.from(
        labelMap.entries(),
      )
        .slice(0, 20)
        .map(([id, name]) => `${id} -> ${name}`)
        .join(
          ", ",
        )}${labelMap.size > 20 ? ` ... (${labelMap.size} total)` : ""}`,
    );

    return uniqueConverted;
    // Skip unmapped custom labels
  }

  async isConnected(userId: string): Promise<boolean> {
    const user = await this.usersService.findOneWithTokens(userId);
    return !!user?.googleCalendarAccessToken;
  }

  /**
   * Verify thread statuses in Gmail API in batches with concurrency limits
   * Returns array of updates: { threadId, starCount, isArchived }[]
   */
  private async verifyThreadStatusesInGmail(
    userId: string,
    threadIds: string[],
    gmail: gmail_v1.Gmail,
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
            // Get thread from Gmail to check current status
            const threadData = await gmail.users.threads.get({
              userId: "me",
              id: threadId,
              format: "metadata",
              metadataHeaders: ["Subject", "From"],
            });

            const thread = threadData.data;
            if (!thread.messages || thread.messages.length === 0) {
              // Thread deleted in Gmail - mark as archived
              updates.push({
                threadId,
                starCount: 0,
                isArchived: true,
              });
              return;
            }

            // Get the latest message to determine current status
            const latestMessage = thread.messages[thread.messages.length - 1];
            const latestLabelIds = latestMessage.labelIds || [];

            const isArchived = !latestLabelIds.includes("INBOX");
            const isStarred = latestLabelIds.includes("STARRED");
            const starCount = isStarred ? 3 : 0;

            updates.push({
              threadId,
              starCount,
              isArchived,
            });
          } catch (threadError: unknown) {
            // Thread not found (404) or other error - mark as archived
            if (isApiError(threadError) && threadError.code === 404) {
              this.logger.debug(
                `Thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found in Gmail (may be deleted)`,
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
              logErrorToFile(
                `Error checking thread in verifyThreadStatusesInGmail (userId: ${userId}, threadId: ${threadId})`,
                threadError,
                "GmailProvider",
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
  async syncEmails(userId: string, syncWindowHours?: number): Promise<void> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.log(
        `User ${userId} not connected to Gmail, skipping email sync.`,
      );
      return;
    }

    // GRACE PERIOD: If user just logged in (within last 5 minutes), be lenient with errors
    // Check if tokens were just updated (user likely just logged in)
    const fiveMinutesAgo = new Date(
      Date.now() - MINUTES.FIVE * MILLISECONDS.MINUTE,
    );
    const now = new Date();
    // Ensure we're comparing UTC timestamps correctly
    const userUpdatedAt = user.updatedAt ? new Date(user.updatedAt) : null;
    const isRecentLogin =
      userUpdatedAt && userUpdatedAt.getTime() > fiveMinutesAgo.getTime();
    const minutesSinceUpdate = userUpdatedAt
      ? Math.round((now.getTime() - userUpdatedAt.getTime()) / 1000 / 60)
      : null;

    const debugInfo = [
      `[GmailProvider] User ${userId} sync check:`,
      `  - updatedAt: ${user?.updatedAt?.toISOString() || "null"}`,
      `  - minutesSinceUpdate: ${minutesSinceUpdate}`,
      `  - fiveMinutesAgo: ${fiveMinutesAgo.toISOString()}`,
      `  - isRecentLogin: ${isRecentLogin}`,
      `  - hasRefreshToken: ${!!user.googleCalendarRefreshToken}`,
      `  - hasAccessToken: ${!!user.googleCalendarAccessToken}`,
    ].join("\n");
    this.logger.debug(debugInfo);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeDebugLog } = require("../../auth/auth-logger");
    writeDebugLog(debugInfo);

    // Check if refresh token exists - if not, user needs to re-authenticate
    if (!user.googleCalendarRefreshToken) {
      // Log auth failure
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { authLogger } = require("../../auth/auth-logger");
      authLogger.logAuthFailure(
        userId,
        user?.email || null,
        "syncEmails-missingRefreshToken",
        new Error("Refresh token missing"),
        {
          hasAccessToken: !!user?.googleCalendarAccessToken,
          isRecentLogin,
          userUpdatedAt: user?.updatedAt?.toISOString() || null,
          minutesSinceUpdate,
        },
      );

      // Only set needsRelogin if NOT within grace period (recent logins might have token propagation delay)
      if (!isRecentLogin && !user.needsRelogin) {
        await this.usersService.update(userId, { needsRelogin: true });
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

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    // Handle token refresh events
    oauth2Client.on("tokens", async (tokens) => {
      this.logger.debug(`Tokens refreshed for user ${userId}`);
      if (tokens.access_token) {
        await this.usersService.update(userId, {
          googleCalendarAccessToken: tokens.access_token,
          ...(tokens.refresh_token && {
            googleCalendarRefreshToken: tokens.refresh_token,
          }),
        });
      }
    });

    // Try to proactively refresh the token to catch refresh token issues early
    try {
      await oauth2Client.getAccessToken();
      this.logger.debug(`Token validated for user ${userId}`);
    } catch (refreshError: unknown) {
      // GRACE PERIOD: If user just logged in, don't flag for re-login immediately
      // Re-fetch user to check updatedAt timestamp
      let currentUser = user;
      try {
        currentUser = await this.usersService.findOneWithTokens(userId);
      } catch (userError) {
        // If we can't fetch user, use the one we already have
        this.logger.error(
          `Could not re-fetch user ${userId} for grace period check:`,
          userError,
        );
      }

      const fiveMinutesAgo = new Date(
        Date.now() - MINUTES.FIVE * MILLISECONDS.MINUTE,
      );
      const isRecentLogin =
        currentUser?.updatedAt &&
        new Date(currentUser.updatedAt) > fiveMinutesAgo;

      // Log comprehensive auth failure details
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { authLogger } = require("../../auth/auth-logger");
      authLogger.logAuthFailure(
        userId,
        currentUser?.email || null,
        "syncEmails-tokenRefresh",
        refreshError,
        {
          hasRefreshToken: !!currentUser?.googleCalendarRefreshToken,
          hasAccessToken: !!currentUser?.googleCalendarAccessToken,
          refreshTokenLength:
            currentUser?.googleCalendarRefreshToken?.length || 0,
          isRecentLogin,
          userUpdatedAt: currentUser?.updatedAt?.toISOString() || null,
          gracePeriodActive: isRecentLogin,
        },
      );

      // Only flag for re-login if it's NOT a recent login (grace period)
      // Recent logins might have temporary token issues that resolve quickly
      if (!isRecentLogin) {
        await this.usersService.update(userId, { needsRelogin: true });
        throw new Error("Token refresh failed - please log in again");
      } else {
        // Recent login - log but don't fail yet (give it time to stabilize)
        this.logger.warn(
          `⚠️ Token refresh failed for recently logged-in user ${userId}, but within grace period. Will retry later.`,
        );
        throw new Error(
          "Token refresh failed (within grace period - will retry)",
        );
      }
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Get last sync time and calculate sync window
      // If syncWindowHours is provided, use that as a fixed window (for extended syncs)
      // Otherwise, use lastSyncAt - 4 hours for overlap (for regular syncs)
      const lastSyncAt = user.lastEmailSyncAt;
      // Detect initial sync (new user) - skip batching so their triage isn't blank
      const isInitialSync = !lastSyncAt;
      const fourHoursInMs = 4 * 60 * 60 * 1000;
      const sevenDaysAgo = new Date(Date.now() - DAYS.WEEK * MILLISECONDS.DAY);

      // Calculate sync window based on syncWindowHours parameter or lastSyncAt
      let syncWindowStart: Date;
      if (syncWindowHours !== undefined) {
        // Use fixed sync window (e.g., 48 hours for extended sync)
        syncWindowStart = new Date(
          Date.now() - syncWindowHours * 60 * 60 * 1000,
        );
      } else if (lastSyncAt) {
        // Regular sync: use lastSyncAt - 4 hours for overlap
        syncWindowStart = new Date(lastSyncAt.getTime() - fourHoursInMs);
      } else {
        // First sync: default to 7 days ago
        syncWindowStart = sevenDaysAgo;
      }

      // Convert to Unix timestamp in seconds for Gmail API
      const syncWindowTimestamp = Math.floor(syncWindowStart.getTime() / 1000);

      this.logger.log(
        `[GmailProvider] Syncing emails for user ${userId}. Last sync: ${lastSyncAt?.toISOString() || "never"}, sync window starts: ${syncWindowStart.toISOString()}`,
      );

      // Use thread-level queries like GmailApp.search() - more reliable than message-level queries
      // Fetch threads (not messages) from inbox and starred threads
      const baseQuery = "-label:SnoozedBearlyMail -label:VA-to-action";
      const afterQuery = `after:${syncWindowTimestamp}`;

      const [
        inboxThreadsResponse,
        starredThreadsResponse,
        sentThreadsResponse,
      ] = await Promise.all([
        // Fetch unread threads from inbox updated since last sync
        gmail.users.threads.list({
          userId: "me",
          maxResults: 500,
          q: `is:unread in:inbox ${baseQuery} ${afterQuery}`,
        }),
        // Fetch ALL starred threads in inbox (no time filter to ensure old starred emails are synced)
        gmail.users.threads.list({
          userId: "me",
          maxResults: 500,
          q: `is:starred in:inbox ${baseQuery}`,
        }),
        // Fetch threads where user has sent emails recently (to capture replies)
        // This ensures sent replies are synced back to the thread
        gmail.users.threads.list({
          userId: "me",
          maxResults: 100,
          q: `in:sent ${baseQuery} ${afterQuery}`,
        }),
      ]);

      const inboxThreads = inboxThreadsResponse.data.threads || [];
      const starredThreads = starredThreadsResponse.data.threads || [];
      const sentThreads = sentThreadsResponse.data.threads || [];

      // Combine and deduplicate thread IDs
      const allThreadIds = new Set([
        ...inboxThreads.map((t) => t.id!),
        ...starredThreads.map((t) => t.id!),
        ...sentThreads.map((t) => t.id!),
      ]);

      this.logger.debug(
        `Found ${inboxThreads.length} inbox threads, ${starredThreads.length} starred threads, and ${sentThreads.length} sent threads (${allThreadIds.size} unique) updated since ${syncWindowStart.toISOString()}`,
      );

      // Get existing threads from DB to check their current status
      // We'll compare with Gmail status to detect changes (star, archive)
      const existingThreads = await this.emailsService.getThreadsByThreadIds(
        userId,
        Array.from(allThreadIds),
      );
      const existingThreadMap = new Map(
        existingThreads.map((t) => [t.threadId, t]),
      );

      // Process ALL threads returned by Gmail (they're already filtered by "after:")
      // We need to check each thread's status in Gmail to detect changes
      // A thread needs full processing if:
      // 1. It doesn't exist in DB, OR
      // 2. Status changed (star, archive), OR
      // 3. Has new messages
      // Otherwise, just check read status (lightweight)
      const threadsToProcess: string[] = Array.from(allThreadIds);

      this.logger.debug(
        `Processing ${threadsToProcess.length} threads to check status and detect changes`,
      );

      // Process threads in batches of 5 for better performance
      const BATCH_SIZE = 5;
      const threadBatches: string[][] = [];
      for (let i = 0; i < threadsToProcess.length; i += BATCH_SIZE) {
        threadBatches.push(threadsToProcess.slice(i, i + BATCH_SIZE));
      }

      // Process each thread to get messages and determine archived/starred status
      // Collect thread updates for bulk processing
      const threadStarCountUpdates: { threadId: string; starCount: number }[] =
        [];
      const threadArchivedUpdates: {
        threadId: string;
        isArchived: boolean;
      }[] = [];

      // Process batches sequentially, but threads within batch in parallel
      // Add limits to prevent jobs from running too long (max 100 threads per sync)
      const MAX_THREADS_TO_PROCESS = 100;
      const threadsToProcessLimited = threadsToProcess.slice(
        0,
        MAX_THREADS_TO_PROCESS,
      );

      if (threadsToProcess.length > MAX_THREADS_TO_PROCESS) {
        this.logger.warn(
          `Limiting thread processing to ${MAX_THREADS_TO_PROCESS} threads (out of ${threadsToProcess.length} total) to prevent job timeout`,
        );
      }

      const limitedBatches: string[][] = [];
      for (let i = 0; i < threadsToProcessLimited.length; i += BATCH_SIZE) {
        limitedBatches.push(threadsToProcessLimited.slice(i, i + BATCH_SIZE));
      }

      for (const batch of limitedBatches) {
        await Promise.all(
          batch
            .filter((threadId) => threadId) // Filter out null/undefined
            .map(async (threadId) => {
              try {
                // Get the thread with all messages to check archived/starred status accurately
                const threadData = await gmail.users.threads.get({
                  userId: "me",
                  id: threadId,
                  format: "full",
                });

                const thread = threadData.data;
                if (!thread.messages || thread.messages.length === 0) return;

                // Get the latest message (first in array) to determine current status
                const latestMessage =
                  thread.messages[thread.messages.length - 1];
                const latestLabelIds = latestMessage.labelIds || [];

                // A thread is archived if ALL messages lack the INBOX label
                // More accurately: if the latest message doesn't have INBOX, the thread is archived
                const isArchived = !latestLabelIds.includes("INBOX");
                const isStarred = latestLabelIds.includes("STARRED");
                const starCount = isStarred ? 3 : 0;

                // Check if status changed compared to DB (for existing threads)
                const existingThread = existingThreadMap.get(threadId);
                const statusChanged =
                  existingThread &&
                  (existingThread.starCount !== starCount ||
                    existingThread.isArchived !== isArchived);

                // Collect thread updates (only once per thread, not per message)
                // Only update if status changed or thread is new
                if (!existingThread || statusChanged) {
                  threadStarCountUpdates.push({ threadId, starCount });
                  threadArchivedUpdates.push({ threadId, isArchived });
                }

                // Process all messages in the thread
                for (const message of thread.messages) {
                  if (!message.id) continue;

                  // Verify we're using this specific message's labelIds, not thread-level
                  const messageLabelIds = message.labelIds || [];
                  this.logger.debug(
                    `[GmailProvider] Processing message ${message.id} in thread ${threadId} with labelIds: ${JSON.stringify(messageLabelIds)}`,
                  );

                  const rawEmail = this.parseGmailMessage(message);
                  if (!rawEmail) continue;

                  // Verify parseGmailMessage extracted the correct labelIds
                  if (
                    JSON.stringify(rawEmail.labelIds) !==
                    JSON.stringify(messageLabelIds)
                  ) {
                    this.logger.warn(
                      `[GmailProvider] Mismatch: message.labelIds=${JSON.stringify(messageLabelIds)} vs rawEmail.labelIds=${JSON.stringify(rawEmail.labelIds)}`,
                    );
                  }

                  const existing = await this.emailsService.getEmailByMessageId(
                    userId,
                    message.id,
                  );

                  if (existing) {
                    // Sync read status from Gmail (use labelIds from this specific message)
                    const isReadInGmail = !messageLabelIds.includes("UNREAD");
                    const updates: Partial<{
                      isRead: boolean;
                      attachments: typeof rawEmail.attachments;
                    }> = {};

                    if (existing.isRead !== isReadInGmail) {
                      updates.isRead = isReadInGmail;
                    }

                    // Backfill attachments for existing emails that don't have them
                    if (
                      !existing.attachments &&
                      rawEmail.attachments &&
                      rawEmail.attachments.length > 0
                    ) {
                      updates.attachments = rawEmail.attachments;
                      this.logger.debug(
                        `[GmailProvider] Backfilling ${rawEmail.attachments.length} attachments for email ${existing.id}`,
                      );
                    }

                    if (Object.keys(updates).length > 0) {
                      await this.emailsService.updateEmail(
                        existing.id,
                        updates,
                      );
                    }
                    continue;
                  }

                  // Create new email - use thread-level archived/starred status
                  const labelIds = rawEmail.labelIds || [];
                  this.logger.debug(
                    `[GmailProvider] Saving email ${rawEmail.messageId} (message ${message.id}) with raw labelIds from Gmail: ${JSON.stringify(labelIds)}`,
                  );
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
                      // Use thread-level star count
                      starCount,
                      receivedAt: rawEmail.receivedAt,
                      labels: labelIds,
                      attachments: rawEmail.attachments,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } as any,
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
                  logErrorToFile(
                    `Error processing thread in syncEmails (userId: ${userId}, threadId: ${threadId})`,
                    threadError,
                    "GmailProvider",
                  );
                }
              }
            }),
        );
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

      // Also check existing threads in action/follow-up tabs (starred threads) against Gmail
      // This ensures we catch threads that were archived or unstarred in Gmail
      const existingStarredThreads =
        await this.emailsService.getExistingStarredThreads(userId);

      this.logger.debug(
        `Checking ${existingStarredThreads.length} existing starred threads against Gmail`,
      );

      const existingThreadUpdates: {
        threadId: string;
        starCount: number;
        isArchived: boolean;
      }[] = [];

      // Check each existing starred thread against Gmail
      for (const dbThread of existingStarredThreads) {
        // Skip if we already processed this thread in the main sync
        if (allThreadIds.has(dbThread.threadId)) {
          continue;
        }

        try {
          // Get thread from Gmail to check current status
          const threadData = await gmail.users.threads.get({
            userId: "me",
            id: dbThread.threadId,
            format: "metadata",
            metadataHeaders: ["Subject", "From"],
          });

          const thread = threadData.data;
          if (!thread.messages || thread.messages.length === 0) {
            // Thread deleted in Gmail - mark as archived
            existingThreadUpdates.push({
              threadId: dbThread.threadId,
              starCount: 0,
              isArchived: true,
            });
            continue;
          }

          // Get the latest message to determine current status
          const latestMessage = thread.messages[thread.messages.length - 1];
          const latestLabelIds = latestMessage.labelIds || [];

          const isArchived = !latestLabelIds.includes("INBOX");
          const isStarred = latestLabelIds.includes("STARRED");
          const starCount = isStarred ? 3 : 0;

          // Always update to refresh lastCheckedAt, even if status didn't change
          // This ensures we track when threads were last verified against Gmail
          existingThreadUpdates.push({
            threadId: dbThread.threadId,
            starCount,
            isArchived,
          });
        } catch (threadError: unknown) {
          // Thread not found (404) or other error - mark as archived
          if (isApiError(threadError) && threadError.code === 404) {
            this.logger.debug(
              `Existing thread ${dbThread.threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}... not found in Gmail (may be deleted)`,
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
            logErrorToFile(
              `Error checking existing starred thread (userId: ${userId}, threadId: ${dbThread.threadId})`,
              threadError,
              "GmailProvider",
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
      // This ensures we catch threads that were archived in Gmail but are still marked as non-archived in DB
      // We check a limited number per user per run (50) and prioritize threads that haven't been checked recently
      // This spreads the work across multiple sync cycles to handle 1000+ users efficiently
      const threadsNeedingCheck =
        await this.emailsService.getNonArchivedThreadsNeedingCheck(
          userId,
          50, // Limit to 50 threads per user per 5-minute sync cycle
        );
      const threadsToCheck = threadsNeedingCheck.filter(
        (threadId) => !allThreadIds.has(threadId), // Skip already processed threads
      );

      if (threadsToCheck.length > 0) {
        this.logger.debug(
          `Checking ${threadsToCheck.length} non-archived threads against Gmail`,
        );

        const nonArchivedUpdates = await this.verifyThreadStatusesInGmail(
          userId,
          threadsToCheck,
          gmail,
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

      // Update lastEmailSyncAt after successful sync
      await this.usersService.update(userId, {
        lastEmailSyncAt: new Date(),
      });
      this.logger.debug(`Updated lastEmailSyncAt for user ${userId}`);
    } catch (error: unknown) {
      // Check for authentication errors - these indicate the refresh token is invalid/expired
      const apiError = isApiError(error) ? error : null;
      const errorMsg = isError(error) ? error.message : apiError?.message || "";
      const isAuthError =
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401) ||
        apiError?.code === "invalid_grant" ||
        (apiError?.response?.data as any)?.error === "invalid_grant" ||
        (errorMsg &&
          (errorMsg.includes("invalid_grant") ||
            errorMsg.includes("Refresh token missing") ||
            errorMsg.includes("Token refresh failed")));

      logErrorToFile(
        `Error in syncEmails (userId: ${userId})`,
        error,
        "GmailProvider",
      );

      if (isAuthError) {
        // Log comprehensive auth failure details
        // Re-fetch user to check grace period
        let currentUser = user;
        try {
          currentUser = await this.usersService.findOneWithTokens(userId);
        } catch (userError) {
          this.logger.error(
            `Could not re-fetch user ${userId} for auth logging:`,
            userError,
          );
        }

        // GRACE PERIOD: Don't flag for re-login if user just logged in (within 5 minutes)
        const fiveMinutesAgo = new Date(
          Date.now() - MINUTES.FIVE * MILLISECONDS.MINUTE,
        );
        const isRecentLogin =
          currentUser?.updatedAt &&
          new Date(currentUser.updatedAt) > fiveMinutesAgo;

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { authLogger } = require("../../auth/auth-logger");
        authLogger.logAuthFailure(
          userId,
          currentUser?.email || null,
          "syncEmails-gmailApi",
          error,
          {
            hasRefreshToken: !!currentUser?.googleCalendarRefreshToken,
            hasAccessToken: !!currentUser?.googleCalendarAccessToken,
            gmailApiEndpoint: "users.messages.list",
            isRecentLogin,
            userUpdatedAt: currentUser?.updatedAt?.toISOString() || null,
            gracePeriodActive: isRecentLogin,
          },
        );

        // Only flag for re-login if NOT within grace period
        if (!isRecentLogin) {
          await this.usersService.update(userId, { needsRelogin: true });
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
   * Check threads in our DB to see if they've been archived or starred in Gmail
   * This ensures archived and starred status stays in sync
   *
   * Uses Gmail SEARCH queries (like GmailApp.search) rather than checking labelIds,
   * which is more reliable for determining inbox/archived/starred status.
   */
  private async syncThreadArchivedStatus(
    userId: string,
    gmail: gmail_v1.Gmail,
  ): Promise<void> {
    try {
      const startTime = Date.now();

      // Use Gmail search to get the SOURCE OF TRUTH for inbox and starred threads
      // This is the same approach as GmailApp.search() in Apps Script
      const [inboxResponse, starredResponse] = await Promise.all([
        // Get all threads currently in inbox
        gmail.users.threads.list({
          userId: "me",
          maxResults: 500,
          q: "in:inbox -label:SnoozedBearlyMail -label:VA-to-action",
        }),
        // Get all starred threads
        gmail.users.threads.list({
          userId: "me",
          maxResults: 500,
          q: "is:starred -label:SnoozedBearlyMail -label:VA-to-action",
        }),
      ]);

      const inboxThreadIds = new Set(
        (inboxResponse.data.threads || [])
          .map((t: { id?: string | null }) => t.id)
          .filter((id): id is string => !!id),
      );
      const starredThreadIds = new Set(
        (starredResponse.data.threads || [])
          .map((t: { id?: string | null }) => t.id)
          .filter((id): id is string => !!id),
      );

      this.logger.log(
        `📦 Gmail sync: ${inboxThreadIds.size} threads in inbox, ${starredThreadIds.size} starred threads`,
      );

      // Get our DB threads to compare
      const dbThreads = await this.emailsService.getAllThreadsForSync(userId);

      if (dbThreads.length === 0) {
        return;
      }

      const updates: {
        threadId: string;
        isArchived: boolean;
        starCount: number;
      }[] = [];

      for (const dbThread of dbThreads) {
        const isInInbox = inboxThreadIds.has(dbThread.threadId);
        const isStarred = starredThreadIds.has(dbThread.threadId);

        // A thread is archived if it's NOT in the inbox search results
        const shouldBeArchived = !isInInbox;
        const newStarCount = isStarred ? 3 : 0;

        // Only update if there's a change
        if (
          dbThread.isArchived !== shouldBeArchived ||
          dbThread.starCount !== newStarCount
        ) {
          updates.push({
            threadId: dbThread.threadId,
            isArchived: shouldBeArchived,
            starCount: newStarCount,
          });
        }
      }

      // Batch update database
      if (updates.length > 0) {
        await this.emailsService.batchUpdateThreadStatus(userId, updates, []);

        const archivedCount = updates.filter(
          (update) => update.isArchived,
        ).length;
        const unarchivedCount = updates.filter(
          (update) => !update.isArchived,
        ).length;
        const starredCount = updates.filter(
          (update) => update.starCount > 0,
        ).length;
        const duration = Date.now() - startTime;

        this.logger.log(
          `📦 Thread sync complete in ${duration}ms: ${updates.length} changes (${archivedCount} archived, ${unarchivedCount} unarchived, ${starredCount} starred)`,
        );
      } else {
        this.logger.debug(
          `📦 Thread sync: no changes needed (${Date.now() - startTime}ms)`,
        );
      }
    } catch (error) {
      this.logger.error(
        "❌ Error syncing thread archived/starred status:",
        error,
      );
      // Don't throw - this is a background sync, don't fail the main sync
    }
  }

  // eslint-disable-next-line max-lines-per-function, max-statements
  async scanHistory(userId: string): Promise<void> {
    this.logger.log(`Starting historical email scan for user ${userId}`);
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.log(
        `User ${userId} not connected to Gmail, skipping historical scan.`,
      );
      return;
    }

    // Check if refresh token exists
    if (!user.googleCalendarRefreshToken) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { authLogger } = require("../../auth/auth-logger");
      authLogger.logAuthFailure(
        userId,
        user?.email || null,
        "scanHistory-missingRefreshToken",
        new Error("Refresh token missing"),
        {
          hasAccessToken: !!user?.googleCalendarAccessToken,
        },
      );
      await this.usersService.update(userId, { needsRelogin: true });
      throw new Error("Refresh token missing - please log in again");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    // Proactively refresh token
    try {
      await oauth2Client.getAccessToken();
      this.logger.debug(
        `Token validated for user ${userId} for historical scan.`,
      );
    } catch (refreshError: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { authLogger } = require("../../auth/auth-logger");
      authLogger.logAuthFailure(
        userId,
        user?.email || null,
        "scanHistory-tokenRefresh",
        refreshError,
        {
          hasRefreshToken: !!user?.googleCalendarRefreshToken,
          hasAccessToken: !!user?.googleCalendarAccessToken,
        },
      );
      await this.usersService.update(userId, { needsRelogin: true });
      throw new Error(
        "Token refresh failed during historical scan - please log in again",
      );
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DAYS.WEEK);

      const query = `after:${Math.floor(sevenDaysAgo.getTime() / 1000)} (label:INBOX OR label:SENT)`;

      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 300,
        q: query,
      });

      const messages = response.data.messages || [];
      this.logger.log(
        `Found ${messages.length} historical messages for user ${userId}. Queuing individual jobs for parallel processing.`,
      );

      await this.usersService.update(userId, {
        scanTotal: messages.length,
        scanProgress: 0,
      });

      // Reset progress counter when starting a new scan
      this.progressUpdateCounters.delete(userId);

      // Queue individual jobs for each message - send in parallel batches for faster queuing
      const messageIds = messages.filter((msg) => msg.id).map((msg) => msg.id!);

      // Send jobs in batches of 50 to avoid overwhelming the queue system
      const BATCH_SIZE = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE;
      for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
        const batch = messageIds.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map((messageId) =>
            this.boss.send(
              "scan-history-email",
              { userId, messageId },
              {
                priority: getJobPriority("scan-history-email", false),
              },
            ),
          ),
        );
      }

      this.logger.log(
        `Queued ${messageIds.length} email scan jobs for parallel processing (out of ${messages.length} messages)`,
      );
    } catch (error: unknown) {
      // Check for authentication errors
      const apiError = isApiError(error) ? error : null;
      const errorMsg = isError(error) ? error.message : apiError?.message || "";
      const isAuthError =
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401) ||
        apiError?.code === "invalid_grant" ||
        (apiError?.response?.data as any)?.error === "invalid_grant" ||
        (errorMsg && errorMsg.includes("invalid_grant"));

      logErrorToFile(
        `Error in scanHistory (userId: ${userId})`,
        error,
        "GmailProvider",
      );

      if (isAuthError) {
        // Try to get user, but don't fail if we can't
        let userForLogging = null;
        let userEmail = null;
        try {
          userForLogging = await this.usersService.findOneWithTokens(userId);
          userEmail = userForLogging?.email || null;
        } catch (userError) {
          this.logger.error(
            `Could not fetch user ${userId} for auth logging:`,
            userError,
          );
        }

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { authLogger } = require("../../auth/auth-logger");
        authLogger.logAuthFailure(
          userId,
          userEmail,
          "scanHistory-gmailApi",
          error,
          {
            hasRefreshToken: !!userForLogging?.googleCalendarRefreshToken,
            hasAccessToken: !!userForLogging?.googleCalendarAccessToken,
            gmailApiEndpoint: "users.messages.list (scanHistory)",
          },
        );
        await this.usersService.update(userId, { needsRelogin: true });
      }

      await this.usersService.update(userId, { scanProgress: 0, scanTotal: 0 });
      throw error;
    }
  }

  // eslint-disable-next-line max-lines-per-function, max-statements
  async processScanEmail(userId: string, messageId: string): Promise<void> {
    const startTime = Date.now();
    this.logger.debug(
      `[processScanEmail] Starting to process email ${messageId} for user ${userId}`,
    );
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
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

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      const fullMsg = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      const rawEmail = this.parseGmailMessage(fullMsg.data);
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

      // Save to temporary scan table instead of main emails table
      const labelIds = fullMsg.data.labelIds || [];
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
        isRead: rawEmail.isRead || !labelIds.includes("UNREAD"),
        // Check if archived
        isArchived: !labelIds.includes("INBOX"),
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
      logErrorToFile(
        `Error processing message in scanHistory (userId: ${userId}, messageId: ${messageId})`,
        error,
        "GmailProvider",
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
      const errorMsg = isError(error) ? error.message : apiError?.message || "";
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401) ||
        (errorMsg && errorMsg.includes("invalid_grant"))
      ) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
    }
    // eslint-disable-next-line max-lines
  }

  async sendReply(
    userId: string,
    threadId: string,
    to: string,
    subject: string,
    body: string,
    attachments?: EmailAttachmentData[],
  ): Promise<{ messageId: string; threadId: string }> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("Gmail account not connected. Cannot send email.");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const emailContent = this.buildEmailContent({
      to: [{ email: to }],
      subject,
      body,
      attachments,
      headers: {
        "In-Reply-To": `<${threadId}@mail.gmail.com>`,
        References: `<${threadId}@mail.gmail.com>`,
      },
    });

    const encodedEmail = Buffer.from(emailContent)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    try {
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedEmail,
          threadId,
        },
      });
      this.logger.log(`Reply sent successfully for user ${userId} to ${to}`);
      return {
        messageId: response.data.id || "",
        threadId: response.data.threadId || threadId,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send reply for user ${userId} to ${to}:`,
        error,
      );
      const apiError = isApiError(error) ? error : null;
      const errorMsg = isError(error) ? error.message : apiError?.message || "";
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401) ||
        (errorMsg && errorMsg.includes("invalid_grant"))
      ) {
        await this.usersService.update(userId, { needsRelogin: true });
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
    attachments?: EmailAttachmentData[],
  ): Promise<{ messageId: string; threadId: string }> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("Gmail account not connected. Cannot send email.");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    // Handle token refresh
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await this.usersService.update(userId, {
          googleCalendarAccessToken: tokens.access_token,
          ...(tokens.refresh_token && {
            googleCalendarRefreshToken: tokens.refresh_token,
          }),
        });
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Format recipients
    const formatRecipient = (r: EmailRecipient) =>
      r.name ? `${r.name} <${r.email}>` : r.email;

    const toHeader = to.map(formatRecipient).join(", ");

    const emailContent = this.buildEmailContent({
      to,
      subject,
      body,
      cc,
      bcc,
      attachments,
    });

    const encodedEmail = Buffer.from(emailContent)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    try {
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedEmail,
        },
      });

      const messageId = response.data.id || "";
      const threadId = response.data.threadId || "";

      this.logger.log(
        `Email sent successfully for user ${userId} to ${toHeader}, messageId: ${messageId}`,
      );

      return { messageId, threadId };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to send email for user ${userId} to ${toHeader}:`,
        error,
      );
      const apiError = isApiError(error) ? error : null;
      const errorMsg = isError(error) ? error.message : apiError?.message || "";
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401) ||
        (errorMsg && errorMsg.includes("invalid_grant"))
      ) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
      throw new Error(`Failed to send email: ${errorMsg || "Unknown error"}`);
    }
  }

  /**
   * Build email content with support for attachments using multipart MIME
   */
  private buildEmailContent(options: {
    to: EmailRecipient[];
    subject: string;
    body: string;
    cc?: EmailRecipient[];
    bcc?: EmailRecipient[];
    attachments?: EmailAttachmentData[];
    headers?: Record<string, string>;
  }): string {
    const formatRecipient = (r: EmailRecipient) =>
      r.name ? `${r.name} <${r.email}>` : r.email;

    const toHeader = options.to.map(formatRecipient).join(", ");
    const ccHeader =
      options.cc && options.cc.length > 0
        ? options.cc.map(formatRecipient).join(", ")
        : null;
    const bccHeader =
      options.bcc && options.bcc.length > 0
        ? options.bcc.map(formatRecipient).join(", ")
        : null;

    const hasAttachments =
      options.attachments && options.attachments.length > 0;

    // Build email headers
    const headers: string[] = [
      `To: ${toHeader}`,
      `Subject: ${options.subject}`,
      "MIME-Version: 1.0",
    ];

    if (ccHeader) {
      headers.push(`Cc: ${ccHeader}`);
    }
    if (bccHeader) {
      headers.push(`Bcc: ${bccHeader}`);
    }

    // Add custom headers if provided
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        headers.push(`${key}: ${value}`);
      }
    }

    let bodyContent: string;

    if (hasAttachments) {
      // Use multipart/mixed when attachments are present
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

      // Build multipart body
      const parts: string[] = [];

      // Text body part
      parts.push(`--${boundary}`);
      parts.push("Content-Type: text/plain; charset=UTF-8");
      parts.push("Content-Transfer-Encoding: 7bit");
      parts.push("");
      parts.push(options.body);

      // Attachment parts
      for (const attachment of options.attachments!) {
        parts.push(`--${boundary}`);
        parts.push(
          `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
        );
        parts.push("Content-Transfer-Encoding: base64");
        parts.push(
          `Content-Disposition: attachment; filename="${attachment.filename}"`,
        );
        parts.push("");
        // Encode attachment content as base64, split into 76-character lines
        const base64Content = attachment.content.toString("base64");
        const chunkedContent =
          base64Content.match(/.{1,76}/g)?.join("\r\n") || base64Content;
        parts.push(chunkedContent);
      }

      parts.push(`--${boundary}--`);
      bodyContent = parts.join("\r\n");
    } else {
      // Simple text email
      headers.push("Content-Type: text/plain; charset=UTF-8");
      bodyContent = options.body;
    }

    return [...headers, "", bodyContent].join("\r\n");
  }

  private parseGmailMessage(
    messageData: gmail_v1.Schema$Message,
  ): RawEmailMessage | null {
    if (!messageData.id || !messageData.threadId) return null;

    const headers = messageData.payload?.headers || [];
    const subject =
      headers.find(
        (h: { name?: string; value?: string }) => h.name === "Subject",
      )?.value || "(No Subject)";
    const from =
      headers.find((h: { name?: string; value?: string }) => h.name === "From")
        ?.value || "";
    const labelIds = messageData.labelIds || [];
    // Convert Gmail STARRED label to starCount
    // STARRED = 3 stars (high importance)
    const starCount = labelIds.includes("STARRED") ? 3 : 0;

    const fromMatch = from.match(/(.*)<(.+)>/);
    const fromName = fromMatch ? fromMatch[1].trim() : undefined;
    const fromEmail = fromMatch ? fromMatch[2].trim() : from;

    const { body, htmlBody } = this.extractBodyFromPayload(
      messageData.payload,
      messageData.snippet,
    );

    const attachments = this.extractAttachmentsFromPayload(messageData.payload);

    return {
      messageId: messageData.id,
      threadId: messageData.threadId,
      subject,
      from: fromEmail,
      fromName,
      body,
      htmlBody,
      starCount,
      receivedAt: new Date(
        parseInt(messageData.internalDate || Date.now().toString()),
      ),
      isRead: !labelIds.includes("UNREAD"),
      labelIds,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  }

  private extractBodyFromPayload(
    payload: gmail_v1.Schema$MessagePart | undefined,
    snippet?: string | null,
  ): {
    body: string;
    htmlBody?: string;
  } {
    let body = "";
    let htmlBody: string | undefined;

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          // Decode base64 to utf-8
          body = Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        if (part.mimeType === "text/html" && part.body?.data) {
          // Decode base64 to utf-8
          htmlBody = Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        if (part.parts) {
          const nested = this.extractBodyFromPayload(part, snippet);
          const { body: nestedBody, htmlBody: nestedHtmlBody } = nested;
          if (!body) body = nestedBody;
          if (!htmlBody) htmlBody = nestedHtmlBody;
        }
      }
    } else if (payload.body?.data) {
      if (payload.mimeType === "text/plain") {
        body = Buffer.from(payload.body.data, "base64").toString("utf-8");
      }
      if (payload.mimeType === "text/html") {
        htmlBody = Buffer.from(payload.body.data, "base64").toString("utf-8");
      }
    }

    // Ensure body is never empty (required by DB constraint)
    // Fallback to snippet, HTML body (stripped), or placeholder
    if (!body || body.trim() === "") {
      if (htmlBody) {
        // Strip HTML tags as fallback
        body = htmlBody.replace(/<[^>]*>/g, "").trim();
      }
      if (!body || body.trim() === "") {
        body = snippet || "(No content)";
      }
    }

    return { body, htmlBody };
  }

  private extractAttachmentsFromPayload(
    payload: gmail_v1.Schema$MessagePart | undefined,
  ): Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    const attachments: Array<{
      attachmentId: string;
      filename: string;
      mimeType: string;
      size: number;
    }> = [];

    if (!payload) return attachments;

    const extractFromPart = (part: gmail_v1.Schema$MessagePart): void => {
      // Check if this part is an attachment
      // Attachments have a filename and attachmentId
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || "application/octet-stream",
          size: part.body.size || 0,
        });
      }

      // Recursively check nested parts
      if (part.parts) {
        for (const nestedPart of part.parts) {
          extractFromPart(nestedPart);
        }
      }
    };

    // Start extraction from root payload
    if (payload.parts) {
      for (const part of payload.parts) {
        extractFromPart(part);
      }
    } else {
      // Single part message
      extractFromPart(payload);
    }

    return attachments;
  }

  async searchEmails(
    userId: string,
    query: string,
    maxResults: number = QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE,
  ): Promise<RawEmailMessage[]> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.log(
        `User ${userId} not connected to Gmail, cannot search emails.`,
      );
      return [];
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await this.usersService.update(userId, {
          googleCalendarAccessToken: tokens.access_token,
          ...(tokens.refresh_token && {
            googleCalendarRefreshToken: tokens.refresh_token,
          }),
        });
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Use Gmail API search
      const response = await gmail.users.messages.list({
        userId: "me",
        q: query,
        // Gmail API limit is 100
        maxResults: Math.min(maxResults, 100),
      });

      const messages = response.data.messages || [];
      if (messages.length === 0) {
        return [];
      }

      const rawEmails: RawEmailMessage[] = [];

      // Fetch full message details in parallel batches for better performance
      // Process 5 at a time to avoid rate limits
      const batchSize = 5;
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        const batchPromises = batch.map(async (msg) => {
          if (!msg.id) return null;

          try {
            const fullMsg = await gmail.users.messages.get({
              userId: "me",
              id: msg.id,
              format: "full",
            });

            const rawEmail = this.parseGmailMessage(fullMsg.data);
            return rawEmail;
          } catch (error) {
            this.logger.error(
              `Error fetching message ${msg.id} during search:`,
              error,
            );
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        for (const rawEmail of batchResults) {
          if (rawEmail) {
            rawEmails.push(rawEmail);
          }
        }

        // Stop if we have enough results
        if (rawEmails.length >= maxResults) {
          break;
        }
      }

      return rawEmails.slice(0, maxResults);
    } catch (error: unknown) {
      this.logger.error(`Error searching emails for user ${userId}:`, error);
      const apiError = isApiError(error) ? error : null;
      const errorMsg = isError(error) ? error.message : apiError?.message || "";
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401) ||
        (errorMsg && errorMsg.includes("invalid_grant"))
      ) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
      throw error;
    }
  }

  async getAttachment(
    userId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<{
    data: Buffer;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("Gmail account not connected. Cannot fetch attachment.");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    // Handle token refresh
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await this.usersService.update(userId, {
          googleCalendarAccessToken: tokens.access_token,
          ...(tokens.refresh_token && {
            googleCalendarRefreshToken: tokens.refresh_token,
          }),
        });
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // First, get the message to find attachment metadata
      const message = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });

      // Find the attachment in the message parts
      let attachmentPart: gmail_v1.Schema$MessagePart | undefined;
      const findAttachment = (part: gmail_v1.Schema$MessagePart): void => {
        if (part.body?.attachmentId === attachmentId) {
          attachmentPart = part;
          return;
        }
        if (part.parts) {
          for (const nestedPart of part.parts) {
            findAttachment(nestedPart);
          }
        }
      };

      if (message.data.payload) {
        findAttachment(message.data.payload);
      }

      if (!attachmentPart) {
        throw new Error(
          `Attachment ${attachmentId} not found in message ${messageId}`,
        );
      }

      // Get the attachment data
      const attachmentResponse = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: attachmentId,
      });

      if (!attachmentResponse.data.data) {
        throw new Error(`No data returned for attachment ${attachmentId}`);
      }

      // Decode base64 attachment data
      const attachmentData = Buffer.from(
        attachmentResponse.data.data,
        "base64",
      );

      return {
        data: attachmentData,
        filename: attachmentPart.filename || "attachment",
        mimeType: attachmentPart.mimeType || "application/octet-stream",
        size: attachmentPart.body?.size || attachmentData.length,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to get attachment ${attachmentId} from message ${messageId} for user ${userId}:`,
        error,
      );
      const apiError = isApiError(error) ? error : null;
      const errorMsg = isError(error) ? error.message : apiError?.message || "";
      if (
        apiError?.code === 401 ||
        (apiError?.response && (apiError.response as any).status === 401) ||
        (errorMsg && errorMsg.includes("invalid_grant"))
      ) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
      throw new Error(
        `Failed to get attachment: ${errorMsg || "Unknown error"}`,
      );
    }
  }

  async archiveThread(userId: string, threadId: string): Promise<void> {
    this.logger.log(
      `[Gmail Archive] Starting archiveThread: userId=${userId}, threadId=${threadId}`,
    );
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.error(
        `[Gmail Archive] User not connected to Gmail: userId=${userId}`,
      );
      throw new Error("User not connected to Gmail");
    }

    this.logger.log(
      `[Gmail Archive] User found, creating OAuth2 client: userId=${userId}`,
    );
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Get the thread to check if it's starred and get all messages
      this.logger.log(
        `[Gmail Archive] Fetching thread data: userId=${userId}, threadId=${threadId}`,
      );
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });

      const thread = threadData.data;
      const messages = thread.messages || [];
      this.logger.log(
        `[Gmail Archive] Thread fetched: userId=${userId}, threadId=${threadId}, messageCount=${messages.length}`,
      );

      // If any message is starred, remove STARRED label from each message individually
      // (Gmail requires removing stars from individual messages, not threads)
      const hasStarred = messages.some((msg) =>
        msg.labelIds?.includes("STARRED"),
      );
      this.logger.log(
        `[Gmail Archive] Thread has starred messages: userId=${userId}, threadId=${threadId}, hasStarred=${hasStarred}`,
      );

      if (hasStarred) {
        let removedStarCount = 0;
        for (const message of messages) {
          if (!message.id) continue;

          // Only remove STARRED if this message has it
          if (message.labelIds?.includes("STARRED")) {
            this.logger.log(
              `[Gmail Archive] Removing STAR from message: userId=${userId}, threadId=${threadId}, messageId=${message.id}`,
            );
            await gmail.users.messages.modify({
              userId: "me",
              id: message.id,
              requestBody: {
                removeLabelIds: ["STARRED"],
              },
            });
            removedStarCount++;
          }
        }
        this.logger.log(
          `[Gmail Archive] Removed STAR from ${removedStarCount} messages: userId=${userId}, threadId=${threadId}`,
        );
      }

      // Remove from inbox and mark as read (this archives the thread in Gmail)
      // Note: Gmail doesn't allow adding custom labels via addLabelIds in threads.modify
      // Removing INBOX label archives the thread, removing UNREAD label marks it as read
      this.logger.log(
        `[Gmail Archive] Archiving thread in Gmail (removing INBOX and UNREAD labels): userId=${userId}, threadId=${threadId}`,
      );
      const archiveResult = await gmail.users.threads.modify({
        userId: "me",
        id: threadId,
        requestBody: {
          removeLabelIds: ["INBOX", "UNREAD"],
        },
      });
      this.logger.log(
        `[Gmail Archive] Thread archived and marked as read in Gmail: userId=${userId}, threadId=${threadId}, result=${JSON.stringify(archiveResult.data)}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `[Gmail Archive] Error archiving thread ${threadId} for user ${userId}:`,
        error,
      );
      logErrorToFile(
        `Failed to archive thread in Gmail (userId: ${userId}, threadId: ${threadId})`,
        error,
        "GmailProvider",
      );
      throw error;
    }
  }

  /**
   * Sync star status to Gmail by modifying the STARRED label on all messages in a thread
   */
  async syncStarStatusToGmail(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("User not connected to Gmail");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Get the thread with all messages
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });

      const thread = threadData.data;
      const messages = thread.messages || [];

      // Gmail requires modifying individual messages, not threads
      // If starCount > 0, add STARRED label to all messages
      // If starCount = 0, remove STARRED label from all messages
      const shouldBeStarred = starCount > 0;

      for (const message of messages) {
        if (!message.id) continue;

        const messageLabelIds = message.labelIds || [];
        const isCurrentlyStarred = messageLabelIds.includes("STARRED");

        // Only modify if the status needs to change
        if (shouldBeStarred && !isCurrentlyStarred) {
          await gmail.users.messages.modify({
            userId: "me",
            id: message.id,
            requestBody: {
              addLabelIds: ["STARRED"],
            },
          });
        } else if (!shouldBeStarred && isCurrentlyStarred) {
          await gmail.users.messages.modify({
            userId: "me",
            id: message.id,
            requestBody: {
              removeLabelIds: ["STARRED"],
            },
          });
        }
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error syncing star status for thread ${threadId} for user ${userId}:`,
        error,
      );
      logErrorToFile(
        `Failed to sync star status to Gmail (userId: ${userId}, threadId: ${threadId}, starCount: ${starCount})`,
        error,
        "GmailProvider",
      );
      throw error;
    }
  }

  /**
   * Sync read status to Gmail by modifying the UNREAD label
   */
  async syncReadStatusToGmail(
    userId: string,
    messageId: string,
    isRead: boolean,
  ): Promise<void> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("User not connected to Gmail");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    // Handle token refresh
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await this.usersService.update(userId, {
          googleCalendarAccessToken: tokens.access_token,
          ...(tokens.refresh_token && {
            googleCalendarRefreshToken: tokens.refresh_token,
          }),
        });
      }
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // To mark as read: remove UNREAD label
      // To mark as unread: add UNREAD label
      await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: {
          addLabelIds: isRead ? [] : ["UNREAD"],
          removeLabelIds: isRead ? ["UNREAD"] : [],
        },
      });
    } catch (error: unknown) {
      // Check if this is a permissions error (user needs to re-authenticate with new scopes)
      const apiError = isApiError(error) ? error : null;
      const errorMsg = isError(error) ? error.message : apiError?.message || "";
      const isPermissionError =
        apiError?.code === 403 ||
        (apiError?.response && (apiError.response as any).status === 403) ||
        errorMsg?.includes("Insufficient Permission") ||
        errorMsg?.includes("insufficient permission");

      if (isPermissionError) {
        this.logger.warn(
          `Permission denied syncing read status to Gmail for message ${messageId}. User may need to re-authenticate with gmail.modify scope.`,
        );
        // Optionally flag user for re-authentication, but don't block the operation
        // The user will need to reconnect their Gmail account to get the new scope
      } else {
        this.logger.error(
          `Error syncing read status to Gmail for message ${messageId}:`,
          error,
        );
      }
      // Don't throw - log but allow operation to continue
      // This prevents Gmail sync failures from blocking the app
    }
  }

  async unarchiveThread(userId: string, threadId: string): Promise<void> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("User not connected to Gmail");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Add back to inbox (unarchive the thread)
      // Note: We don't need to remove any custom label since we never added one
      this.logger.log(
        `[Gmail Unarchive] Unarchiving thread in Gmail (adding INBOX label): userId=${userId}, threadId=${threadId}`,
      );
      await gmail.users.threads.modify({
        userId: "me",
        id: threadId,
        requestBody: {
          addLabelIds: ["INBOX"],
        },
      });
      this.logger.log(
        `[Gmail Unarchive] Thread unarchived successfully in Gmail: userId=${userId}, threadId=${threadId}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Error unarchiving thread ${threadId} for user ${userId}:`,
        error,
      );
      logErrorToFile(
        `Failed to unarchive thread in Gmail (userId: ${userId}, threadId: ${threadId})`,
        error,
        "GmailProvider",
      );
      throw error;
    }
  }

  /**
   * Delete/trash a thread by moving it to Gmail's TRASH label
   */
  async trashThread(userId: string, threadId: string): Promise<void> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      throw new Error("User not connected to Gmail");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Get the thread to get all messages
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });

      const thread = threadData.data;
      const messages = thread.messages || [];

      // Move all messages in the thread to trash
      // Gmail requires modifying individual messages, not threads
      for (const message of messages) {
        if (!message.id) continue;

        await gmail.users.messages.trash({
          userId: "me",
          id: message.id,
        });
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error trashing thread ${threadId} for user ${userId}:`,
        error,
      );
      logErrorToFile(
        `Failed to trash thread in Gmail (userId: ${userId}, threadId: ${threadId})`,
        error,
        "GmailProvider",
      );
      throw error;
    }
  }

  /**
   * Ensure the SnoozedBearlyMail label exists in Gmail, creating it if necessary
   * Returns the label ID for use in message modifications
   */
  private async ensureSnoozeLabelExists(
    userId: string,
    gmail: gmail_v1.Gmail,
  ): Promise<string> {
    const cacheKey = `${userId}_SnoozedBearlyMail`;
    const cachedLabelId = this.bearlyMailLabelCache.get(cacheKey);
    if (cachedLabelId) {
      return cachedLabelId;
    }

    const labelName = "SnoozedBearlyMail";

    try {
      // First, try to find the label in existing labels
      const labelMap = await this.getGmailLabels(userId);
      for (const [labelId, name] of labelMap.entries()) {
        if (name === labelName) {
          this.bearlyMailLabelCache.set(cacheKey, labelId);
          return labelId;
        }
      }

      // Label doesn't exist, create it
      this.logger.log(`Creating SnoozedBearlyMail label for user ${userId}`);
      const createResponse = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });

      const labelId = createResponse.data.id;
      if (labelId) {
        this.bearlyMailLabelCache.set(cacheKey, labelId);
        // Invalidate label cache to force refresh
        this.labelCache.delete(userId);
        this.labelCacheExpiry.delete(userId);
        return labelId;
      }

      throw new Error("Failed to create label: no ID returned");
    } catch (error: unknown) {
      // If label already exists (409 conflict), try to find it again
      if (isApiError(error) && error.code === 409) {
        this.logger.log(
          `Label ${labelName} already exists, fetching label list again`,
        );
        // Invalidate cache and try again
        this.labelCache.delete(userId);
        this.labelCacheExpiry.delete(userId);
        const labelMap = await this.getGmailLabels(userId);
        for (const [labelId, name] of labelMap.entries()) {
          if (name === labelName) {
            this.bearlyMailLabelCache.set(cacheKey, labelId);
            return labelId;
          }
        }
      }

      this.logger.error(
        `Failed to ensure snooze label exists for user ${userId}:`,
        error,
      );
      logErrorToFile(
        `Failed to ensure snooze label exists (userId: ${userId})`,
        error,
        "GmailProvider",
      );
      throw error;
    }
  }

  /**
   * Snooze a thread by adding the SnoozedBearlyMail label and removing INBOX label from all messages
   * This hides the thread from the inbox in Gmail until it's unsnoozed
   */
  async snoozeThread(
    userId: string,
    threadId: string,
    snoozeUntil: Date,
  ): Promise<void> {
    this.logger.log(
      `[Gmail Snooze] Starting snoozeThread: userId=${userId}, threadId=${threadId}, snoozeUntil=${snoozeUntil.toISOString()}`,
    );
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.error(
        `[Gmail Snooze] User not connected to Gmail: userId=${userId}`,
      );
      throw new Error("User not connected to Gmail");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Get the thread with all messages
      this.logger.log(
        `[Gmail Snooze] Fetching thread data: userId=${userId}, threadId=${threadId}`,
      );
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });

      const thread = threadData.data;
      const messages = thread.messages || [];
      this.logger.log(
        `[Gmail Snooze] Thread fetched: userId=${userId}, threadId=${threadId}, messageCount=${messages.length}`,
      );

      // Ensure the snooze label exists
      const snoozeLabelId = await this.ensureSnoozeLabelExists(userId, gmail);
      this.logger.log(
        `[Gmail Snooze] Snooze label ID: ${snoozeLabelId} for userId=${userId}`,
      );

      // Add the snooze label and remove INBOX label from all messages in the thread
      // Gmail requires modifying individual messages, not threads
      let labeledCount = 0;
      for (const message of messages) {
        if (!message.id) continue;

        const messageLabelIds = message.labelIds || [];
        const isCurrentlySnoozed = messageLabelIds.includes(snoozeLabelId);
        const hasInboxLabel = messageLabelIds.includes("INBOX");

        // Build the modification request
        const addLabelIds: string[] = [];
        const removeLabelIds: string[] = [];

        if (!isCurrentlySnoozed) {
          addLabelIds.push(snoozeLabelId);
        }
        if (hasInboxLabel) {
          removeLabelIds.push("INBOX");
        }

        // Only make API call if there are changes to make
        if (addLabelIds.length > 0 || removeLabelIds.length > 0) {
          await gmail.users.messages.modify({
            userId: "me",
            id: message.id,
            requestBody: {
              ...(addLabelIds.length > 0 && { addLabelIds }),
              ...(removeLabelIds.length > 0 && { removeLabelIds }),
            },
          });
          labeledCount++;
        }
      }

      this.logger.log(
        `[Gmail Snooze] Thread snoozed successfully: userId=${userId}, threadId=${threadId}, labeledCount=${labeledCount}, removedInboxLabel=true`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `[Gmail Snooze] Error snoozing thread ${threadId} for user ${userId}:`,
        error,
      );
      logErrorToFile(
        `Failed to snooze thread in Gmail (userId: ${userId}, threadId: ${threadId})`,
        error,
        "GmailProvider",
      );
      throw error;
    }
  }

  /**
   * Unsnooze a thread by removing the SnoozedBearlyMail label and adding INBOX label back to all messages
   * This restores the thread to the inbox in Gmail
   */
  async unsnoozeThread(userId: string, threadId: string): Promise<void> {
    this.logger.log(
      `[Gmail Unsnooze] Starting unsnoozeThread: userId=${userId}, threadId=${threadId}`,
    );
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.error(
        `[Gmail Unsnooze] User not connected to Gmail: userId=${userId}`,
      );
      throw new Error("User not connected to Gmail");
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Get the thread with all messages
      this.logger.log(
        `[Gmail Unsnooze] Fetching thread data: userId=${userId}, threadId=${threadId}`,
      );
      const threadData = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });

      const thread = threadData.data;
      const messages = thread.messages || [];
      this.logger.log(
        `[Gmail Unsnooze] Thread fetched: userId=${userId}, threadId=${threadId}, messageCount=${messages.length}`,
      );

      // Get the snooze label ID
      const labelMap = await this.getGmailLabels(userId);
      let snoozeLabelId: string | null = null;
      for (const [labelId, name] of labelMap.entries()) {
        if (name === "SnoozedBearlyMail") {
          snoozeLabelId = labelId;
          break;
        }
      }

      // Remove the snooze label and add INBOX label back to all messages in the thread
      let unlabeledCount = 0;
      for (const message of messages) {
        if (!message.id) continue;

        const messageLabelIds = message.labelIds || [];
        const isCurrentlySnoozed =
          snoozeLabelId && messageLabelIds.includes(snoozeLabelId);
        const hasInboxLabel = messageLabelIds.includes("INBOX");

        // Build the modification request
        const addLabelIds: string[] = [];
        const removeLabelIds: string[] = [];

        if (isCurrentlySnoozed) {
          removeLabelIds.push(snoozeLabelId);
        }
        if (!hasInboxLabel) {
          addLabelIds.push("INBOX");
        }

        // Only make API call if there are changes to make
        if (addLabelIds.length > 0 || removeLabelIds.length > 0) {
          await gmail.users.messages.modify({
            userId: "me",
            id: message.id,
            requestBody: {
              ...(addLabelIds.length > 0 && { addLabelIds }),
              ...(removeLabelIds.length > 0 && { removeLabelIds }),
            },
          });
          unlabeledCount++;
        }
      }

      this.logger.log(
        `[Gmail Unsnooze] Thread unsnoozed successfully: userId=${userId}, threadId=${threadId}, unlabeledCount=${unlabeledCount}, restoredInboxLabel=true`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `[Gmail Unsnooze] Error unsnoozing thread ${threadId} for user ${userId}:`,
        error,
      );
      logErrorToFile(
        `Failed to unsnooze thread in Gmail (userId: ${userId}, threadId: ${threadId})`,
        error,
        "GmailProvider",
      );
      throw error;
    }
  }
}
