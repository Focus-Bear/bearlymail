import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { gmail_v1, google } from "googleapis";
import PgBoss from "pg-boss";

import { authLogger } from "../../auth/auth-logger";
import { HTTP_STATUS } from "../../constants/http-status";
import { QUERY_LIMITS } from "../../constants/query-limits";
// QUERY_LIMITS used in helper modules
import {
  DAYS,
  MILLISECONDS,
  MINUTES,
  MS_PER_SECOND,
} from "../../constants/time-constants";
import { User } from "../../database/entities/user.entity";
import { getJobPriority } from "../../queue/job-priorities";
import { formatGaxiosError, isApiError } from "../../types/common";
import { UsersService } from "../../users/users.service";
import { logErrorToFile } from "../../utils/error-logger";
import { InvalidTokenError } from "../../utils/errors";
import {
  EmailDataWithOptionalThreadProps,
  EmailsService,
} from "../emails.service";
import {
  EmailAttachmentData,
  EmailProvider,
  EmailRecipient,
  RawEmailMessage,
  SendReplyOptions,
} from "../interfaces/email-provider.interface";
import { ScanEmailService } from "../scan-email.service";
import { SyncHistoryService } from "../sync-history.service";
import {
  buildGmailUrlIdsToTry,
  lookupGmailMessageByIds,
  lookupGmailThreadByIds,
} from "./gmail/gmail-lookup";
import { parseGmailMessage } from "./gmail/gmail-message-parser";
import {
  archiveThreadInGmail,
  ensureLabelExists,
  snoozeThreadInGmail,
  syncReadStatusToGmail as syncReadToGmail,
  syncStarStatusToGmail as syncStarToGmail,
  trashThreadInGmail,
  unarchiveThreadInGmail,
  unsnoozeThreadInGmail,
} from "./gmail/gmail-operations";
import { buildEmailContent, encodeEmailForGmail } from "./gmail/gmail-send";
import {
  getExistingThreadUpdates,
  isGmailAuthError,
  isThreadStarred,
  verifyThreadStatusesInGmail,
} from "./gmail/gmail-sync";

// Canonical implementation lives in email-address.utils.ts; re-exported for backward compatibility.
export { parseRecipientsFromString } from "../../utils/email-address.utils";
import { parseRecipientsFromString } from "../../utils/email-address.utils";

@Injectable()
export class GmailProvider implements EmailProvider {
  private readonly progressUpdateCounters = new Map<string, number>();
  private labelCache: Map<string, Map<string, string>> = new Map();
  private labelCacheExpiry: Map<string, number> = new Map();
  private readonly LABEL_CACHE_TTL = MINUTES.THIRTY * MILLISECONDS.MINUTE;
  private bearlyMailLabelCache: Map<string, string> = new Map();
  private readonly logger = new Logger(GmailProvider.name);

  constructor(
    private usersService: UsersService,
    @Inject(forwardRef(() => EmailsService))
    private emailsService: EmailsService,
    private scanEmailService: ScanEmailService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private syncHistoryService: SyncHistoryService,
  ) {}

  async getGmailLabels(userId: string): Promise<Map<string, string>> {
    const cached = this.labelCache.get(userId);
    const expiry = this.labelCacheExpiry.get(userId);
    if (cached && expiry && Date.now() < expiry) return cached;

    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) return new Map();

    const gmail = await this.createGmailClient(userId);
    if (!gmail) return new Map();

