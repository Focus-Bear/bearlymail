import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { gmail_v1, google } from "googleapis";

import { QUERY_LIMITS } from "../../constants/query-limits";
import { MILLISECONDS, MINUTES } from "../../constants/time-constants";
import { UsersService } from "../../users/users.service";
import { InvalidTokenError } from "../../utils/errors";
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
import { isGmailAuthError } from "./gmail/gmail-sync";
import { GmailSyncService } from "./gmail-sync.service";

// Canonical implementation lives in email-address.utils.ts; re-exported for backward compatibility.
export { parseRecipientsFromString } from "../../utils/email-address.utils";
import { parseRecipientsFromString } from "../../utils/email-address.utils";

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
    if (!user.googleCalendarRefreshToken) {
      await this.gmailSyncService.handleMissingRefreshToken(
        userId,
        user,
        isRecentLogin,
      );
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
      await this.usersService.update(userId, { lastEmailSyncAt: new Date() });
    } catch (error) {
      await this.gmailSyncService.handleSyncError(userId, user, error);
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
    return this.gmailSyncService.fetchAllThreadsWithPagination(
      gmail,
      `is:starred ${GMAIL_INBOX_QUERY}`,
      QUERY_LIMITS.INBOX_TOTAL,
    );
  }

  async getInboxThreadIds(userId: string): Promise<string[]> {
    const gmail = await this.createGmailClient(userId);
    if (!gmail) {
      throw new Error("Gmail auth expired or not connected");
    }
    return this.gmailSyncService.fetchAllThreadsWithPagination(
      gmail,
      GMAIL_INBOX_QUERY,
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
