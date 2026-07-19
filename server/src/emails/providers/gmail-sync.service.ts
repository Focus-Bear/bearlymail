import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { gmail_v1 } from "googleapis";
import type { PgBoss } from "pg-boss";

import { authLogger } from "../../auth/auth-logger";
import { createUserGoogleOAuthClient } from "../../auth/google-oauth-client";
import { SYNC_STATUS } from "../../constants/domain-statuses";
import { OAUTH_ERROR_CODES } from "../../constants/domain-types";
import { ERROR_MESSAGES } from "../../constants/error-messages";
import { HTTP_STATUS } from "../../constants/http-status";
import { INJECT_TOKENS } from "../../constants/inject-tokens";
import { JOB_NAMES } from "../../constants/job-names";
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
import { InvalidTokenError } from "../../utils/errors";
import {
  EmailDataWithOptionalThreadProps,
  EmailsService,
} from "../emails.service";
import { EmailAttachment } from "../interfaces/email-provider.interface";
import { ScanEmailService } from "../scan-email.service";
import { SyncHistoryService } from "../sync-history.service";
import {
  resolveMaxFetchResults,
  resolveSyncWindowStart,
  shouldFlagSyncWindowLimited,
} from "../sync-window-policy";
import { GmailProvider } from "./gmail.provider";
import { parseGmailMessage } from "./gmail/gmail-message-parser";
import {
  getExistingThreadUpdates,
  isGmailAuthError,
  isThreadStarred,
} from "./gmail/gmail-sync";
import {
  refreshAttachmentsFromGmailForThread,
  refreshAttachmentsFromGmailForUser,
} from "./gmail-sync.refresh-attachments";
import {
  fetchAllThreadsWithPagination,
  olderMailExistsBeyondWindow,
} from "./gmail-sync.thread-list";
import { verifyInboxStatusForUser } from "./gmail-sync.verify-inbox";

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
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
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
  ): Promise<never> {
    authLogger.logAuthFailure(
      userId,
      user?.email || null,
      "syncEmails-missingRefreshToken",
      new Error("Refresh token missing"),
      {},
    );
    await this.usersService.markNeedsRelogin(
      userId,
      "gmail_missing_refresh_token",
    );
    throw new Error(ERROR_MESSAGES.REFRESH_TOKEN_MISSING);
  }

  private isInvalidTokenError(error: unknown): boolean {
    const errAsGaxios = error as Record<string, unknown>;
    const errResponse = errAsGaxios?.response as
      | Record<string, unknown>
      | undefined;
    const responseData = errResponse?.data as { error?: string } | undefined;
    if (responseData?.error) {
      const code = responseData.error.toLowerCase();
      if (
        code === OAUTH_ERROR_CODES.INVALID_TOKEN ||
        code === OAUTH_ERROR_CODES.INVALID_GRANT
      )
        return true;
    }
    const message = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    return (
      message.includes("invalid_token") || message.includes("invalid token")
    );
  }

  async validateToken(userId: string, user: User): Promise<void> {
    const oauth2Client = createUserGoogleOAuthClient(
      this.usersService,
      userId,
      user.googleCalendarAccessToken,
      user.googleCalendarRefreshToken,
    );
    try {
      await oauth2Client.getAccessToken();
    } catch (error) {
      if (this.isInvalidTokenError(error)) {
        this.logger.warn(
          `[NEEDS_RELOGIN] validateToken: refresh_token invalid/revoked for user ${userId} ` +
            `(this is the usual cause of "logged out") — detail: ${formatGaxiosError(error)}`,
        );
        await this.usersService.markNeedsRelogin(userId, "gmail_invalid_token");
        throw new InvalidTokenError(ERROR_MESSAGES.GMAIL_RECONNECT_REQUIRED);
      }
      // Transient/non-auth failure (network, 5xx, rate limit): do NOT flag for
      // relogin — surface it so we can tell it apart from a real auth failure.
      this.logger.warn(
        `validateToken: non-auth token error for user ${userId} — NOT flagging relogin: ${formatGaxiosError(error)}`,
      );
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
      await this.usersService.markNeedsRelogin(
        userId,
        "gmail_token_refresh_failed",
      );
    }
    throw new Error("Token refresh failed - please log in again");
  }

  // ── Thread Fetching ───────────────────────────────────────────────────────

  /** Delegate kept as the public listing API (used by GmailProvider + specs). */
  async fetchAllThreadsWithPagination(
    gmail: gmail_v1.Gmail,
    query: string,
    maxResults: number,
  ): Promise<{ threadIds: string[]; hasMore: boolean }> {
    return fetchAllThreadsWithPagination(this.logger, gmail, query, maxResults);
  }

  async fetchGmailThreadIds(params: {
    userId: string;
    gmail: gmail_v1.Gmail;
    syncWindowHours: number | undefined;
    noDateFilter: boolean;
    queries: string[];
    isInitialSync: boolean;
  }): Promise<{
    allThreadIds: Set<string>;
    syncWindowStart: Date;
    inboxHasMore: boolean;
  }> {
    const { userId, gmail, syncWindowHours, noDateFilter, queries } = params;
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }
    const baseQuery = "-label:SnoozedBearlyMail -label:VA-to-action";

    // Sync-window policy: every fetch is clamped to the ongoing window — the
    // extended (noDateFilter) sync gets the full window instead of no filter.
    // Starred threads are fetched separately below regardless of age.
    const syncWindowStart = resolveSyncWindowStart({
      lastEmailSyncAt: user.lastEmailSyncAt,
      syncWindowHours,
      noDateFilter,
    });
    const syncWindowTimestamp = Math.floor(
      syncWindowStart.getTime() / MS_PER_SECOND,
    );
    const afterQuery = `after:${syncWindowTimestamp}`;
    const inboxQuery = `in:inbox ${baseQuery} ${afterQuery}`;
    const sentQuery = noDateFilter
      ? `in:sent ${baseQuery} newer_than:2d`
      : `in:sent ${baseQuery} ${afterQuery}`;
    if (noDateFilter) {
      this.logger.log(
        `[SYNC] noDateFilter=true: fetching the full ${QUERY_LIMITS.ONGOING_SYNC_WINDOW_DAYS}-day sync window`,
      );
    }

    const starredQuery = `is:starred in:inbox ${baseQuery}`;
    queries.push(inboxQuery, starredQuery, sentQuery);

    const [inboxResult, starredResult, sentResult] = await Promise.all([
      this.fetchAllThreadsWithPagination(
        gmail,
        inboxQuery,
        resolveMaxFetchResults(params.isInitialSync),
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
    ]);

    const allThreadIds = new Set([
      ...inboxResult.threadIds,
      ...starredResult.threadIds,
      ...sentResult.threadIds,
    ]);
    return { allThreadIds, syncWindowStart, inboxHasMore: inboxResult.hasMore };
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
      let inboxHasMore: boolean;
      ({ allThreadIds, syncWindowStart, inboxHasMore } =
        await this.fetchGmailThreadIds({
          userId,
          gmail,
          syncWindowHours,
          noDateFilter,
          queries,
          isInitialSync,
        }));

      if (isInitialSync) {
        // Hitting the fetch cap already flags the sync window as limited, so
        // the older-mail network probe is only needed when the cap wasn't hit.
        const olderMailExists = inboxHasMore
          ? false
          : await olderMailExistsBeyondWindow(
              this.logger,
              gmail,
              syncWindowStart,
            );
        if (
          shouldFlagSyncWindowLimited({
            isInitialSync,
            hitFetchCap: inboxHasMore,
            olderMailExists,
          })
        ) {
          await this.usersService.markSyncWindowLimited(userId);
        }
      }
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
      const hasStoredAttachments =
        Array.isArray(existing.attachments) && existing.attachments.length > 0;
      const parsedAttachments = rawEmail.attachments;
      const updates: { isRead?: boolean; attachments?: EmailAttachment[] } = {};
      if (existing.isRead !== isReadInGmail) {
        updates.isRead = isReadInGmail;
      }
      if (!hasStoredAttachments && parsedAttachments?.length) {
        updates.attachments = parsedAttachments;
      }
      if (Object.keys(updates).length > 0) {
        await this.emailsService.updateEmail(userId, existing.id, updates);
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
      { skipBatching: isInitialSync, countTowardVolume: !isInitialSync },
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
    const MAX_THREADS = QUERY_LIMITS.INBOX_TOTAL;

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
      const [inboxResult, starredResult] = await Promise.all([
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

      const inboxThreadIds = new Set(inboxResult.threadIds);
      const starredThreadIds = new Set(starredResult.threadIds);
      const dbThreads = await this.emailsService.getAllThreadsForSync(userId);

      const updates = dbThreads
        .filter((thread) => thread.syncStatus === SYNC_STATUS.SYNCED)
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
      this.logger.error(
        `Error syncing thread archived/starred status: ${formatGaxiosError(error)}`,
      );
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
      this.logger.warn(
        `[NEEDS_RELOGIN] syncEmails: Gmail API auth error for user ${userId} ` +
          `(gracePeriodActive=${isRecentLogin}, willFlag=${!isRecentLogin}) — detail: ${formattedError}`,
      );
      authLogger.logAuthFailure(
        userId,
        currentUser?.email || null,
        "syncEmails-gmailApi",
        error,
        { isRecentLogin, gracePeriodActive: isRecentLogin },
      );
      if (!isRecentLogin)
        await this.usersService.markNeedsRelogin(
          userId,
          "gmail_sync_auth_error",
        );
    } else {
      this.logger.warn(
        `syncEmails: non-auth error for user ${userId} — NOT flagging relogin: ${formattedError}`,
      );
    }
    throw error;
  }

  // ── Verify / Scan ─────────────────────────────────────────────────────────

  async verifyInboxStatus(userId: string): Promise<void> {
    const gmail = await this.gmailProvider.createGmailClientPublic(userId);
    if (!gmail) return;
    await verifyInboxStatusForUser(
      userId,
      gmail,
      this.emailsService,
      this.logger,
    );
  }

  async scanHistory(userId: string): Promise<void> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken || !user.googleCalendarRefreshToken) {
      if (!user?.googleCalendarRefreshToken)
        await this.usersService.markNeedsRelogin(
          userId,
          "gmail_scan_missing_refresh_token",
        );
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
                JOB_NAMES.SCAN_HISTORY_EMAIL,
                { userId, messageId },
                {
                  priority: getJobPriority(JOB_NAMES.SCAN_HISTORY_EMAIL, false),
                },
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
        await this.usersService.markNeedsRelogin(
          userId,
          "gmail_scan_auth_error",
        );
      throw error;
    }
  }

  async refreshAttachmentsFromGmail(
    userId: string,
    emailId: string,
  ): Promise<{
    gmailMessageId: string;
    attachments: EmailAttachment[] | null;
  }> {
    return refreshAttachmentsFromGmailForUser(
      {
        emailsService: this.emailsService,
        gmailProvider: this.gmailProvider,
        logger: this.logger,
      },
      userId,
      emailId,
    );
  }

  async refreshAttachmentsFromGmailForThread(
    userId: string,
    emailId: string,
  ): Promise<{
    threadId: string;
    results: Array<{
      emailId: string;
      gmailMessageId: string;
      attachments: EmailAttachment[] | null;
      error?: string;
    }>;
  }> {
    return refreshAttachmentsFromGmailForThread(
      {
        emailsService: this.emailsService,
        gmailProvider: this.gmailProvider,
        logger: this.logger,
      },
      userId,
      emailId,
    );
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
        await this.usersService.markNeedsRelogin(
          userId,
          "gmail_scan_auth_error",
        );
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
}