    try {
      const response = await gmail.users.labels.list({ userId: "me" });
      const labelMap = new Map<string, string>();
      for (const label of response.data.labels || []) {
        if (label.id && label.name) labelMap.set(label.id, label.name);
      }
      this.labelCache.set(userId, labelMap);
      this.labelCacheExpiry.set(userId, Date.now() + this.LABEL_CACHE_TTL);
      return labelMap;
    } catch (error) {
      this.logger.error("Failed to fetch Gmail labels:", error);
      return cached || new Map();
    }
  }

  async convertLabelIdsToNames(
    userId: string,
    labelIds: string[],
  ): Promise<string[]> {
    if (!labelIds || labelIds.length === 0) return [];
    const labelMap = await this.getGmailLabels(userId);
    const skipLabels = new Set([
      "INBOX",
      "SENT",
      "TRASH",
      "SPAM",
      "DRAFT",
      "UNREAD",
      "STARRED",
      "IMPORTANT",
    ]);
    return [
      ...new Set(
        labelIds
          .map((id) => (skipLabels.has(id) ? null : labelMap.get(id) || id))
          .filter(
            (name): name is string =>
              name !== null && !name.startsWith("Label_"),
          ),
      ),
    ];
  }

  async isConnected(userId: string): Promise<boolean> {
    const user = await this.usersService.findOneWithTokens(userId);
    return !!user?.googleCalendarAccessToken;
  }

  async getAccountInfo(userId: string): Promise<{
    email?: string;
    name?: string;
    isPrimary?: boolean;
  } | null> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) return null;

    return {
      email: user.email,
      name: user.name,
      // Legacy implementation - always primary
      isPrimary: true,
    };
  }

  private async createGmailClient(
    userId: string,
  ): Promise<gmail_v1.Gmail | null> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) return null;

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

    return google.gmail({ version: "v1", auth: oauth2Client });
  }

  async syncEmails(
    userId: string,
    syncWindowHoursOrOptions?:
      | number
      | import("../interfaces/email-provider.interface").SyncEmailsOptions,
  ): Promise<void> {
    // Parse the options - support both old (number) and new (object) format
    let syncWindowHours: number | undefined;
    let providedThreadIds: string[] | undefined;
    let isContinuation = false;
    let noDateFilter = false;

    if (typeof syncWindowHoursOrOptions === "number") {
      syncWindowHours = syncWindowHoursOrOptions;
    } else if (syncWindowHoursOrOptions) {
      ({ syncWindowHours, threadIds: providedThreadIds } =
        syncWindowHoursOrOptions);
      isContinuation = syncWindowHoursOrOptions.isContinuation || false;
      noDateFilter = syncWindowHoursOrOptions.noDateFilter || false;
    }

    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) return;

    const isRecentLogin = this.isWithinGracePeriod(user);
    if (!user.googleCalendarRefreshToken) {
      await this.handleMissingRefreshToken(userId, user, isRecentLogin);
    }

    const gmail = await this.createGmailClient(userId);
    if (!gmail) return;

    try {
      await this.validateToken(userId, user);
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        // Token is permanently invalid (revoked / wrong environment).
        // needsRelogin is already set inside validateToken — just log and
        // return.  Do NOT re-throw: this is an expected auth state, not a
        // bug, so we don't want it captured as an unhandled exception in
        // PostHog.
        this.logger.warn(
          `[GmailProvider] Invalid token for user ${userId} — skipping sync, needsRelogin set`,
        );
        return;
      }
      await this.handleTokenValidationError(userId, user, error, isRecentLogin);
    }

    try {
      const isInitialSync = !user.lastEmailSyncAt;
      await this.performSync(userId, gmail, isInitialSync, {
        syncWindowHours,
        providedThreadIds,
        isContinuation,
        noDateFilter,
      });
      await this.usersService.update(userId, {
        lastEmailSyncAt: new Date(),
      });
    } catch (error) {
      await this.handleSyncError(userId, user, error);
    }
  }

  private isWithinGracePeriod(user: User | null): boolean {
    const fiveMinutesAgo = new Date(
      Date.now() - MINUTES.FIVE * MILLISECONDS.MINUTE,
    );
    return (
      user.updatedAt &&
      new Date(user.updatedAt).getTime() > fiveMinutesAgo.getTime()
    );
  }

  private async handleMissingRefreshToken(
    userId: string,
    user: User | null,
    isRecentLogin: boolean,
  ): Promise<never> {
    const { authLogger } = await import("../../auth/auth-logger");
    authLogger.logAuthFailure(
      userId,
      user?.email || null,
      "syncEmails-missingRefreshToken",
      new Error("Refresh token missing"),
      {},
    );
    if (!isRecentLogin && !user.needsRelogin) {
      await this.usersService.update(userId, { needsRelogin: true });
    }
    throw new Error("Refresh token missing - please log in again");
  }

  private async validateToken(userId: string, user: User): Promise<void> {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });
    try {
      await oauth2Client.getAccessToken();
    } catch (error) {
      if (this.isInvalidTokenError(error)) {
        // Irrecoverable — token is revoked, from a wrong environment, or
        // encrypted with a different key.  Mark the user immediately (no
        // grace-period retry) and surface a typed error so the call site
        // can return cleanly without re-throwing.
        await this.usersService.update(userId, { needsRelogin: true });
        throw new InvalidTokenError(
          "Google access token is invalid or revoked. User must re-authenticate.",
        );
      }
      // For all other errors (network hiccup, transient 5xx, etc.) let the
      // existing handleTokenValidationError deal with it.
      throw error;
    }
  }

  /**
   * Returns true when a Google OAuth error is irrecoverable — i.e. the token
   * is permanently invalid, not just expired.
   *
   * Prefer the structured `error.response.data.error` field over message
   * string-matching to avoid breakage if Google changes its error strings.
   * String matching is kept as a secondary fallback for non-Gaxios paths.
   */
  private isInvalidTokenError(error: unknown): boolean {
    // Primary check: structured error code from the Google OAuth2 response body
    // google-auth-library wraps these as Gaxios errors with response.data
    const responseData = (error as { response?: { data?: { error?: string } } })
      ?.response?.data;
    if (responseData?.error) {
      const code = responseData.error.toLowerCase();
      if (code === "invalid_token" || code === "invalid_grant") {
        return true;
      }
    }
    // Secondary fallback: error message string (catches non-Gaxios paths and
    // older library versions that may not populate response.data)
    const message = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    return (
      message.includes("invalid_token") || message.includes("invalid token")
    );
  }

  private async handleTokenValidationError(
    userId: string,
    user: User | null,
    error: unknown,
    isRecentLogin: boolean,
  ): Promise<never> {
    const { authLogger } = await import("../../auth/auth-logger");
    authLogger.logAuthFailure(
      userId,
      user?.email || null,
      "syncEmails-tokenRefresh",
      error,
      {},
    );
    if (!isRecentLogin) {
      await this.usersService.update(userId, { needsRelogin: true });
    }
    throw new Error("Token refresh failed - please log in again");
  }

  /**
   * Fetch all thread IDs from Gmail using pagination.
   * Gmail API returns max 100 results per page, so we need to paginate.
   */
  private async fetchAllThreadsWithPagination(
    gmail: gmail_v1.Gmail,
    query: string,
    maxResults: number,
  ): Promise<string[]> {
    const allThreadIds: string[] = [];
    let pageToken: string | undefined;
    // Safety limit to prevent infinite loops
    const MAX_PAGES = 10;
    let pageCount = 0;

    while (allThreadIds.length < maxResults && pageCount < MAX_PAGES) {
      const response = await gmail.users.threads.list({
        userId: "me",
        maxResults: Math.min(100, maxResults - allThreadIds.length),
        q: query,
        pageToken,
      });

      const threads = response.data.threads || [];
      allThreadIds.push(...threads.map((thread) => thread.id!).filter(Boolean));

      pageToken = response.data.nextPageToken || undefined;
      pageCount++;
      if (!pageToken || threads.length === 0) break;
    }

    return allThreadIds;
  }

  private async fetchGmailThreadIds(
    userId: string,
    gmail: gmail_v1.Gmail,
    syncWindowHours: number | undefined,
    noDateFilter: boolean,
    queries: string[],
  ): Promise<{ allThreadIds: Set<string>; syncWindowStart: Date | null }> {
    const user = await this.usersService.findOneWithTokens(userId);
    const baseQuery = "-label:SnoozedBearlyMail -label:VA-to-action";
    let syncWindowStart: Date | null = null;
    let inboxQuery: string;
    let sentQuery: string;

    if (noDateFilter) {
      inboxQuery = `in:inbox ${baseQuery}`;
      sentQuery = `in:sent ${baseQuery} newer_than:2d`;
      this.logger.log(
        `[SYNC] noDateFilter=true: fetching all inbox emails without date restriction`,
      );
    } else {
      syncWindowStart = this.calculateSyncWindowStart(user, syncWindowHours);
      const syncWindowTimestamp = Math.floor(
        syncWindowStart.getTime() / MS_PER_SECOND,
      );
      const afterQuery = `after:${syncWindowTimestamp}`;
      inboxQuery = `in:inbox ${baseQuery} ${afterQuery}`;
      sentQuery = `in:sent ${baseQuery} ${afterQuery}`;
    }

    const starredQuery = `is:starred in:inbox ${baseQuery}`;
    queries.push(inboxQuery, starredQuery, sentQuery);

    // Use pagination to fetch all threads (Gmail API returns max 100 per page)
    const [inboxThreadIds, starredThreadIds, sentThreadIds] = await Promise.all(
      [
        this.fetchAllThreadsWithPagination(
          gmail,
          inboxQuery,
          QUERY_LIMITS.INBOX_TOTAL,
        ),
        this.fetchAllThreadsWithPagination(
          gmail,
          starredQuery,
          QUERY_LIMITS.INBOX_TOTAL,
        ),
        this.fetchAllThreadsWithPagination(
          gmail,
          sentQuery,
          QUERY_LIMITS.THREAD_QUERY,
        ),
      ],
    );

    const allThreadIds = new Set([
      ...inboxThreadIds,
      ...starredThreadIds,
      ...sentThreadIds,
    ]);
    return { allThreadIds, syncWindowStart };
  }

  private async performSync(
    userId: string,
    gmail: gmail_v1.Gmail,
    isInitialSync: boolean,
    options: {
      syncWindowHours?: number;
      providedThreadIds?: string[];
      isContinuation?: boolean;
      noDateFilter?: boolean;
    } = {},
  ): Promise<void> {
    const {
      syncWindowHours,
      providedThreadIds,
      isContinuation = false,
      noDateFilter = false,
    } = options;
    const syncStart = Date.now();
    let allThreadIds: Set<string>;
    let syncWindowStart: Date | null = null;
    const queries: string[] = [];

    if (providedThreadIds && providedThreadIds.length > 0) {
      this.logger.log(
        `[SYNC] Continuation job: processing ${providedThreadIds.length} provided thread IDs`,
      );
      allThreadIds = new Set(providedThreadIds);
    } else {
      ({ allThreadIds, syncWindowStart } = await this.fetchGmailThreadIds(
        userId,
        gmail,
        syncWindowHours,
        noDateFilter,
        queries,
      ));
    }

    const existingThreads = await this.emailsService.getThreadsByThreadIds(
      userId,
      Array.from(allThreadIds),
    );
    const existingThreadMap = new Map(
      existingThreads.map((thread) => [thread.threadId, thread]),
    );

    const updates = await this.processThreadBatches(
      userId,
      Array.from(allThreadIds),
      gmail,
      existingThreadMap,
      isInitialSync,
    );
    await this.applyThreadUpdates(userId, updates);

    // Only check starred threads and sync archived status for non-continuation jobs
    if (!isContinuation) {
      await this.checkExistingStarredThreads(userId, allThreadIds, gmail);
      await this.syncThreadArchivedStatus(userId, gmail);
    }

    // Log sync history (non-blocking)
    void this.syncHistoryService.logSyncAttempt({
      userId,
      provider: "gmail",
      syncWindowStart,
      queries,
      threadsFound: allThreadIds.size,
      durationMs: Date.now() - syncStart,
      isContinuation,
    });
  }

  private calculateSyncWindowStart(
    user: User | null,
    syncWindowHours?: number,
  ): Date {
    const fourHoursInMs = 4 * MILLISECONDS.HOUR;
    if (syncWindowHours !== undefined)
      return new Date(Date.now() - syncWindowHours * MILLISECONDS.HOUR);
    if (user?.lastEmailSyncAt)
      return new Date(user.lastEmailSyncAt.getTime() - fourHoursInMs);
    return new Date(Date.now() - DAYS.WEEK * MILLISECONDS.DAY);
  }

  private async processThreadBatches(
    userId: string,
    threadIds: string[],
    gmail: gmail_v1.Gmail,
    existingThreadMap: Map<
      string,
      {
        threadId: string;
        updatedAt: Date;
        starCount: number;
        isArchived: boolean;
      }
    >,
    isInitialSync: boolean,
  ): Promise<{
    starUpdates: { threadId: string; starCount: number }[];
    archivedUpdates: { threadId: string; isArchived: boolean }[];
  }> {
    const starUpdates: { threadId: string; starCount: number }[] = [];
    const archivedUpdates: { threadId: string; isArchived: boolean }[] = [];
    const BATCH_SIZE = 5;
    const MAX_THREADS = 500;

    for (
      let i = 0;
      i < Math.min(threadIds.length, MAX_THREADS);
      i += BATCH_SIZE
    ) {
      const batch = threadIds.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.filter(Boolean).map(async (threadId) => {
          try {
            const threadData = await gmail.users.threads.get({
              userId: "me",
              id: threadId,
              format: "full",
            });
            const thread = threadData.data;
            if (!thread.messages?.length) return;

            // Check ALL messages for STARRED label (stars are per-message in Gmail)
            const starCount = isThreadStarred(thread.messages) ? 3 : 0;

            // Archive status is based on latest message (if latest is in INBOX, thread is in inbox)
            const latestMessage = thread.messages[thread.messages.length - 1];
            const latestLabelIds = latestMessage.labelIds || [];
            const isArchived = !latestLabelIds.includes("INBOX");

            const existingThread = existingThreadMap.get(threadId);
            if (
              !existingThread ||
              existingThread.starCount !== starCount ||
              existingThread.isArchived !== isArchived
            ) {
              starUpdates.push({ threadId, starCount });
              archivedUpdates.push({ threadId, isArchived });
            }

            for (const message of thread.messages) {
              if (!message.id) continue;
              await this.processMessage(
                userId,
                message,
                starCount,
                isInitialSync,
              );
            }
          } catch (error) {
            if (isApiError(error) && error.code === HTTP_STATUS.NOT_FOUND) {
              this.logger.debug(
                `Thread ${threadId.substring(0, 10)}... not found`,
              );
            }
          }
        }),
      );
    }
    return { starUpdates, archivedUpdates };
  }

  private async processMessage(
    userId: string,
    message: gmail_v1.Schema$Message,
    starCount: number,
    isInitialSync: boolean,
  ): Promise<void> {
    const rawEmail = parseGmailMessage(message);
    if (!rawEmail) return;

    const existing = await this.emailsService.getEmailByMessageId(
      userId,
      message.id!,
    );
    if (existing) {
      const isReadInGmail = !(message.labelIds || []).includes("UNREAD");
      if (existing.isRead !== isReadInGmail) {
        await this.emailsService.updateEmail(existing.id, {
          isRead: isReadInGmail,
        });
      }
      return;
    }

    await this.emailsService.createEmail(
      userId,
      {
        ...rawEmail,
        starCount,
        labels: rawEmail.labelIds,
      } as EmailDataWithOptionalThreadProps,
      { skipBatching: isInitialSync },
    );
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
    processedIds: Set<string>,
    gmail: gmail_v1.Gmail,
  ): Promise<void> {
    const existingStarredThreads =
      await this.emailsService.getExistingStarredThreads(userId);
    const updates = await getExistingThreadUpdates(
      userId,
      existingStarredThreads,
      processedIds,
      gmail,
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

  private async syncThreadArchivedStatus(
    userId: string,
    gmail: gmail_v1.Gmail,
  ): Promise<void> {
    try {
      const [inboxThreadIdList, starredThreadIdList] = await Promise.all([
        this.fetchAllThreadsWithPagination(
          gmail,
          "in:inbox -label:SnoozedBearlyMail -label:VA-to-action",
          QUERY_LIMITS.INBOX_TOTAL,
        ),
        this.fetchAllThreadsWithPagination(
          gmail,
          "is:starred is:inbox -label:SnoozedBearlyMail -label:VA-to-action",
          QUERY_LIMITS.INBOX_TOTAL,
        ),
      ]);

      const inboxThreadIds = new Set(inboxThreadIdList);
      const starredThreadIds = new Set(starredThreadIdList);
      const dbThreads = await this.emailsService.getAllThreadsForSync(userId);

      const updates = dbThreads
        .filter((thread) => thread.syncStatus === "synced")
        .filter(
          (thread) =>
            thread.isArchived !== !inboxThreadIds.has(thread.threadId) ||
            thread.starCount !==
              (starredThreadIds.has(thread.threadId) ? 3 : 0),
        )
        .map((thread) => ({
          threadId: thread.threadId,
          isArchived: !inboxThreadIds.has(thread.threadId),
          starCount: starredThreadIds.has(thread.threadId) ? 3 : 0,
        }));

      if (updates.length > 0)
        await this.emailsService.batchUpdateThreadStatus(userId, updates, []);
    } catch (error) {
      this.logger.error("Error syncing thread archived/starred status:", error);
    }
  }

  private async handleSyncError(
    userId: string,
    user: User | null,
    error: unknown,
  ): Promise<never> {
    const formattedError = formatGaxiosError(error);
    logErrorToFile(
      `Error in syncEmails (userId: ${userId}) - ${formattedError}`,
      error,
      "GmailProvider",
    );

    if (isGmailAuthError(error)) {
      const currentUser = await this.usersService
        .findOneWithTokens(userId)
        .catch(() => user);
      const isRecentLogin = this.isWithinGracePeriod(currentUser);
      authLogger.logAuthFailure(
        userId,
        currentUser?.email || null,
        "syncEmails-gmailApi",
        error,
        { isRecentLogin, gracePeriodActive: isRecentLogin },
      );
      if (!isRecentLogin)
        await this.usersService.update(userId, { needsRelogin: true });
    }
    throw error;
  }

  /**
   * Verify the Gmail status of all non-archived threads in BearlyMail.
   * Checks each thread individually via the Gmail API and archives any that
   * have been archived in Gmail (INBOX label removed).
   *
   * Called by the 2-hour `verify-user-inbox-status` job to catch emails that
   * were archived in Gmail but not yet reflected in BearlyMail.
   */
  async verifyInboxStatus(userId: string): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) return;

    const allThreadIds =
      await this.emailsService.getAllNonArchivedThreadIds(userId);
    if (allThreadIds.length === 0) return;

    this.logger.log(
      `[VerifyInbox] Checking ${allThreadIds.length} non-archived threads for user ${userId}`,
    );

    const updates = await verifyThreadStatusesInGmail(
      userId,
      allThreadIds,
      gmail,
    );

    if (updates.length === 0) return;

    // Only apply updates where something actually changed
    const starUpdates = updates.filter((url) => url.starCount !== undefined);
    const archiveUpdates = updates.filter(
      (url) => url.isArchived !== undefined,
    );

    if (starUpdates.length > 0) {
      await this.emailsService.batchUpdateThreadStarCount(
        userId,
        starUpdates.map((user) => ({
          threadId: user.threadId,
          starCount: user.starCount,
        })),
      );
    }
    if (archiveUpdates.length > 0) {
      await this.emailsService.batchUpdateThreadArchivedStatuses(
        userId,
        archiveUpdates.map((user) => ({
          threadId: user.threadId,
          isArchived: user.isArchived,
        })),
      );
    }

    const archivedCount = updates.filter((user) => user.isArchived).length;
    this.logger.log(
      `[VerifyInbox] Done for user ${userId}: ${updates.length} threads checked, ${archivedCount} newly archived`,
    );
  }

  async scanHistory(userId: string): Promise<void> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken || !user.googleCalendarRefreshToken) {
      if (!user?.googleCalendarRefreshToken)
        await this.usersService.update(userId, { needsRelogin: true });
      return;
    }

    const gmail = await this.createGmailClient(userId);
    if (!gmail) return;

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DAYS.WEEK);
      // Include TRASH to capture deleted emails (treat as archived)
      const query = `after:${Math.floor(sevenDaysAgo.getTime() / MS_PER_SECOND)} (label:INBOX OR label:SENT OR label:TRASH)`;
      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: 300,
        q: query,
      });
      const messages = response.data.messages || [];

      await this.usersService.update(userId, {
        scanTotal: messages.length,
        scanProgress: 0,
      });
      this.progressUpdateCounters.delete(userId);

      const messageIds = messages.filter((msg) => msg.id).map((msg) => msg.id!);
      for (
        let i = 0;
        i < messageIds.length;
        i += QUERY_LIMITS.GMAIL_BATCH_SIZE
      ) {
        await Promise.all(
          messageIds
            .slice(i, i + QUERY_LIMITS.GMAIL_BATCH_SIZE)
            .map((messageId) =>
              this.boss.send(
                "scan-history-email",
                { userId, messageId },
                { priority: getJobPriority("scan-history-email", false) },
              ),
            ),
        );
      }
    } catch (error) {
      logErrorToFile(
        `Error in scanHistory (userId: ${userId})`,
        error,
        "GmailProvider",
      );
      if (isGmailAuthError(error))
        await this.usersService.update(userId, { needsRelogin: true });
      throw error;
    }
  }

  async processScanEmail(userId: string, messageId: string): Promise<void> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) return;

    const existing = await this.scanEmailService.findByMessageId(
      userId,
      messageId,
    );
    if (existing) {
      await this.updateScanProgress(userId);
      return;
    }

    const gmail = await this.createGmailClient(userId);
    if (!gmail) return;

    try {
      const fullMsg = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
      });
      const rawEmail = parseGmailMessage(fullMsg.data);
      if (!rawEmail) {
        await this.updateScanProgress(userId);
        return;
      }

      const labelIds = fullMsg.data.labelIds || [];
      const labelNames = await this.convertLabelIdsToNames(userId, labelIds);
      await this.scanEmailService.createScanEmail(userId, {
        ...rawEmail,
        isArchived: !labelIds.includes("INBOX") || labelIds.includes("TRASH"),
        labels: labelNames,
      });
      await this.updateScanProgress(userId);
    } catch (error) {
      await this.updateScanProgress(userId);
      if (isGmailAuthError(error))
        await this.usersService.update(userId, { needsRelogin: true });
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

  async sendReply(
    userId: string,
    threadId: string,
    to: string,
    subject: string,
    body: string,
    options?: SendReplyOptions,
  ): Promise<{ messageId: string; threadId: string }> {
    const { attachments, htmlBody, cc, bcc } = options ?? {};
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("Gmail account not connected.");

    const toRecipients = parseRecipientsFromString(to);
    const ccRecipients = cc ? parseRecipientsFromString(cc) : undefined;
    const bccRecipients = bcc ? parseRecipientsFromString(bcc) : undefined;

    const emailContent = buildEmailContent({
      to: toRecipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject,
      body,
      htmlBody,
      attachments,
      headers: {
        "In-Reply-To": `<${threadId}@mail.gmail.com>`,
        References: `<${threadId}@mail.gmail.com>`,
      },
    });

    try {
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodeEmailForGmail(emailContent), threadId },
      });
      return {
        messageId: response.data.id || "",
        threadId: response.data.threadId || threadId,
      };
    } catch (error) {
      if (isGmailAuthError(error))
        await this.usersService.update(userId, { needsRelogin: true });
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
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("Gmail account not connected.");

    const emailContent = buildEmailContent({
      to,
      subject,
      body,
      cc,
      bcc,
      attachments,
    });

    try {
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodeEmailForGmail(emailContent) },
      });
      return {
        messageId: response.data.id || "",
        threadId: response.data.threadId || "",
      };
    } catch (error) {
      if (isGmailAuthError(error))
        await this.usersService.update(userId, { needsRelogin: true });
      throw new Error("Failed to send email");
    }
  }

  async searchEmails(
    userId: string,
    query: string,
    maxResults = QUERY_LIMITS.SEARCH_DEFAULT_RESULTS,
  ): Promise<RawEmailMessage[]> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) return [];

    try {
      // Gmail API returns max 100 results per page, so we need to paginate
      const allMessages: gmail_v1.Schema$Message[] = [];
      let pageToken: string | undefined;
      // Safety limit to prevent infinite loops
      const MAX_PAGES = 10;
      let pageCount = 0;

      while (allMessages.length < maxResults && pageCount < MAX_PAGES) {
        const response = await gmail.users.messages.list({
          userId: "me",
          maxResults: Math.min(100, maxResults - allMessages.length),
          q: query,
          pageToken,
        });

        const messages = response.data.messages || [];
        allMessages.push(...messages);

        pageToken = response.data.nextPageToken || undefined;
        pageCount++;
        if (!pageToken || messages.length === 0) break;
      }

      const results: RawEmailMessage[] = [];

      for (const msg of allMessages) {
        if (!msg.id) continue;
        const fullMsg = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });
        const parsed = parseGmailMessage(fullMsg.data);
        if (parsed) results.push(parsed);
      }
      return results;
    } catch (error) {
      this.logger.error(`Failed to search emails for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Lightweight alternative to searchEmails for the debug endpoint.
   * Returns only thread IDs (no message bodies) using threads.list with pagination.
   * Avoids the N×messages.get calls that cause 504 timeouts on large mailboxes.
   */
  async getStarredInboxThreadIds(userId: string): Promise<string[]> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) {
      throw new Error("Gmail auth expired or not connected");
    }
    return this.fetchAllThreadsWithPagination(
      gmail,
      "is:starred in:inbox -label:SnoozedBearlyMail -label:VA-to-action",
      QUERY_LIMITS.INBOX_TOTAL,
    );
  }

  async addLabelToThread(
    userId: string,
    threadId: string,
    labelName: string,
  ): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("User not connected to Gmail");
    const labelId = await ensureLabelExists(
      gmail,
      labelName,
      this.labelCache,
      this.bearlyMailLabelCache,
      userId,
    );
    await gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: {
        addLabelIds: [labelId],
      },
    });
    this.logger.log(
      `[Gmail Label] Added label "${labelName}" to thread ${threadId}`,
    );
  }

  async archiveThread(userId: string, threadId: string): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("User not connected to Gmail");
    await archiveThreadInGmail(userId, threadId, gmail);
  }

  async unarchiveThread(userId: string, threadId: string): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("User not connected to Gmail");
    await unarchiveThreadInGmail(userId, threadId, gmail);
  }

  async trashThread(userId: string, threadId: string): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("User not connected to Gmail");
    await trashThreadInGmail(userId, threadId, gmail);
  }

  async syncStarStatusToGmail(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("User not connected to Gmail");
    await syncStarToGmail(userId, threadId, starCount, gmail);
  }

  async syncReadStatusToGmail(
    userId: string,
    messageId: string,
    isRead: boolean,
  ): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("User not connected to Gmail");
    await syncReadToGmail(userId, messageId, isRead, gmail);
  }

  async snoozeThread(
    userId: string,
    threadId: string,
    _snoozeUntil: Date,
  ): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("User not connected to Gmail");
    const snoozeLabelId = await ensureLabelExists(
      gmail,
      "SnoozedBearlyMail",
      this.labelCache,
      this.bearlyMailLabelCache,
      userId,
    );
    await snoozeThreadInGmail(userId, threadId, snoozeLabelId, gmail);
  }

  async unsnoozeThread(userId: string, threadId: string): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("User not connected to Gmail");
    const snoozeLabelId = await ensureLabelExists(
      gmail,
      "SnoozedBearlyMail",
      this.labelCache,
      this.bearlyMailLabelCache,
      userId,
    );
    await unsnoozeThreadInGmail(userId, threadId, snoozeLabelId, gmail);
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
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("User not connected to Gmail");

    const response = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    const attachmentBuffer = Buffer.from(response.data.data || "", "base64");

    return {
      attachmentBuffer,
      filename: attachmentMetadata?.filename || "attachment",
      mimeType: attachmentMetadata?.mimeType || "application/octet-stream",
      size: attachmentMetadata?.size || attachmentBuffer.length,
    };
  }

  async lookupByGmailUrlId(
    userId: string,
    urlId: string,
  ): Promise<{
    messageId: string;
    threadId: string;
    subject: string;
    from: string;
    receivedAt: Date | null;
  } | null> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) return null;

    const idsToTry = buildGmailUrlIdsToTry(urlId);

    const byMessage = await lookupGmailMessageByIds(gmail, idsToTry);
    if (byMessage) return byMessage;

    return lookupGmailThreadByIds(gmail, idsToTry);
  }
}
