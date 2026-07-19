import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { PgBoss } from "pg-boss";

import { AppleMailAccountsService } from "../../apple-mail-accounts/apple-mail-accounts.service";
import {
  AppleMailMessageRefService,
  AppleMailRef,
} from "../../apple-mail-accounts/apple-mail-message-ref.service";
import {
  AppleMailMessageItem,
  AppleMailMessageSummary,
  AppleMailScriptService,
} from "../../apple-mail-accounts/apple-mail-script.service";
import { INJECT_TOKENS } from "../../constants/inject-tokens";
import { JOB_NAMES } from "../../constants/job-names";
import { QUERY_LIMITS } from "../../constants/query-limits";
import { MILLISECONDS } from "../../constants/time-constants";
import { Email } from "../../database/entities/email.entity";
import { getJobPriority } from "../../queue/job-priorities";
import { UsersService } from "../../users/users.service";
import { EmailsService } from "../emails.service";
import {
  EmailAttachmentData,
  EmailProvider,
  EmailRecipient,
  RawEmailMessage,
  SendReplyOptions,
  SyncEmailsOptions,
} from "../interfaces/email-provider.interface";
import { ScanEmailService } from "../scan-email.service";
import {
  getOldestAllowedSyncDate,
  resolveMaxFetchResults,
  shouldFlagSyncWindowLimited,
} from "../sync-window-policy";
import {
  normalizeMessageId,
  parseAppleMailMessage,
} from "./apple-mail/apple-mail-message-parser";

/** Detail fetches are chunked to bound single osascript run time. */
const DETAIL_CHUNK_SIZE = 20;
const SEARCH_SCAN_LIMIT = 500;
const SCAN_HISTORY_LIMIT = 300;

/**
 * EmailProvider backed by the local Mail.app via AppleScript/JXA. Only
 * functional when the server runs on the same Mac as the user's Mail
 * database. Follows the Zoho provider's persistence pattern: normalize to
 * RawEmailMessage and delegate all writes to EmailsService.
 *
 * Provider-specific notes:
 * - BearlyMail message/thread IDs are RFC-822 message IDs (threading derived
 *   from References/In-Reply-To headers — Mail.app exposes no thread ID),
 *   but all Mail.app operations use Mail's numeric message ids via the
 *   AppleMailMessageRef mapping, because reading RFC-822 IDs from Mail is
 *   ~300ms per message while numeric lookups take ~25ms.
 * - Star write-back maps starCount>0 to Mail's flagged status.
 * - Snoozing and labels stay BearlyMail-local (Mail.app has no equivalents).
 */
@Injectable()
export class AppleMailProvider implements EmailProvider {
  private readonly logger = new Logger(AppleMailProvider.name);

  constructor(
    private usersService: UsersService,
    @Inject(forwardRef(() => EmailsService))
    private emailsService: EmailsService,
    private scanEmailService: ScanEmailService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private appleMailAccountsService: AppleMailAccountsService,
    private appleMailScriptService: AppleMailScriptService,
    private appleMailMessageRefService: AppleMailMessageRefService,
  ) {}

  async isConnected(userId: string): Promise<boolean> {
    if (!this.appleMailScriptService.isSupported()) return false;
    return this.appleMailAccountsService.hasConnectedAppleMail(userId);
  }

  async getAccountInfo(userId: string): Promise<{
    email?: string;
    name?: string;
    isPrimary?: boolean;
  } | null> {
    const primaryAccount =
      await this.appleMailAccountsService.findPrimary(userId);
    if (!primaryAccount) return null;

    return {
      email: primaryAccount.email,
      name: primaryAccount.name,
      isPrimary: primaryAccount.isPrimary,
    };
  }

  private async getAccountNames(userId: string): Promise<string[]> {
    const accounts =
      await this.appleMailAccountsService.findActiveAccounts(userId);
    return accounts.map((account) => account.accountName);
  }

  async syncEmails(
    userId: string,
    _syncWindowHoursOrOptions?: number | SyncEmailsOptions,
  ): Promise<void> {
    const accountNames = await this.getAccountNames(userId);
    if (accountNames.length === 0) {
      this.logger.log(
        `User ${userId} has no Apple Mail accounts, skipping sync.`,
      );
      return;
    }

    const user = await this.usersService.findOne(userId);
    if (!user) {
      this.logger.warn(`User ${userId} not found`);
      return;
    }

    const isInitialSync = !user.lastEmailSyncAt;

    try {
      await this.performSync(userId, accountNames, isInitialSync);
    } finally {
      // Always advance lastEmailSyncAt once a sync has been attempted — a
      // null value makes every subsequent sync look initial (skipBatching),
      // permanently disabling batching. Same rationale as the other providers.
      await this.usersService.update(userId, { lastEmailSyncAt: new Date() });
    }
  }

