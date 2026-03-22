import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { gmail_v1, google } from "googleapis";
import PgBoss from "pg-boss";

import { authLogger } from "../../auth/auth-logger";
import { HTTP_STATUS } from "../../constants/http-status";
import { QUERY_LIMITS } from "../../constants/query-limits";
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
import { GmailRateLimitError, InvalidTokenError } from "../../utils/errors";
import {
  EmailDataWithOptionalThreadProps,
  EmailsService,
} from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import { SyncHistoryService } from "../sync-history.service";
import { GmailProvider } from "./gmail.provider";
import { parseGmailMessage } from "./gmail/gmail-message-parser";
import {
  getExistingThreadUpdates,
  isGmailAuthError,
  isThreadStarred,
  verifyThreadStatusesInGmail,
} from "./gmail/gmail-sync";

/** Shared Gmail query for fetching inbox threads (excludes snoozed + VA-to-action labels). */
const GMAIL_INBOX_QUERY =
  "in:inbox -label:SnoozedBearlyMail -label:VA-to-action";

/**
 * Handles all Gmail sync and scan operations, extracted from GmailProvider to keep
 * that class under the max-lines limit. Injected into GmailProvider via forwardRef.
 *
 * See issue #939 Phase 5c.
 */
@Injectable()
export class GmailSyncService {
  private readonly logger = new Logger(GmailSyncService.name);
  private readonly progressUpdateCounters = new Map<string, number>();

  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => EmailsService))
    private readonly emailsService: EmailsService,
    private readonly scanEmailService: ScanEmailService,
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private readonly syncHistoryService: SyncHistoryService,
    @Inject(forwardRef(() => GmailProvider))
    private readonly gmailProvider: GmailProvider,
  ) {}

  // ── Token / Auth Helpers ──────────────────────────────────────────────────

  isWithinGracePeriod(user: User | null): boolean {
    const fiveMinutesAgo = new Date(
      Date.now() - MINUTES.FIVE * MILLISECONDS.MINUTE,
    );
    return (
      !!user?.updatedAt &&
      new Date(user.updatedAt).getTime() > fiveMinutesAgo.getTime()
    );
  }

  async handleMissingRefreshToken(
    userId: string,
    user: User | null,
    isRecentLogin: boolean,
  ): Promise<never> {
    authLogger.logAuthFailure(
      userId,
      user?.email || null,
      "syncEmails-missingRefreshToken",
      new Error("Refresh token missing"),
      {},
    );
    if (!isRecentLogin && user && !user.needsRelogin) {
      await this.usersService.update(userId, { needsRelogin: true });
    }
    throw new Error("Refresh token missing - please log in again");
  }

  private isInvalidTokenError(error: unknown): boolean {
    const errAsGaxios = error as Record<string, unknown>;
    const errResponse = errAsGaxios?.response as
      | Record<string, unknown>
      | undefined;
    const responseData = errResponse?.data as { error?: string } | undefined;
    if (responseData?.error) {
      const code = responseData.error.toLowerCase();
      if (code === "invalid_token" || code === "invalid_grant") return true;
    }
    const message = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    return (
      message.includes("invalid_token") || message.includes("invalid token")
    );
  }

  async validateToken(userId: string, user: User): Promise<void> {
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
        await this.usersService.update(userId, { needsRelogin: true });
        throw new InvalidTokenError(
          "Google access token is invalid or revoked. User must re-authenticate.",
        );
      }
      throw error;
    }
  }

  async handleTokenValidationError(
    userId: string,
    user: User | null,
    error: unknown,
    isRecentLogin: boolean,
  ): Promise<never> {
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

  // ── Thread Fetching ───────────────────────────────────────────────────────

  async fetchThreadsPageWithRetry(
    gmail: gmail_v1.Gmail,
    query: string,
    maxResultsForPage: number,
    pageToken: string | undefined,
    pageCount: number,
  ): Promise<gmail_v1.Schema$ListThreadsResponse> {
    const MAX_RETRIES = 4;
    const MAX_BACKOFF_SECONDS = 32;
    const MIN_WAIT_MS = 500;
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < MAX_RETRIES) {
      try {
        const response = await gmail.users.threads.list({
          userId: "me",
          maxResults: maxResultsForPage,
          q: query,
          pageToken,
        });
        return response.data;
      } catch (error: unknown) {
        lastError = error;
        const errObj = error as {
          response?: { status?: number; headers?: Record<string, string> };
        };
        const status = errObj?.response?.status;
        const headers = errObj?.response?.headers ?? {};

        if (status === HTTP_STATUS.TOO_MANY_REQUESTS) {
          const retryAfterHeader =
            headers["retry-after"] || headers["Retry-After"];
          const retryAfterSeconds = retryAfterHeader
            ? parseInt(retryAfterHeader, 10)
            : undefined;
          const hint = retryAfterSeconds
            ? ` (Retry-After: ${retryAfterSeconds}s)`
            : "";
          this.logger.warn(
            `[GmailSync] Rate limit (429) on page ${pageCount + 1}${hint} — aborting`,
          );
          throw new GmailRateLimitError(
            `Gmail rate limit exceeded${hint}; sync aborted`,
            Number.isNaN(retryAfterSeconds) ? undefined : retryAfterSeconds,
          );
        }

        if (status && status >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
          attempt++;
          const waitSeconds = Math.min(2 ** attempt, MAX_BACKOFF_SECONDS);
          const waitMs = Math.max(MIN_WAIT_MS, waitSeconds * MS_PER_SECOND);
          this.logger.warn(
            `[GmailSync] threads.list returned ${status}; retry ${attempt}/${MAX_RETRIES} after ${waitMs}ms`,
          );
          await sleep(waitMs);
          continue;
        }
        throw error;
      }
    }

    this.logger.error(
      `[GmailSync] Failed to fetch threads.list after ${MAX_RETRIES} attempts`,
      lastError,
    );
    throw lastError;
  }

  async fetchAllThreadsWithPagination(
    gmail: gmail_v1.Gmail,
    query: string,
    maxResults: number,
  ): Promise<string[]> {
    const allThreadIds: string[] = [];
    let pageToken: string | undefined;
    const MAX_PAGES = 10;
    let pageCount = 0;

    while (allThreadIds.length < maxResults && pageCount < MAX_PAGES) {
      const maxResultsForPage = Math.min(100, maxResults - allThreadIds.length);
      const response = await this.fetchThreadsPageWithRetry(
        gmail,
        query,
        maxResultsForPage,
        pageToken,
        pageCount,
      );
      const threads = response?.threads || [];
      allThreadIds.push(
        ...threads
          .map((thread: gmail_v1.Schema$Thread) => thread.id)
          .filter(Boolean),
      );
      pageToken = response?.nextPageToken || undefined;
      pageCount++;
      if (!pageToken || threads.length === 0) break;
    }

    if (
      pageCount >= MAX_PAGES ||
      (pageToken && allThreadIds.length >= maxResults)
    ) {
      this.logger.warn(
        `[GmailSync] Pagination truncated: ${pageCount} pages, ${allThreadIds.length} ids`,
      );
    }
    return allThreadIds;
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

  async fetchGmailThreadIds(
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

  // ── Sync Core ─────────────────────────────────────────────────────────────

  async performSync(
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

    if (!isContinuation) {
      await this.checkExistingStarredThreads(userId, allThreadIds, gmail);
      await this.syncThreadArchivedStatus(userId, gmail);
    }

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

            const starCount = isThreadStarred(thread.messages) ? 3 : 0;
            const isArchived = !thread.messages.some((msg) =>
              (msg.labelIds ?? []).includes("INBOX"),
            );

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
          GMAIL_INBOX_QUERY,
          QUERY_LIMITS.INBOX_TOTAL,
        ),
        this.fetchAllThreadsWithPagination(
          gmail,
          `is:starred ${GMAIL_INBOX_QUERY}`,
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

  async handleSyncError(
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

  // ── Verify / Scan ─────────────────────────────────────────────────────────

  async verifyInboxStatus(userId: string): Promise<void> {
    const gmail = await this.gmailProvider.createGmailClientPublic(userId);
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

    const starUpdates = updates.filter((upd) => upd.starCount !== undefined);
    const archiveUpdates = updates.filter(
      (upd) => upd.isArchived !== undefined,
    );

    if (starUpdates.length > 0) {
      await this.emailsService.batchUpdateThreadStarCount(
        userId,
        starUpdates.map((upd) => ({
          threadId: upd.threadId,
          starCount: upd.starCount,
        })),
      );
    }
    if (archiveUpdates.length > 0) {
      await this.emailsService.batchUpdateThreadArchivedStatuses(
        userId,
        archiveUpdates.map((upd) => ({
          threadId: upd.threadId,
          isArchived: upd.isArchived,
        })),
      );
    }

    const archivedCount = updates.filter((upd) => upd.isArchived).length;
    this.logger.log(
      `[VerifyInbox] Done for user ${userId}: ${updates.length} checked, ${archivedCount} newly archived`,
    );
  }

  async scanHistory(userId: string): Promise<void> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken || !user.googleCalendarRefreshToken) {
      if (!user?.googleCalendarRefreshToken)
        await this.usersService.update(userId, { needsRelogin: true });
      return;
    }

    const gmail = await this.gmailProvider.createGmailClientPublic(userId);
    if (!gmail) return;

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - DAYS.WEEK);
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

    const gmail = await this.gmailProvider.createGmailClientPublic(userId);
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
      const labelNames = await this.gmailProvider.convertLabelIdsToNames(
        userId,
        labelIds,
      );
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
}
