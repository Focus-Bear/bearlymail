import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { gmail_v1, google } from "googleapis";

import { createUserGoogleOAuthClient } from "../../auth/google-oauth-client";
import { QUERY_LIMITS } from "../../constants/query-limits";
import { MILLISECONDS, MINUTES } from "../../constants/time-constants";
import { formatGaxiosError } from "../../types/common";
import { UsersService } from "../../users/users.service";
import { InvalidTokenError } from "../../utils/errors";
import { GmailSearchResult } from "../email-search.types";
import { EmailsService } from "../emails.service";
import {
  EmailAttachmentData,
  EmailProvider,
  EmailRecipient,
  RawEmailMessage,
  SendReplyOptions,
} from "../interfaces/email-provider.interface";
import {
  buildGmailUrlIdsToTry,
  type GmailLookupAttempt,
  type GmailLookupHit,
  lookupGmailMessageByIds,
  lookupGmailThreadByIds,
} from "./gmail/gmail-lookup";
import {
  parseGmailMessage,
  parseGmailMetadata,
} from "./gmail/gmail-message-parser";
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
import { isGmailAuthError } from "./gmail/gmail-sync";
import { GmailSyncService } from "./gmail-sync.service";

// Canonical implementation lives in email-address.utils.ts; re-exported for backward compatibility.
export { parseRecipientsFromString } from "../../utils/email-address.utils";
import { ERROR_MESSAGES } from "../../constants/error-messages";
import { parseRecipientsFromString } from "../../utils/email-address.utils";

/**
 * Strips HTML tags and decodes common HTML entities to produce a plain-text
 * fallback body for multipart/alternative emails.
 */
function stripHtmlTags(html: string): string {
  return (
    html
      // `\b` word boundary avoids mis-matching tags like `<scripture>`/`<styles>`;
      // end tags tolerate whitespace/attributes (e.g. `</script foo>`), or a crafted
      // closing tag leaves executable-looking script text behind (CWE-116).
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code) =>
        String.fromCharCode(parseInt(code, 10)),
      )
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      // Decode `&amp;` LAST so `&amp;lt;` becomes `&lt;`, not `<` (double-escaping, CWE-116).
      .replace(/&amp;/g, "&")
      .trim()
  );
}