  private async performSync(
    userId: string,
    accountNames: string[],
    isInitialSync: boolean,
  ): Promise<void> {
    const fetchLimit = resolveMaxFetchResults(isInitialSync);
    const summaries = await this.appleMailScriptService.fetchInboxSummaries({
      accountNames,
      sinceMs: getOldestAllowedSyncDate().getTime(),
      maxMessages: fetchLimit,
    });
    this.logger.debug(
      `[performSync] ${summaries.length} inbox messages across ${accountNames.length} Apple Mail account(s)`,
    );

    const hitFetchCap = summaries.length >= fetchLimit;
    if (
      shouldFlagSyncWindowLimited({
        isInitialSync,
        hitFetchCap,
        olderMailExists: hitFetchCap,
      })
    ) {
      await this.usersService.markSyncWindowLimited(userId);
    }

    const newSummaries = await this.syncKnownAndFilterNew(userId, summaries);
    const rawEmails = await this.fetchAndParse(userId, newSummaries);

    const starUpdates = new Map<string, number>();
    const archivedUpdates = new Map<string, boolean>();
    for (const rawEmail of rawEmails) {
      // Any flagged message marks its whole thread as starred; every synced
      // message is in the inbox, so its thread is not archived.
      starUpdates.set(
        rawEmail.threadId,
        Math.max(starUpdates.get(rawEmail.threadId) || 0, rawEmail.starCount),
      );
      archivedUpdates.set(rawEmail.threadId, false);

      try {
        await this.emailsService.createEmail(userId, rawEmail, {
          skipBatching: isInitialSync,
          countTowardVolume: !isInitialSync,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to store Apple Mail message ${rawEmail.messageId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (starUpdates.size > 0) {
      await this.emailsService.batchUpdateThreadStarCount(
        userId,
        [...starUpdates.entries()].map(([threadId, starCount]) => ({
          threadId,
          starCount,
        })),
      );
    }
    if (archivedUpdates.size > 0) {
      await this.emailsService.batchUpdateThreadArchivedStatuses(
        userId,
        [...archivedUpdates.entries()].map(([threadId, isArchived]) => ({
          threadId,
          isArchived,
        })),
      );
    }

    await this.detectExternallyArchivedThreads(userId, accountNames);
  }

  /**
   * Syncs read-status changes for already-imported messages and returns the
   * summaries that have no stored mapping yet (i.e. genuinely new mail).
   */
  private async syncKnownAndFilterNew(
    userId: string,
    summaries: AppleMailMessageSummary[],
  ): Promise<AppleMailMessageSummary[]> {
    const knownRefs = await this.appleMailMessageRefService.getByAppleIds(
      userId,
      summaries.map((summary) => summary.appleId),
    );
    const knownByAppleId = new Map(knownRefs.map((ref) => [ref.appleId, ref]));

    const newSummaries: AppleMailMessageSummary[] = [];
    for (const summary of summaries) {
      const ref = knownByAppleId.get(summary.appleId);
      if (!ref) {
        newSummaries.push(summary);
        continue;
      }
      const existing = await this.emailsService.getEmailByMessageId(
        userId,
        ref.messageId,
      );
      if (existing && existing.isRead !== summary.isRead) {
        await this.emailsService.updateEmail(userId, existing.id, {
          isRead: summary.isRead,
        });
      }
    }
    return newSummaries;
  }

  /**
   * Fetches full details for the given summaries, converts them to
   * RawEmailMessages, and records the RFC-822 ↔ Mail-numeric-id mapping.
   */
  private async fetchAndParse(
    userId: string,
    summaries: AppleMailMessageSummary[],
  ): Promise<RawEmailMessage[]> {
    const rawEmails: RawEmailMessage[] = [];
    for (let i = 0; i < summaries.length; i += DETAIL_CHUNK_SIZE) {
      const chunk = summaries.slice(i, i + DETAIL_CHUNK_SIZE);
      const details = await this.appleMailScriptService.fetchMessageDetails(
        chunk.map((summary) => ({
          accountName: summary.accountName,
          appleId: summary.appleId,
        })),
      );
      const detailByAppleId = new Map(
        details.map((detail) => [detail.appleId, detail]),
      );
      const refs: AppleMailRef[] = [];
      for (const summary of chunk) {
        const detail = detailByAppleId.get(summary.appleId);
        if (!detail) continue;
        const rawEmail = parseAppleMailMessage(summary, detail);
        if (!rawEmail) continue;
        rawEmails.push(rawEmail);
        refs.push({
          messageId: rawEmail.messageId,
          appleId: summary.appleId,
          accountName: summary.accountName,
        });
      }
      // Best-effort: fetchAndParse also serves read paths (search), which
      // must not fail because the mapping upsert did.
      try {
        await this.appleMailMessageRefService.upsertRefs(userId, refs);
      } catch (error) {
        this.logger.warn(
          `Failed to store Apple Mail message refs: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return rawEmails;
  }

  /**
   * Marks threads archived in BearlyMail when their messages have left every
   * Apple Mail inbox (the user archived/deleted them in Mail.app directly).
   * Uses the full inbox numeric-id listing, which is cheap (~1ms/message).
   */
  private async detectExternallyArchivedThreads(
    userId: string,
    accountNames: string[],
  ): Promise<void> {
    const threadsNeedingCheck =
      await this.emailsService.getNonArchivedThreadsNeedingCheck(
        userId,
        QUERY_LIMITS.PROVIDER_BATCH_SIZE,
      );
    if (threadsNeedingCheck.length === 0) return;

    const { appleIds } = await this.appleMailScriptService.listInboxAppleIds({
      accountNames,
    });
    const inboxAppleIds = new Set(appleIds);

    const archivedUpdates: { threadId: string; isArchived: boolean }[] = [];
    for (const threadId of threadsNeedingCheck) {
      const refs = await this.getThreadRefs(userId, threadId);
      if (refs.length === 0) continue;
      const anyInInbox = refs.some((ref) => inboxAppleIds.has(ref.appleId));
      if (!anyInInbox) {
        archivedUpdates.push({ threadId, isArchived: true });
      }
    }

    if (archivedUpdates.length > 0) {
      await this.emailsService.batchUpdateThreadArchivedStatuses(
        userId,
        archivedUpdates,
      );
    }
    await this.emailsService.updateThreadsLastCheckedAt(
      userId,
      threadsNeedingCheck,
    );
  }

  async scanHistory(userId: string): Promise<void> {
    const accountNames = await this.getAccountNames(userId);
    if (accountNames.length === 0) return;

    const sinceMs = Date.now() - MILLISECONDS.WEEK;
    const summaries = await this.appleMailScriptService.fetchInboxSummaries({
      accountNames,
      sinceMs,
      maxMessages: SCAN_HISTORY_LIMIT,
    });

    await this.usersService.update(userId, {
      scanTotal: summaries.length,
      scanProgress: 0,
    });

    let pendingProgress = 0;
    let scanComplete = false;
    const flushProgress = async (): Promise<void> => {
      if (pendingProgress === 0) return;
      const result = await this.usersService.incrementScanProgress(
        userId,
        pendingProgress,
      );
      pendingProgress = 0;
      if (result.isComplete) scanComplete = true;
    };

    for (let i = 0; i < summaries.length; i += DETAIL_CHUNK_SIZE) {
      const chunk = summaries.slice(i, i + DETAIL_CHUNK_SIZE);
      const rawEmails = await this.fetchAndParse(userId, chunk);
      for (const rawEmail of rawEmails) {
        try {
          const existing = await this.scanEmailService.findByMessageId(
            userId,
            rawEmail.messageId,
          );
          if (!existing) {
            await this.scanEmailService.createScanEmail(userId, {
              ...rawEmail,
              isArchived: false,
              labels: [],
            });
          }
        } catch (error) {
          this.logger.warn(
            `[scanHistory] Failed to scan message ${rawEmail.messageId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        pendingProgress++;
      }
      pendingProgress += chunk.length - rawEmails.length;
      if (pendingProgress >= 10) {
        await flushProgress();
      }
    }

    await flushProgress();
    if (scanComplete) {
      await this.boss.send(
        JOB_NAMES.ANALYZE_SCAN_RESULTS,
        { userId },
        { priority: getJobPriority(JOB_NAMES.ANALYZE_SCAN_RESULTS, false) },
      );
    }
    await this.usersService.update(userId, { hasScannedHistory: true });
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
    const threadEmails = await this.emailsService.getThreadEmails(
      userId,
      params.threadId,
      { limit: 1, order: "DESC" },
    );
    let replyTo: AppleMailMessageItem | undefined;
    if (threadEmails[0]?.messageId) {
      const refs = await this.appleMailMessageRefService.getByMessageIds(
        userId,
        [normalizeMessageId(threadEmails[0].messageId)],
      );
      replyTo = refs[0];
    }

    const primaryAccount =
      await this.appleMailAccountsService.findPrimary(userId);

    const result = await this.withAttachmentFiles(
      params.options?.attachments,
      (attachmentPaths) =>
        this.appleMailScriptService.sendMessage({
          senderEmail: primaryAccount?.email,
          senderName: primaryAccount?.name,
          to: this.parseRecipientList(params.to),
          cc: this.parseRecipientList(params.options?.cc),
          bcc: this.parseRecipientList(params.options?.bcc),
          subject: params.subject,
          body: params.body,
          attachmentPaths,
          replyTo,
        }),
    );

    if (!result.sent) {
      throw new Error(
        `Apple Mail failed to send reply: ${result.error || "unknown error"}`,
      );
    }

    return {
      messageId: result.messageId || `apple-mail-sent-${Date.now()}`,
      threadId: params.threadId,
    };
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
    const primaryAccount =
      await this.appleMailAccountsService.findPrimary(userId);

    const result = await this.withAttachmentFiles(
      params.attachments,
      (attachmentPaths) =>
        this.appleMailScriptService.sendMessage({
          senderEmail: primaryAccount?.email,
          senderName: primaryAccount?.name,
          to: params.to.map((recipient) => recipient.email),
          cc: (params.cc || []).map((recipient) => recipient.email),
          bcc: (params.bcc || []).map((recipient) => recipient.email),
          subject: params.subject,
          body: params.body,
          attachmentPaths,
        }),
    );

    if (!result.sent) {
      throw new Error(
        `Apple Mail failed to send email: ${result.error || "unknown error"}`,
      );
    }

    const messageId = result.messageId || `apple-mail-sent-${Date.now()}`;
    // A brand-new message starts its own thread; the RFC-822 ID is the root.
    return { messageId, threadId: messageId };
  }

  /**
   * Writes attachment buffers to temp files for the JXA Attachment API and
   * removes them after the send completes.
   */
  private async withAttachmentFiles<T>(
    attachments: EmailAttachmentData[] | undefined,
    action: (paths: string[]) => Promise<T>,
  ): Promise<T> {
    if (!attachments || attachments.length === 0) {
      return action([]);
    }
    const dir = await fs.mkdtemp(join(tmpdir(), "bearlymail-apple-mail-"));
    try {
      const paths: string[] = [];
      for (const attachment of attachments) {
        const filePath = join(dir, attachment.filename.replace(/[/\\]/g, "_"));
        await fs.writeFile(filePath, attachment.content);
        paths.push(filePath);
      }
      return await action(paths);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {
        this.logger.warn(`Failed to clean up attachment temp dir ${dir}`);
      });
    }
  }

  private parseRecipientList(list?: string): string[] {
    if (!list) return [];
    return list
      .split(",")
      .map((entry) => {
        const match = /<([^>]+)>/.exec(entry);
        return (match ? match[1] : entry).trim();
      })
      .filter(Boolean);
  }

  async searchEmails(
    userId: string,
    query: string,
    maxResults = QUERY_LIMITS.SEARCH_DEFAULT_RESULTS,
  ): Promise<RawEmailMessage[]> {
    const accountNames = await this.getAccountNames(userId);
    if (accountNames.length === 0) return [];

    const summaries = await this.appleMailScriptService.fetchInboxSummaries({
      accountNames,
      sinceMs: 0,
      maxMessages: SEARCH_SCAN_LIMIT,
    });

    const needle = query.toLowerCase();
    const matches = summaries
      .filter(
        (summary) =>
          summary.subject.toLowerCase().includes(needle) ||
          summary.sender.toLowerCase().includes(needle),
      )
      .slice(0, maxResults);

    return this.fetchAndParse(userId, matches);
  }

  /**
   * Thread contents are served from BearlyMail's own store: every synced
   * message is already persisted, and Mail.app offers no per-thread fetch.
   */
  async fetchThreadMessages(
    userId: string,
    threadId: string,
    limit = 50,
  ): Promise<RawEmailMessage[]> {
    const emails = await this.emailsService.getThreadEmails(userId, threadId, {
      limit,
      order: "ASC",
    });
    return emails.map((email) => this.emailEntityToRawMessage(email));
  }

  /**
   * Thread IDs received in [after, before), sourced from BearlyMail's synced
   * store. Mail.app has no Gmail-style date-range search, so context analysis
   * discovers historical threads from what we've already synced locally.
   */
  async getThreadIdsInRange(
    userId: string,
    after: Date,
    before: Date,
    limit: number,
  ): Promise<string[]> {
    return this.emailsService.getThreadIdsByReceivedRange(
      userId,
      after,
      before,
      limit,
    );
  }

  private emailEntityToRawMessage(email: Email): RawEmailMessage {
    return {
      messageId: email.messageId,
      threadId: email.threadId,
      subject: email.subject,
      from: email.from,
      fromName: email.fromName,
      to: email.to,
      cc: email.cc,
      body: email.body,
      htmlBody: email.htmlBody,
      starCount: 0,
      receivedAt: email.receivedAt,
      isRead: email.isRead,
    };
  }

  private async getThreadRefs(
    userId: string,
    threadId: string,
  ): Promise<AppleMailRef[]> {
    const emails = await this.emailsService.getThreadEmails(userId, threadId);
    const messageIds = emails
      .map((email) => normalizeMessageId(email.messageId))
      .filter(Boolean);
    return this.appleMailMessageRefService.getByMessageIds(userId, messageIds);
  }

  async archiveThread(userId: string, threadId: string): Promise<void> {
    await this.moveThread(userId, threadId, "archive");
  }

  async unarchiveThread(userId: string, threadId: string): Promise<void> {
    await this.moveThread(userId, threadId, "inbox");
  }

  async trashThread(userId: string, threadId: string): Promise<void> {
    await this.moveThread(userId, threadId, "trash");
  }

  private async moveThread(
    userId: string,
    threadId: string,
    target: "archive" | "inbox" | "trash",
  ): Promise<void> {
    const refs = await this.getThreadRefs(userId, threadId);
    if (refs.length === 0) return;
    const result = await this.appleMailScriptService.moveMessages({
      items: refs,
      target,
    });
    this.logger.debug(
      `moveThread(${target}): moved ${result.moved}/${refs.length} messages for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...`,
    );
  }

  async syncStarStatusToGmail(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void> {
    const refs = await this.getThreadRefs(userId, threadId);
    if (refs.length === 0) return;
    await this.appleMailScriptService.setFlagged({
      items: refs,
      flagged: starCount > 0,
    });
  }

  async snoozeThread(
    _userId: string,
    threadId: string,
    _snoozeUntil: Date,
  ): Promise<void> {
    this.logger.debug(
      `snoozeThread is BearlyMail-local for Apple Mail: ${threadId}`,
    );
  }

  async unsnoozeThread(_userId: string, threadId: string): Promise<void> {
    this.logger.debug(
      `unsnoozeThread is BearlyMail-local for Apple Mail: ${threadId}`,
    );
  }

  async addLabelToThread(
    _userId: string,
    threadId: string,
    labelName: string,
  ): Promise<void> {
    this.logger.debug(
      `addLabelToThread not supported for Apple Mail: ${threadId}, label=${labelName}`,
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
    const refs = await this.appleMailMessageRefService.getByMessageIds(userId, [
      normalizeMessageId(messageId),
    ]);
    if (refs.length === 0) {
      throw new Error(
        `No Apple Mail mapping for message ${messageId} — cannot fetch attachment`,
      );
    }

    const dir = await fs.mkdtemp(join(tmpdir(), "bearlymail-attachment-"));
    const targetPath = join(dir, "attachment.bin");
    try {
      const result = await this.appleMailScriptService.saveAttachment({
        accountName: refs[0].accountName,
        appleId: refs[0].appleId,
        attachmentId,
        attachmentName: attachmentMetadata?.filename,
        targetPath,
      });
      if (!result.saved) {
        throw new Error(
          `Apple Mail attachment download failed: ${result.error || "not found"}`,
        );
      }
      const attachmentBuffer = await fs.readFile(targetPath);
      return {
        attachmentBuffer,
        filename: attachmentMetadata?.filename || "attachment",
        mimeType: attachmentMetadata?.mimeType || "application/octet-stream",
        size: attachmentBuffer.length,
      };
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {
        this.logger.warn(`Failed to clean up attachment temp dir ${dir}`);
      });
    }
  }
}
