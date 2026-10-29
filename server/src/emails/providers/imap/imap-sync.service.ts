import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import type { ImapFlow } from "imapflow";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../../../constants/inject-tokens";
import { JOB_NAMES } from "../../../constants/job-names";
import { QUERY_LIMITS } from "../../../constants/query-limits";
import { MILLISECONDS } from "../../../constants/time-constants";
import { ImapAccount } from "../../../database/entities/imap-account.entity";
import { INBOX_MAILBOX } from "../../../imap-accounts/imap-session";
import { getJobPriority } from "../../../queue/job-priorities";
import { UsersService } from "../../../users/users.service";
import { EmailCrudService } from "../../email-crud.service";
import { providerSyncCreateEmailOptions } from "../../email-lifecycle.service";
import { EmailsService } from "../../emails.service";
import { RawEmailMessage } from "../../interfaces/email-provider.interface";
import { ScanEmailService } from "../../scan-email.service";
import {
  getOldestAllowedSyncDate,
  resolveMaxFetchResults,
  shouldFlagSyncWindowLimited,
} from "../../sync-window-policy";
import {
  fetchMessages,
  findMessageIdsPresent,
  type InboxSnapshotEntry,
  listInboxSnapshot,
} from "./imap-mailbox";

/** Bodies are downloaded in chunks to bound memory per IMAP FETCH. */
const FETCH_CHUNK_SIZE = 20;
const SCAN_HISTORY_LIMIT = 300;
const SCAN_PROGRESS_FLUSH_EVERY = 10;
const RFC822_ID_SEPARATOR = "@";

/**
 * IMAP thread IDs are RFC-822 message IDs (always contain "@"); Gmail,
 * Outlook and Zoho thread IDs never do. Archive detection must only judge
 * threads this provider owns, or a user's Gmail threads would be archived
 * for being absent from their IMAP inbox.
 */
function isImapThreadId(threadId: string): boolean {
  return threadId.includes(RFC822_ID_SEPARATOR);
}

