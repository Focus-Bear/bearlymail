import { Injectable, Inject, forwardRef } from "@nestjs/common";
import { google } from "googleapis";
import { MoreThan } from "typeorm";
import { UsersService } from "../../users/users.service";
import { EmailsService } from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import {
  EmailProvider,
  RawEmailMessage,
  EmailRecipient,
} from "../interfaces/email-provider.interface";
import { Email } from "../../database/entities/email.entity";
import PgBoss = require("pg-boss");
import { getJobPriority } from "../../queue/job-priorities";

// BearlyMail custom labels
const BEARLY_MAIL_ARCHIVED_LABEL = "bearly-mail-archived";

@Injectable()
export class GmailProvider implements EmailProvider {
  // Cache for Gmail label names per user (labelId -> labelName)
  private labelCache: Map<string, Map<string, string>> = new Map();
  private labelCacheExpiry: Map<string, number> = new Map();
  private readonly LABEL_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  // Cache for BearlyMail label IDs per user
  private bearlyMailLabelCache: Map<string, string> = new Map();

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

    const user = await this.usersService.findOne(userId);
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
      console.error("Failed to fetch Gmail labels:", error);
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
    ]);

    return labelIds
      .filter((id) => !skipLabels.has(id))
      .map((id) => labelMap.get(id) || id) // Fall back to ID if name not found
      .filter(
        (name) => !name.startsWith("Label_") && !name.startsWith("label_"),
      ); // Skip unmapped custom labels
  }

  async isConnected(userId: string): Promise<boolean> {
    const user = await this.usersService.findOne(userId);
    return !!user?.googleCalendarAccessToken;
  }

  async syncEmails(userId: string): Promise<void> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      console.log(
        `User ${userId} not connected to Gmail, skipping email sync.`,
      );
      return;
    }

    // GRACE PERIOD: If user just logged in (within last 5 minutes), be lenient with errors
    // Check if tokens were just updated (user likely just logged in)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
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
    console.log(debugInfo);
    const { writeDebugLog } = require("../../auth/auth-logger");
    writeDebugLog(debugInfo);

    // Check if refresh token exists - if not, user needs to re-authenticate
    if (!user.googleCalendarRefreshToken) {
      // Log auth failure
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
        console.warn(
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
      console.log(`Tokens refreshed for user ${userId}`);
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
      console.log(`Token validated for user ${userId}`);
    } catch (refreshError: any) {
      // GRACE PERIOD: If user just logged in, don't flag for re-login immediately
      // Re-fetch user to check updatedAt timestamp
      let currentUser = user;
      try {
        currentUser = await this.usersService.findOne(userId);
      } catch (userError) {
        // If we can't fetch user, use the one we already have
        console.error(
          `Could not re-fetch user ${userId} for grace period check:`,
          userError,
        );
      }

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const isRecentLogin =
        currentUser?.updatedAt &&
        new Date(currentUser.updatedAt) > fiveMinutesAgo;

      // Log comprehensive auth failure details
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
        console.warn(
          `⚠️ Token refresh failed for recently logged-in user ${userId}, but within grace period. Will retry later.`,
        );
        throw new Error(
          "Token refresh failed (within grace period - will retry)",
        );
      }
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Use thread-level queries like GmailApp.search() - more reliable than message-level queries
      // Fetch threads (not messages) from inbox and starred threads
      const [inboxThreadsResponse, starredThreadsResponse] = await Promise.all([
        // Fetch unread threads from inbox (matches your Apps Script query pattern)
        gmail.users.threads.list({
          userId: "me",
          maxResults: 500,
          q: "is:unread in:inbox -label:SnoozedFocusBear -label:VA-to-action",
        }),
        // Fetch ALL starred threads (matches your Apps Script query)
        gmail.users.threads.list({
          userId: "me",
          maxResults: 500,
          q: "is:starred -label:SnoozedFocusBear -label:VA-to-action",
        }),
      ]);

      const inboxThreads = inboxThreadsResponse.data.threads || [];
      const starredThreads = starredThreadsResponse.data.threads || [];

      // Combine and deduplicate thread IDs
      const allThreadIds = new Set([
        ...inboxThreads.map((t) => t.id!),
        ...starredThreads.map((t) => t.id!),
      ]);

      console.log(
        `Found ${inboxThreads.length} inbox threads and ${starredThreads.length} starred threads (${allThreadIds.size} unique) for user ${userId}`,
      );

      // Process each thread to get messages and determine archived/starred status
      // Collect thread updates for bulk processing
      const threadStarCountUpdates: { threadId: string; starCount: number }[] =
        [];
      const threadArchivedUpdates: {
        threadId: string;
        isArchived: boolean;
      }[] = [];

      for (const threadId of allThreadIds) {
        if (!threadId) continue;

        try {
          // Get the thread with all messages to check archived/starred status accurately
          const threadData = await gmail.users.threads.get({
            userId: "me",
            id: threadId,
            format: "full",
          });

          const thread = threadData.data;
          if (!thread.messages || thread.messages.length === 0) continue;

          // Get the latest message (first in array) to determine current status
          const latestMessage = thread.messages[thread.messages.length - 1];
          const latestLabelIds = latestMessage.labelIds || [];

          // A thread is archived if ALL messages lack the INBOX label
          // More accurately: if the latest message doesn't have INBOX, the thread is archived
          const isArchived = !latestLabelIds.includes("INBOX");
          const isStarred = latestLabelIds.includes("STARRED");
          const starCount = isStarred ? 3 : 0;

          // Collect thread updates (only once per thread, not per message)
          threadStarCountUpdates.push({ threadId, starCount });
          threadArchivedUpdates.push({ threadId, isArchived });

          // Process all messages in the thread
          for (const message of thread.messages) {
            if (!message.id) continue;

            const rawEmail = this.parseGmailMessage(message);
            if (!rawEmail) continue;

            const existing = await this.emailsService.getEmailByMessageId(
              userId,
              message.id,
            );

            if (existing) {
              // Sync read status from Gmail (use labelIds from this specific message)
              const messageLabelIds = message.labelIds || [];
              const isReadInGmail = !messageLabelIds.includes("UNREAD");
              if (existing.isRead !== isReadInGmail) {
                await this.emailsService.updateEmail(existing.id, {
                  isRead: isReadInGmail,
                });
              }
              continue;
            }

            // Create new email - use thread-level archived/starred status
            await this.emailsService.createEmail(userId, {
              messageId: rawEmail.messageId,
              threadId: rawEmail.threadId,
              subject: rawEmail.subject,
              from: rawEmail.from,
              fromName: rawEmail.fromName,
              body: rawEmail.body,
              htmlBody: rawEmail.htmlBody,
              starCount: starCount, // Use thread-level star count
              receivedAt: rawEmail.receivedAt,
              labels: rawEmail.labelIds || [],
            } as any);
          }
        } catch (threadError: any) {
          // Skip threads that fail (deleted, permissions, etc.)
          if (threadError.code === 404) {
            console.log(
              `Thread ${threadId.substring(0, 8)}... not found (may be deleted)`,
            );
          } else {
            console.warn(
              `Error processing thread ${threadId.substring(0, 8)}...:`,
              threadError.message,
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

      // Also check existing threads in action/follow-up tabs (starred threads) against Gmail
      // This ensures we catch threads that were archived or unstarred in Gmail
      const existingStarredThreads = await this.emailsService.getExistingStarredThreads(userId);

      console.log(
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

          // Only update if status changed
          if (
            isArchived !== dbThread.isArchived ||
            starCount !== dbThread.starCount
          ) {
            existingThreadUpdates.push({
              threadId: dbThread.threadId,
              starCount,
              isArchived,
            });
          }
        } catch (threadError: any) {
          // Thread not found (404) or other error - mark as archived
          if (threadError.code === 404) {
            console.log(
              `Existing thread ${dbThread.threadId.substring(0, 8)}... not found in Gmail (may be deleted)`,
            );
            existingThreadUpdates.push({
              threadId: dbThread.threadId,
              starCount: 0,
              isArchived: true,
            });
          } else {
            console.warn(
              `Error checking existing thread ${dbThread.threadId.substring(0, 8)}...:`,
              threadError.message,
            );
          }
          continue;
        }
      }

      // Batch update existing threads that changed
      if (existingThreadUpdates.length > 0) {
        console.log(
          `Updating ${existingThreadUpdates.length} existing threads with changed status`,
        );
        const existingStarUpdates = existingThreadUpdates.map((u) => ({
          threadId: u.threadId,
          starCount: u.starCount,
        }));
        const existingArchivedUpdates = existingThreadUpdates.map((u) => ({
          threadId: u.threadId,
          isArchived: u.isArchived,
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
    } catch (error: any) {
      // Check for authentication errors - these indicate the refresh token is invalid/expired
      const isAuthError =
        error.code === 401 ||
        (error.response && error.response.status === 401) ||
        error.code === "invalid_grant" ||
        error.response?.data?.error === "invalid_grant" ||
        (error.message &&
          (error.message.includes("invalid_grant") ||
            error.message.includes("Refresh token missing") ||
            error.message.includes("Token refresh failed")));

      if (isAuthError) {
        // Log comprehensive auth failure details
        // Re-fetch user to check grace period
        let currentUser = user;
        try {
          currentUser = await this.usersService.findOne(userId);
        } catch (userError) {
          console.error(
            `Could not re-fetch user ${userId} for auth logging:`,
            userError,
          );
        }

        // GRACE PERIOD: Don't flag for re-login if user just logged in (within 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const isRecentLogin =
          currentUser?.updatedAt &&
          new Date(currentUser.updatedAt) > fiveMinutesAgo;

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
          console.warn(
            `⚠️ Auth error for recently logged-in user ${userId} (${currentUser?.email}), but within grace period. Will retry later.`,
          );
        }
        throw error;
      }

      // Log other errors too (but not as auth failures)
      console.error(
        `❌ Error syncing emails for user ${userId}:`,
        error?.message || error,
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
    gmail: any,
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
          q: "in:inbox -label:SnoozedFocusBear -label:VA-to-action",
        }),
        // Get all starred threads
        gmail.users.threads.list({
          userId: "me",
          maxResults: 500,
          q: "is:starred -label:SnoozedFocusBear -label:VA-to-action",
        }),
      ]);

      const inboxThreadIds = new Set(
        (inboxResponse.data.threads || []).map((t: any) => t.id),
      );
      const starredThreadIds = new Set(
        (starredResponse.data.threads || []).map((t: any) => t.id),
      );

      console.log(
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

        const archivedCount = updates.filter((u) => u.isArchived).length;
        const unarchivedCount = updates.filter((u) => !u.isArchived).length;
        const starredCount = updates.filter((u) => u.starCount > 0).length;
        const duration = Date.now() - startTime;

        console.log(
          `📦 Thread sync complete in ${duration}ms: ${updates.length} changes (${archivedCount} archived, ${unarchivedCount} unarchived, ${starredCount} starred)`,
        );
      } else {
        console.log(
          `📦 Thread sync: no changes needed (${Date.now() - startTime}ms)`,
        );
      }
    } catch (error) {
      console.error("❌ Error syncing thread archived/starred status:", error);
      // Don't throw - this is a background sync, don't fail the main sync
    }
  }

  async scanHistory(userId: string): Promise<void> {
    console.log(`Starting historical email scan for user ${userId}`);
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      console.log(
        `User ${userId} not connected to Gmail, skipping historical scan.`,
      );
      return;
    }

    // Check if refresh token exists
    if (!user.googleCalendarRefreshToken) {
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
      console.log(`Token validated for user ${userId} for historical scan.`);
    } catch (refreshError: any) {
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
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const query = `after:${Math.floor(sevenDaysAgo.getTime() / 1000)} (label:INBOX OR label:SENT)`;

      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 300,
        q: query,
      });

      const messages = response.data.messages || [];
      console.log(
        `Found ${messages.length} historical messages for user ${userId}. Queuing individual jobs for parallel processing.`,
      );

      await this.usersService.update(userId, {
        scanTotal: messages.length,
        scanProgress: 0,
      });

      // Queue individual jobs for each message - send in parallel batches for faster queuing
      const messageIds = messages.filter((msg) => msg.id).map((msg) => msg.id!);

      // Send jobs in batches of 50 to avoid overwhelming the queue system
      const BATCH_SIZE = 50;
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

      console.log(
        `Queued ${messageIds.length} email scan jobs for parallel processing (out of ${messages.length} messages)`,
      );
    } catch (error: any) {
      // Check for authentication errors
      const isAuthError =
        error.code === 401 ||
        (error.response && error.response.status === 401) ||
        error.code === "invalid_grant" ||
        error.response?.data?.error === "invalid_grant" ||
        (error.message && error.message.includes("invalid_grant"));

      if (isAuthError) {
        // Try to get user, but don't fail if we can't
        let userForLogging = null;
        let userEmail = null;
        try {
          userForLogging = await this.usersService.findOne(userId);
          userEmail = userForLogging?.email || null;
        } catch (userError) {
          console.error(
            `Could not fetch user ${userId} for auth logging:`,
            userError,
          );
        }

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

  async processScanEmail(userId: string, messageId: string): Promise<void> {
    const startTime = Date.now();
    console.log(
      `[processScanEmail] Starting to process email ${messageId} for user ${userId}`,
    );
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      console.log(`[processScanEmail] User ${userId} not connected, skipping`);
      return;
    }

    // Check if email already exists in temporary scan table
    const existing = await this.scanEmailService.findByMessageId(
      userId,
      messageId,
    );
    if (existing) {
      // Update progress atomically even if already exists
      const result = await this.usersService.incrementScanProgress(userId);
      if (result.isComplete) {
        // Trigger analysis job when scan completes
        await this.boss.send(
          "analyze-scan-results",
          { userId },
          {
            priority: getJobPriority("analyze-scan-results", false),
          },
        );
      }
      const duration = Date.now() - startTime;
      console.log(
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
        // Update progress atomically even if parsing fails
        const result = await this.usersService.incrementScanProgress(userId);
        if (result.isComplete) {
          await this.boss.send(
            "analyze-scan-results",
            { userId },
            {
              priority: getJobPriority("analyze-scan-results", false),
            },
          );
        }
        const duration = Date.now() - startTime;
        console.log(
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
        isArchived: !labelIds.includes("INBOX"), // Check if archived
      });

      // Update progress atomically after each email - this handles completion check internally
      const result = await this.usersService.incrementScanProgress(userId);
      if (result.isComplete) {
        // Trigger analysis job when scan completes
        console.log(
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
      const duration = Date.now() - startTime;
      console.log(
        `[processScanEmail] Completed email ${messageId} in ${duration}ms`,
      );
    } catch (error: any) {
      console.error(
        `Error processing message ${messageId} for user ${userId}:`,
        error,
      );
      // Still update progress atomically on error
      const result = await this.usersService.incrementScanProgress(userId);
      if (result.isComplete) {
        await this.boss.send(
          "analyze-scan-results",
          { userId },
          {
            priority: getJobPriority("analyze-scan-results", false),
          },
        );
      }
      if (
        error.code === 401 ||
        (error.response && error.response.status === 401) ||
        (error.message && error.message.includes("invalid_grant"))
      ) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
    }
  }

  async sendReply(
    userId: string,
    threadId: string,
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    const user = await this.usersService.findOne(userId);
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

    const emailContent = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `In-Reply-To: <${threadId}@mail.gmail.com>`,
      `References: <${threadId}@mail.gmail.com>`,
      "",
      body,
    ].join("\n");

    const encodedEmail = Buffer.from(emailContent)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    try {
      await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedEmail,
          threadId: threadId,
        },
      });
      console.log(`Reply sent successfully for user ${userId} to ${to}`);
    } catch (error: any) {
      console.error(`Failed to send reply for user ${userId} to ${to}:`, error);
      if (
        error.code === 401 ||
        (error.response && error.response.status === 401) ||
        (error.message && error.message.includes("invalid_grant"))
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
  ): Promise<{ messageId: string; threadId: string }> {
    const user = await this.usersService.findOne(userId);
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
    const ccHeader =
      cc && cc.length > 0 ? cc.map(formatRecipient).join(", ") : null;
    const bccHeader =
      bcc && bcc.length > 0 ? bcc.map(formatRecipient).join(", ") : null;

    // Build email headers
    const headers: string[] = [
      `To: ${toHeader}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
    ];

    if (ccHeader) {
      headers.push(`Cc: ${ccHeader}`);
    }
    if (bccHeader) {
      headers.push(`Bcc: ${bccHeader}`);
    }

    const emailContent = [...headers, "", body].join("\r\n");

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

      console.log(
        `Email sent successfully for user ${userId} to ${toHeader}, messageId: ${messageId}`,
      );

      return { messageId, threadId };
    } catch (error: any) {
      console.error(
        `Failed to send email for user ${userId} to ${toHeader}:`,
        error,
      );
      if (
        error.code === 401 ||
        (error.response && error.response.status === 401) ||
        (error.message && error.message.includes("invalid_grant"))
      ) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
      throw new Error(
        `Failed to send email: ${error.message || "Unknown error"}`,
      );
    }
  }

  private parseGmailMessage(messageData: any): RawEmailMessage | null {
    if (!messageData.id || !messageData.threadId) return null;

    const headers = messageData.payload?.headers || [];
    const subject =
      headers.find((h: any) => h.name === "Subject")?.value || "(No Subject)";
    const from = headers.find((h: any) => h.name === "From")?.value || "";
    const labelIds = messageData.labelIds || [];
    // Convert Gmail STARRED label to starCount: STARRED = 3 stars (high importance)
    const starCount = labelIds.includes("STARRED") ? 3 : 0;

    const fromMatch = from.match(/(.*)<(.+)>/);
    const fromName = fromMatch ? fromMatch[1].trim() : undefined;
    const fromEmail = fromMatch ? fromMatch[2].trim() : from;

    const { body, htmlBody } = this.extractBodyFromPayload(messageData.payload);

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
    };
  }

  private extractBodyFromPayload(payload: any): {
    body: string;
    htmlBody?: string;
  } {
    let body = "";
    let htmlBody: string | undefined;

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          body = Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        if (part.mimeType === "text/html" && part.body?.data) {
          htmlBody = Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        if (part.parts) {
          const nested = this.extractBodyFromPayload(part);
          if (!body) body = nested.body;
          if (!htmlBody) htmlBody = nested.htmlBody;
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
        body = payload.snippet || "(No content)";
      }
    }

    return { body, htmlBody };
  }

  async searchEmails(
    userId: string,
    query: string,
    maxResults: number = 50,
  ): Promise<RawEmailMessage[]> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      console.log(
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
        maxResults: Math.min(maxResults, 100), // Gmail API limit is 100
      });

      const messages = response.data.messages || [];
      if (messages.length === 0) {
        return [];
      }

      const rawEmails: RawEmailMessage[] = [];

      // Fetch full message details in parallel batches for better performance
      const batchSize = 5; // Process 5 at a time to avoid rate limits
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
            console.error(
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
    } catch (error: any) {
      console.error(`Error searching emails for user ${userId}:`, error);
      if (
        error.code === 401 ||
        (error.response && error.response.status === 401) ||
        (error.message && error.message.includes("invalid_grant"))
      ) {
        await this.usersService.update(userId, { needsRelogin: true });
      }
      throw error;
    }
  }

  async archiveThread(userId: string, threadId: string): Promise<void> {
    const user = await this.usersService.findOne(userId);
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
      // Remove from inbox and add archived label
      await gmail.users.threads.modify({
        userId: "me",
        id: threadId,
        requestBody: {
          removeLabelIds: ["INBOX"],
          addLabelIds: ["bearly-mail-archived"],
        },
      });
    } catch (error: any) {
      console.error(
        `Error archiving thread ${threadId} for user ${userId}:`,
        error,
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
    const user = await this.usersService.findOne(userId);
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
    } catch (error: any) {
      console.error(
        `Error syncing read status to Gmail for message ${messageId}:`,
        error,
      );
      // Don't throw - log but allow operation to continue
      // This prevents Gmail sync failures from blocking the app
    }
  }

  async unarchiveThread(userId: string, threadId: string): Promise<void> {
    const user = await this.usersService.findOne(userId);
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
      // Add to inbox and remove archived label
      await gmail.users.threads.modify({
        userId: "me",
        id: threadId,
        requestBody: {
          addLabelIds: ["INBOX"],
          removeLabelIds: ["bearly-mail-archived"],
        },
      });
    } catch (error: any) {
      console.error(
        `Error unarchiving thread ${threadId} for user ${userId}:`,
        error,
      );
      throw error;
    }
  }
}