/** Shared Gmail query for fetching inbox threads (excludes snoozed + VA-to-action labels). */
const GMAIL_INBOX_QUERY =
  "in:inbox -label:SnoozedBearlyMail -label:VA-to-action";

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
    @Inject(forwardRef(() => GmailSyncService))
    private gmailSyncService: GmailSyncService,
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
      await this.handleReadAuthError(
        userId,
        "Failed to fetch Gmail labels",
        error,
      );
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
    if (!user?.googleCalendarAccessToken) {
      // Warn when attempting to create a client for a user without an access token.
      // Do not log PII like email address or tokens — userId is sufficient for traceability.
      this.logger.warn(
        `[GmailProvider] createGmailClient: no access token available for user ${userId}`,
      );
      return null;
    }

    return {
      email: user.email,
      name: user.name,
      // Legacy implementation - always primary
      isPrimary: true,
    };
  }

  /** Public accessor for GmailSyncService to create an authenticated client. */
  async createGmailClientPublic(
    userId: string,
  ): Promise<gmail_v1.Gmail | null> {
    return this.createGmailClient(userId);
  }

  private async createGmailClient(
    userId: string,
  ): Promise<gmail_v1.Gmail | null> {
    const user = await this.usersService.findOneWithTokens(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.warn(
        `[GmailProvider] createGmailClient: no access token for user ${userId}`,
      );
      return null;
    }

    const oauth2Client = createUserGoogleOAuthClient(
      this.usersService,
      userId,
      user.googleCalendarAccessToken,
      user.googleCalendarRefreshToken,
    );

    return google.gmail({ version: "v1", auth: oauth2Client });
  }

  /**
   * Handle an error caught from a non-mutating Gmail read/search call
   * (labels, search, thread-fetch) that swallows the failure and returns an
   * empty result rather than re-throwing.
   *
   * Terminal auth failures — a 403 "insufficient authentication scopes" or a
   * 401 / `invalid_grant` — mean the account's token can never succeed until
   * the user reconnects. Previously these were logged at ERROR (often with a
   * stack) on every sync/search cycle, producing ~1k/day of low-value spam
   * while the user got no signal to re-auth (#2218). For this class we instead
   * flag the account for re-login (via `markNeedsRelogin`, which is idempotent
   * and skips already-flagged users) and log a single WARN per account: if the
   * account is already flagged we stay silent, so the log fires once on the
   * cycle that first detects the failure rather than on every cycle after.
   * Genuinely unexpected errors keep their ERROR severity so real problems
   * stay visible.
   */
  private async handleReadAuthError(
    userId: string,
    context: string,
    error: unknown,
  ): Promise<void> {
    if (isGmailAuthError(error)) {
      try {
        const user = await this.usersService.findOneLightweight(userId);
        if (user && !user.needsRelogin) {
          await this.usersService.markNeedsRelogin(
            userId,
            "gmail_read_auth_error",
          );
          this.logger.warn(
            `${context} auth failure for user ${userId} — flagged needsRelogin, returning empty: ${formatGaxiosError(error)}`,
          );
        }
      } catch (dbError) {
        this.logger.error(
          `Database error while handling read auth error for user ${userId}:`,
          dbError,
        );
      }
      return;
    }
    this.logger.error(
      `${context} for user ${userId}: ${formatGaxiosError(error)}`,
    );
  }

  async syncEmails(
    userId: string,
    syncWindowHoursOrOptions?:
      | number
      | import("../interfaces/email-provider.interface").SyncEmailsOptions,
  ): Promise<void> {
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

    const isRecentLogin = this.gmailSyncService.isWithinGracePeriod(user);

    // Already flagged for re-auth: skip the sync entirely. The Gmail API call
    // would 401/403 again (e.g. insufficient scopes) and produce a verbose
    // per-cycle log cascade (handleSyncError + AuthLogger + provider-manager).
    // Sync resumes automatically once the user re-authenticates — login clears
    // needsRelogin. Respect the grace period so a just-logged-in user whose
    // flag hasn't been cleared yet isn't skipped. Logged at debug so this
    // steady-state skip itself adds no production log volume. See #2218.
    if (user.needsRelogin && !isRecentLogin) {
      this.logger.debug(
        `[GmailProvider] Skipping sync for user ${userId} — needsRelogin set (awaiting re-auth)`,
      );
      return;
    }

    if (!user.googleCalendarRefreshToken) {
      await this.gmailSyncService.handleMissingRefreshToken(userId, user);
    }

    const gmail = await this.createGmailClient(userId);
    if (!gmail) return;

    try {
      await this.gmailSyncService.validateToken(userId, user);
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        this.logger.warn(
          `[GmailProvider] Invalid token for user ${userId} — skipping sync, needsRelogin set`,
        );
        return;
      }
      await this.gmailSyncService.handleTokenValidationError(
        userId,
        user,
        error,
        isRecentLogin,
      );
    }

    try {
      const isInitialSync = !user.lastEmailSyncAt;
      await this.gmailSyncService.performSync(userId, gmail, isInitialSync, {
        syncWindowHours,
        providedThreadIds,
        isContinuation,
        noDateFilter,
      });
    } catch (error) {
      await this.gmailSyncService.handleSyncError(userId, user, error);
    } finally {
      // Always advance lastEmailSyncAt once a sync has been attempted, even if
      // performSync threw. Otherwise a sync that fails after creating some
      // emails leaves lastEmailSyncAt null, so every subsequent sync is treated
      // as an initial sync (skipBatching) — permanently disabling batching.
      await this.usersService.update(userId, { lastEmailSyncAt: new Date() });
    }
  }

  async verifyInboxStatus(userId: string): Promise<void> {
    return this.gmailSyncService.verifyInboxStatus(userId);
  }

  async scanHistory(userId: string): Promise<void> {
    return this.gmailSyncService.scanHistory(userId);
  }

  async processScanEmail(userId: string, messageId: string): Promise<void> {
    return this.gmailSyncService.processScanEmail(userId, messageId);
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
    const { threadId, to, subject, body, options } = params;
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
      this.logger.error(
        `sendReply failed for user ${userId} thread ${threadId}: ${formatGaxiosError(error)}`,
      );
      if (isGmailAuthError(error))
        await this.usersService.markNeedsRelogin(
          userId,
          "gmail_send_auth_error",
        );
      throw new Error(ERROR_MESSAGES.FAILED_TO_SEND_REPLY);
    }
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
    const { to, subject, body, cc, bcc, attachments } = params;
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error("Gmail account not connected.");

    const emailContent = buildEmailContent({
      to,
      subject,
      // plain-text fallback for email clients that don't render HTML
      body: stripHtmlTags(body),
      // HTML content from rich text editor
      htmlBody: body,
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
      this.logger.error(
        `sendEmail failed for user ${userId}: ${formatGaxiosError(error)}`,
      );
      if (isGmailAuthError(error))
        await this.usersService.markNeedsRelogin(
          userId,
          "gmail_send_auth_error",
        );
      throw new Error(ERROR_MESSAGES.FAILED_TO_SEND_EMAIL);
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

      // Fetch full messages concurrently in capped batches. Done serially this
      // loop was the dominant cost of search (~N sequential round-trips for N
      // hits); batching cuts wall-clock by ~the concurrency factor while keeping
      // result order and the existing auth-error semantics (any failure still
      // propagates to the catch below → handleReadAuthError).
      const SEARCH_FETCH_CONCURRENCY = 10;
      const results: RawEmailMessage[] = [];
      for (let i = 0; i < allMessages.length; i += SEARCH_FETCH_CONCURRENCY) {
        const batch = allMessages.slice(i, i + SEARCH_FETCH_CONCURRENCY);
        const parsedBatch = await Promise.all(
          batch.map(async (msg) => {
            if (!msg.id) return null;
            const fullMsg = await gmail.users.messages.get({
              userId: "me",
              id: msg.id,
              format: "full",
            });
            return parseGmailMessage(fullMsg.data);
          }),
        );
        for (const parsed of parsedBatch) {
          if (parsed) results.push(parsed);
        }
      }
      return results;
    } catch (error) {
      await this.handleReadAuthError(userId, "Failed to search emails", error);
      return [];
    }
  }

  async fetchThreadMessages(
    userId: string,
    threadId: string,
    limit = 50,
  ): Promise<RawEmailMessage[]> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) return [];

    try {
      const threadResponse = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });
      const messages = threadResponse.data.messages || [];
      return messages
        .slice(0, limit)
        .map((msg) => parseGmailMessage(msg))
        .filter((msg): msg is RawEmailMessage => msg !== null);
    } catch (error) {
      await this.handleReadAuthError(
        userId,
        "Failed to fetch thread messages",
        error,
      );
      return [];
    }
  }

  /**
   * Metadata-only Gmail search — ~10x faster than searchEmails.
   *
   * Fetches headers (Subject, From, To, Date) + snippet without downloading the
   * full MIME body.  Used by the instant search path when INSTANT_SEARCH_ENABLED=true.
   *
   * NOTE: Gmail API supports batch requests (up to 100 per batch) which could
   * reduce this to a single HTTP round-trip.  Worth exploring as a follow-up.
   *
   * TODO: For multi-instance deployments the enrichment job store should move to
   * Redis.  BearlyMail currently runs single-instance so in-memory is fine.
   */
  async searchEmailsMetadataOnly(
    userId: string,
    query: string,
    maxResults: number = QUERY_LIMITS.SEARCH_DEFAULT_RESULTS,
  ): Promise<GmailSearchResult[]> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) return [];

    try {
      const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: Math.min(100, maxResults),
        q: query,
      });

      const messages = response.data.messages || [];

      // Cap concurrent Gmail API calls to 10 to avoid rate-limit errors on large result sets.
      // Process messages in sequential batches of METADATA_FETCH_CONCURRENCY.
      const METADATA_FETCH_CONCURRENCY = 10;
      const allResults: Array<GmailSearchResult | null> = [];
      for (let i = 0; i < messages.length; i += METADATA_FETCH_CONCURRENCY) {
        const batch = messages.slice(i, i + METADATA_FETCH_CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (msg) => {
            if (!msg.id) return null;
            const detail = await gmail.users.messages.get({
              userId: "me",
              id: msg.id,
              format: "metadata",
              metadataHeaders: ["Subject", "From", "To", "Date"],
            });
            return parseGmailMetadata(detail.data);
          }),
        );
        allResults.push(...batchResults);
      }

      return allResults.filter(
        (result): result is GmailSearchResult => result !== null,
      );
    } catch (error) {
      await this.handleReadAuthError(userId, "Failed metadata search", error);
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
    const result = await this.gmailSyncService.fetchAllThreadsWithPagination(
      gmail,
      `is:starred ${GMAIL_INBOX_QUERY}`,
      QUERY_LIMITS.INBOX_TOTAL,
    );
    return result.threadIds;
  }

  async getInboxThreadIds(userId: string): Promise<string[]> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) {
      throw new Error("Gmail auth expired or not connected");
    }
    const result = await this.gmailSyncService.fetchAllThreadsWithPagination(
      gmail,
      GMAIL_INBOX_QUERY,
      QUERY_LIMITS.INBOX_TOTAL,
    );
    return result.threadIds;
  }

  async addLabelToThread(
    userId: string,
    threadId: string,
    labelName: string,
  ): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error(ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL);
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
    if (!gmail) throw new Error(ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL);
    await archiveThreadInGmail(userId, threadId, gmail);
  }

  async unarchiveThread(userId: string, threadId: string): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error(ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL);
    await unarchiveThreadInGmail(userId, threadId, gmail);
  }

  async trashThread(userId: string, threadId: string): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error(ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL);
    await trashThreadInGmail(userId, threadId, gmail);
  }

  async syncStarStatusToGmail(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error(ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL);
    await syncStarToGmail(userId, threadId, starCount, gmail);
  }

  async syncReadStatusToGmail(
    userId: string,
    messageId: string,
    isRead: boolean,
  ): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error(ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL);
    await syncReadToGmail(userId, messageId, isRead, gmail);
  }

  async snoozeThread(
    userId: string,
    threadId: string,
    _snoozeUntil: Date,
  ): Promise<void> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) throw new Error(ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL);
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
    if (!gmail) throw new Error(ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL);
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
    if (!gmail) throw new Error(ERROR_MESSAGES.NOT_CONNECTED_TO_GMAIL);

    try {
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
    } catch (error) {
      if (isGmailAuthError(error)) {
        await this.usersService.markNeedsRelogin(
          userId,
          "gmail_attachment_auth_error",
        );
        this.logger.warn(
          `getAttachment auth failure — flagged user ${userId} as needsRelogin: ${formatGaxiosError(error)}`,
        );
        throw new UnauthorizedException(
          ERROR_MESSAGES.GMAIL_RECONNECT_REQUIRED,
        );
      }
      this.logger.error(
        `getAttachment failed for user ${userId} message ${messageId}: ${formatGaxiosError(error)}`,
      );
      throw error;
    }
  }

  async lookupByGmailUrlId(
    userId: string,
    urlId: string,
  ): Promise<{
    hit: GmailLookupHit | null;
    diagnostics: {
      connectedEmail: string | null;
      idsTried: string[];
      attempts: GmailLookupAttempt[];
    };
  }> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) {
      throw new Error(
        `Gmail not connected for user ${userId} — ensure Gmail OAuth is authorised before using the debug URL lookup`,
      );
    }

    const idsToTry = buildGmailUrlIdsToTry(urlId);
    const attempts: GmailLookupAttempt[] = [];

    let connectedEmail: string | null = null;
    try {
      const profile = await gmail.users.getProfile({ userId: "me" });
      connectedEmail = profile.data.emailAddress ?? null;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch Gmail profile for user ${userId}: ${formatGaxiosError(error)}`,
      );
    }

    const byMessage = await lookupGmailMessageByIds(gmail, idsToTry, attempts);
    if (byMessage) {
      return {
        hit: byMessage,
        diagnostics: { connectedEmail, idsTried: idsToTry, attempts },
      };
    }

    const byThread = await lookupGmailThreadByIds(gmail, idsToTry, attempts);
    return {
      hit: byThread,
      diagnostics: { connectedEmail, idsTried: idsToTry, attempts },
    };
  }
}