@Injectable()
export class ImapSyncService {
  private readonly logger = new Logger(ImapSyncService.name);

  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => EmailsService))
    private readonly emailsService: EmailsService,
    private readonly emailCrudService: EmailCrudService,
    private readonly scanEmailService: ScanEmailService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  async syncInbox(
    client: ImapFlow,
    account: ImapAccount,
    isInitialSync: boolean,
  ): Promise<void> {
    const { userId } = account;
    const fetchLimit = resolveMaxFetchResults(isInitialSync);
    const snapshot = await listInboxSnapshot(client, {
      since: getOldestAllowedSyncDate(),
      limit: fetchLimit,
      host: account.imapHost,
    });
    if (
      shouldFlagSyncWindowLimited({
        isInitialSync,
        hitFetchCap: snapshot.hitLimit,
        olderMailExists: snapshot.hitLimit,
      })
    ) {
      await this.usersService.markSyncWindowLimited(userId);
    }

    const newEntries = await this.syncReadStateAndFilterNew(
      userId,
      snapshot.entries,
    );
    const stored = await this.storeNewMessages(
      client,
      userId,
      newEntries,
      isInitialSync,
    );
    await this.applyThreadState(userId, stored);
    await this.detectExternallyArchivedThreads(client, account);
  }

  /**
   * Mirrors read/unread changes made in other clients onto stored mail and
   * returns only the messages we have never imported.
   */
  private async syncReadStateAndFilterNew(
    userId: string,
    entries: InboxSnapshotEntry[],
  ): Promise<InboxSnapshotEntry[]> {
    const known = await this.emailCrudService.getReadStatesByMessageIds(
      userId,
      entries.map((entry) => entry.messageId),
    );
    const newEntries: InboxSnapshotEntry[] = [];
    for (const entry of entries) {
      const existing = known.get(entry.messageId);
      if (!existing) {
        newEntries.push(entry);
      } else if (existing.isRead !== entry.isRead) {
        await this.emailsService.updateEmail(userId, existing.id, {
          isRead: entry.isRead,
        });
      }
    }
    return newEntries;
  }

  private async storeNewMessages(
    client: ImapFlow,
    userId: string,
    entries: InboxSnapshotEntry[],
    isInitialSync: boolean,
  ): Promise<RawEmailMessage[]> {
    const stored: RawEmailMessage[] = [];
    for (let i = 0; i < entries.length; i += FETCH_CHUNK_SIZE) {
      const chunk = entries.slice(i, i + FETCH_CHUNK_SIZE);
      const rawEmails = await fetchMessages(client, INBOX_MAILBOX, chunk);
      for (const rawEmail of rawEmails) {
        try {
          await this.emailsService.createEmail(
            userId,
            rawEmail,
            providerSyncCreateEmailOptions(isInitialSync),
          );
          stored.push(rawEmail);
        } catch (error) {
          this.logger.warn(
            `Failed to store IMAP message ${rawEmail.messageId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
    return stored;
  }

  /**
   * New mail is in INBOX, so its thread is not archived; a flagged message
   * stars its thread. Only new messages set stars — re-applying flags on
   * every sync would overwrite star levels the user chose in BearlyMail.
   */
  private async applyThreadState(
    userId: string,
    rawEmails: RawEmailMessage[],
  ): Promise<void> {
    if (rawEmails.length === 0) return;
    const starByThread = new Map<string, number>();
    for (const rawEmail of rawEmails) {
      starByThread.set(
        rawEmail.threadId,
        Math.max(starByThread.get(rawEmail.threadId) || 0, rawEmail.starCount),
      );
    }
    await this.emailsService.batchUpdateThreadStarCount(
      userId,
      [...starByThread.entries()].map(([threadId, starCount]) => ({
        threadId,
        starCount,
      })),
    );
    await this.emailsService.batchUpdateThreadArchivedStatuses(
      userId,
      [...starByThread.keys()].map((threadId) => ({
        threadId,
        isArchived: false,
      })),
    );
  }

  /**
   * Archives threads in BearlyMail whose messages have all left INBOX — the
   * user archived or deleted them in webmail or on their phone.
   */
  private async detectExternallyArchivedThreads(
    client: ImapFlow,
    account: ImapAccount,
  ): Promise<void> {
    const { userId } = account;
    const threadIds = (
      await this.emailsService.getNonArchivedThreadsNeedingCheck(
        userId,
        QUERY_LIMITS.PROVIDER_BATCH_SIZE,
      )
    ).filter(isImapThreadId);
    if (threadIds.length === 0) return;

    const messageIdsByThread = new Map<string, string[]>();
    for (const threadId of threadIds) {
      const emails = await this.emailsService.getThreadEmails(userId, threadId);
      messageIdsByThread.set(
        threadId,
        emails.map((email) => email.messageId),
      );
    }
    const inInbox = await findMessageIdsPresent(client, {
      mailbox: INBOX_MAILBOX,
      messageIds: [...messageIdsByThread.values()].flat(),
      host: account.imapHost,
    });

    const archived = [...messageIdsByThread.entries()]
      .filter(
        ([, messageIds]) =>
          messageIds.length > 0 && !messageIds.some((id) => inInbox.has(id)),
      )
      .map(([threadId]) => ({ threadId, isArchived: true }));
    if (archived.length > 0) {
      await this.emailsService.batchUpdateThreadArchivedStatuses(
        userId,
        archived,
      );
    }
    await this.emailsService.updateThreadsLastCheckedAt(userId, threadIds);
  }

  /** Onboarding: the last week of inbox mail, fed to the history analysis. */
  async scanHistory(client: ImapFlow, account: ImapAccount): Promise<void> {
    const { userId } = account;
    const snapshot = await listInboxSnapshot(client, {
      since: new Date(Date.now() - MILLISECONDS.WEEK),
      limit: SCAN_HISTORY_LIMIT,
      host: account.imapHost,
    });
    await this.usersService.update(userId, {
      scanTotal: snapshot.entries.length,
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

    for (let i = 0; i < snapshot.entries.length; i += FETCH_CHUNK_SIZE) {
      const chunk = snapshot.entries.slice(i, i + FETCH_CHUNK_SIZE);
      const rawEmails = await fetchMessages(client, INBOX_MAILBOX, chunk);
      for (const rawEmail of rawEmails) {
        await this.recordScanEmail(userId, rawEmail);
      }
      pendingProgress += chunk.length;
      if (pendingProgress >= SCAN_PROGRESS_FLUSH_EVERY) await flushProgress();
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

  private async recordScanEmail(
    userId: string,
    rawEmail: RawEmailMessage,
  ): Promise<void> {
    try {
      const existing = await this.scanEmailService.findByMessageId(
        userId,
        rawEmail.messageId,
      );
      if (existing) return;
      await this.scanEmailService.createScanEmail(userId, {
        ...rawEmail,
        isArchived: false,
        labels: [],
      });
    } catch (error) {
      this.logger.warn(
        `[scanHistory] Failed to scan IMAP message ${rawEmail.messageId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
