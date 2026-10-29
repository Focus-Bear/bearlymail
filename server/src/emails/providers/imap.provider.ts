import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import type { ImapFlow, SearchObject } from "imapflow";
import { simpleParser } from "mailparser";

import { QUERY_LIMITS } from "../../constants/query-limits";
import { Email } from "../../database/entities/email.entity";
import { ImapAccount } from "../../database/entities/imap-account.entity";
import {
  ImapAccountsService,
  imapServerSettingsOf,
  smtpServerSettingsOf,
} from "../../imap-accounts/imap-accounts.service";
import {
  INBOX_MAILBOX,
  withImapSession,
} from "../../imap-accounts/imap-session";
import { isMailAuthFailure } from "../../imap-accounts/mail-connection-errors";
import {
  composeMessage,
  type OutgoingMessage,
  sendComposedMessage,
} from "../../imap-accounts/smtp-sender";
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
import {
  appendSentMessage,
  downloadMessageSource,
  FLAGGED_FLAG,
  moveMessages,
  searchMailbox,
  setMessageFlag,
} from "./imap/imap-mailbox";
import {
  attachmentIdFor,
  DEFAULT_ATTACHMENT_MIME,
} from "./imap/imap-message-parser";
import {
  IMAP_SEARCH_SCOPE,
  translateSearchQuery,
} from "./imap/imap-search-query";
import { ImapSyncService } from "./imap/imap-sync.service";
import { KeyedSemaphore } from "./imap/keyed-semaphore";
import {
  buildReplyReferences,
  normalizeMessageId,
} from "./rfc822/rfc822-threading";

const THREAD_FETCH_DEFAULT_LIMIT = 50;
const DEFAULT_ATTACHMENT_FILENAME = "attachment";
/** Simultaneous IMAP sessions per user; see KeyedSemaphore for why. */
const MAX_SESSIONS_PER_USER = 2;

function formatRecipient(recipient: EmailRecipient): string {
  return recipient.name
    ? `${recipient.name} <${recipient.email}>`
    : recipient.email;
}

/** The same message can sit in two folders (e.g. a Bcc-to-self in INBOX and Sent). */
function uniqueByMessageId(messages: RawEmailMessage[]): RawEmailMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.messageId)) return false;
    seen.add(message.messageId);
    return true;
  });
}

function threadCriteria(threadId: string): SearchObject {
  const root = `<${normalizeMessageId(threadId)}>`;
  return {
    or: [{ header: { "message-id": root } }, { header: { references: root } }],
  };
}

function splitRecipientList(list?: string): string[] {
  return list ? [list] : [];
}

/**
 * EmailProvider for any mailbox reachable over IMAP (read) + SMTP (send) with
 * a password — Crazy Domains, cPanel and other hosted-domain mail.
 *
 * Provider-specific notes:
 * - IMAP has no thread IDs; threads come from the References chain (shared
 *   with Apple Mail), so BearlyMail thread IDs are root RFC-822 message IDs.
 * - UIDs change when messages move between folders, so every targeted
 *   operation locates messages by their Message-ID header.
 * - Archive moves to the account's Archive folder (created on connect when
 *   missing); stars map to \Flagged; snooze and labels stay BearlyMail-local.
 * - Like the OAuth providers, only the primary IMAP account is synced.
 */
@Injectable()
export class ImapProvider implements EmailProvider {
  private readonly logger = new Logger(ImapProvider.name);
  private readonly sessionLimiter = new KeyedSemaphore(MAX_SESSIONS_PER_USER);

  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => EmailsService))
    private readonly emailsService: EmailsService,
    private readonly imapAccountsService: ImapAccountsService,
    private readonly imapSyncService: ImapSyncService,
  ) {}

  async isConnected(userId: string): Promise<boolean> {
    return this.imapAccountsService.hasConnectedImap(userId);
  }

  async getAccountInfo(userId: string): Promise<{
    email?: string;
    name?: string;
    isPrimary?: boolean;
  } | null> {
    const account = await this.imapAccountsService.findPrimary(userId);
    if (!account) return null;
    return {
      email: account.email,
      name: account.name ?? undefined,
      isPrimary: account.isPrimary,
    };
  }

  /**
   * Runs `work` in an IMAP session for the user's primary account and
   * records whether the server accepted the stored credentials.
   */
  private async withAccountSession<T>(
    userId: string,
    work: (client: ImapFlow, account: ImapAccount) => Promise<T>,
  ): Promise<T | null> {
    const account = await this.imapAccountsService.findPrimary(userId);
    if (!account) return null;
    try {
      const result = await this.sessionLimiter.run(userId, () =>
        withImapSession(
          imapServerSettingsOf(account),
          this.imapAccountsService.sessionOptions,
          (client) => work(client, account),
        ),
      );
      if (account.lastError || account.needsRelogin) {
        await this.imapAccountsService.recordSyncOutcome(account.id, {
          error: null,
          needsRelogin: false,
        });
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.imapAccountsService.recordSyncOutcome(account.id, {
        error: message,
        needsRelogin: isMailAuthFailure(error),
      });
      throw error;
    }
  }

  async syncEmails(
    userId: string,
    _syncWindowHoursOrOptions?: number | SyncEmailsOptions,
  ): Promise<void> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      this.logger.warn(`User ${userId} not found`);
      return;
    }
    const isInitialSync = !user.lastEmailSyncAt;
    try {
      await this.withAccountSession(userId, (client, account) =>
        this.imapSyncService.syncInbox(client, account, isInitialSync),
      );
    } finally {
      // A null lastEmailSyncAt makes every sync look initial, which disables
      // batching — so advance it on every attempt, like the other providers.
      await this.usersService.update(userId, { lastEmailSyncAt: new Date() });
    }
  }

  async scanHistory(userId: string): Promise<void> {
    await this.withAccountSession(userId, (client, account) =>
      this.imapSyncService.scanHistory(client, account),
    );
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
    const [parent] = await this.emailsService.getThreadEmails(
      userId,
      params.threadId,
      { limit: 1, order: "DESC" },
    );
    // The thread ID is the chain's root, so root + parent is enough for every
    // client (and our own threading) to place the reply in this thread.
    const rootChain =
      parent && parent.messageId !== params.threadId ? [params.threadId] : [];
    const { messageId } = await this.send(userId, {
      to: splitRecipientList(params.to),
      cc: splitRecipientList(params.options?.cc),
      bcc: splitRecipientList(params.options?.bcc),
      subject: params.subject,
      text: params.body,
      html: params.options?.htmlBody,
      attachments: params.options?.attachments,
      inReplyTo: parent?.messageId,
      references: parent
        ? buildReplyReferences(rootChain, parent.messageId)
        : undefined,
    });
    return { messageId, threadId: params.threadId };
  }

  async sendEmail(
    userId: string,
    params: {
      to: EmailRecipient[];
      subject: string;
      body: string;
      htmlBody?: string;
      cc?: EmailRecipient[];
      bcc?: EmailRecipient[];
      attachments?: EmailAttachmentData[];
    },
  ): Promise<{ messageId: string; threadId: string }> {
    const { messageId } = await this.send(userId, {
      to: params.to.map(formatRecipient),
      cc: params.cc?.map(formatRecipient),
      bcc: params.bcc?.map(formatRecipient),
      subject: params.subject,
      // Without htmlBody, `body` is the HTML (interface contract).
      text: params.htmlBody ? params.body : "",
      html: params.htmlBody ?? params.body,
      attachments: params.attachments,
    });
    // A new message roots its own thread.
    return { messageId, threadId: messageId };
  }

  private async send(
    userId: string,
    message: Omit<OutgoingMessage, "from">,
  ): Promise<{ messageId: string }> {
    const account = await this.imapAccountsService.findPrimary(userId);
    if (!account) {
      throw new Error("No IMAP account connected for sending");
    }
    const composed = await composeMessage({
      ...message,
      from: { email: account.email, name: account.name ?? undefined },
    });
    await sendComposedMessage(
      smtpServerSettingsOf(account),
      this.imapAccountsService.sessionOptions,
      account.email,
      composed,
    );
    await this.saveToSentFolder(userId, account, composed.raw);
    return { messageId: composed.messageId };
  }

  /**
   * Hosted-domain SMTP servers don't file a copy in Sent, so we append the
   * exact bytes we sent. Best-effort: the mail already went out.
   */
  private async saveToSentFolder(
    userId: string,
    account: ImapAccount,
    raw: Buffer,
  ): Promise<void> {
    const { sentMailbox } = account;
    if (!sentMailbox) return;
    try {
      await this.withAccountSession(userId, (client) =>
        appendSentMessage(client, sentMailbox, raw),
      );
    } catch (error) {
      this.logger.warn(
        `Sent mail could not be saved to ${sentMailbox} for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private searchMailboxesFor(
    account: ImapAccount,
    scope: (typeof IMAP_SEARCH_SCOPE)[keyof typeof IMAP_SEARCH_SCOPE],
  ): string[] {
    const sent = account.sentMailbox ? [account.sentMailbox] : [];
    const archive = account.archiveMailbox ? [account.archiveMailbox] : [];
    if (scope === IMAP_SEARCH_SCOPE.SENT) return sent;
    if (scope === IMAP_SEARCH_SCOPE.ALL)
      return [INBOX_MAILBOX, ...archive, ...sent];
    return [INBOX_MAILBOX, ...archive];
  }

  async searchEmails(
    userId: string,
    query: string,
    maxResults = QUERY_LIMITS.SEARCH_DEFAULT_RESULTS,
  ): Promise<RawEmailMessage[]> {
    const { scope, criteria } = translateSearchQuery(query);
    const results = await this.withAccountSession(
      userId,
      async (client, account) => {
        const found: RawEmailMessage[] = [];
        for (const mailbox of this.searchMailboxesFor(account, scope)) {
          if (found.length >= maxResults) break;
          found.push(
            ...(await searchMailbox(client, {
              mailbox,
              criteria,
              limit: maxResults - found.length,
              host: account.imapHost,
            })),
          );
        }
        return uniqueByMessageId(found);
      },
    );
    return results ?? [];
  }

  /**
   * Serves synced threads from BearlyMail's store. Threads it has never
   * synced (e.g. archived mail found by context analysis) are fetched from the
   * server: the root message plus every message whose References contain it.
   */
  async fetchThreadMessages(
    userId: string,
    threadId: string,
    limit = THREAD_FETCH_DEFAULT_LIMIT,
  ): Promise<RawEmailMessage[]> {
    const emails = await this.emailsService.getThreadEmails(userId, threadId, {
      limit,
      order: "ASC",
    });
    if (emails.length > 0) {
      return emails.map((email) => this.emailEntityToRawMessage(email));
    }
    const messages = await this.withAccountSession(
      userId,
      async (client, account) => {
        const found: RawEmailMessage[] = [];
        for (const mailbox of this.searchMailboxesFor(
          account,
          IMAP_SEARCH_SCOPE.ALL,
        )) {
          found.push(
            ...(await searchMailbox(client, {
              mailbox,
              criteria: threadCriteria(threadId),
              limit,
              host: account.imapHost,
            })),
          );
        }
        return found;
      },
    );
    return uniqueByMessageId(messages ?? [])
      .sort(
        (earlier, later) =>
          earlier.receivedAt.getTime() - later.receivedAt.getTime(),
      )
      .slice(0, limit);
  }

  /**
   * Thread IDs received in [after, before) from BearlyMail's store, for
   * context analysis — same approach as Apple Mail, as IMAP has no cheap
   * cross-folder date-range thread listing.
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

  private async threadMessageIds(
    userId: string,
    threadId: string,
  ): Promise<string[]> {
    const emails = await this.emailsService.getThreadEmails(userId, threadId);
    return emails.map((email) => email.messageId).filter(Boolean);
  }

  private async moveThread(
    userId: string,
    threadId: string,
    route: (account: ImapAccount) => {
      sources: string[];
      destination: string | null;
    },
  ): Promise<void> {
    const messageIds = await this.threadMessageIds(userId, threadId);
    if (messageIds.length === 0) return;
    await this.withAccountSession(userId, async (client, account) => {
      const { sources, destination } = route(account);
      if (!destination) {
        this.logger.warn(
          `No destination folder for thread ${threadId}; left in place`,
        );
        return;
      }
      const moved = await moveMessages(client, {
        messageIds,
        sources,
        destination,
      });
      this.logger.debug(
        `Moved ${moved}/${messageIds.length} messages of thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)} to ${destination}`,
      );
    });
  }

  async archiveThread(userId: string, threadId: string): Promise<void> {
    await this.moveThread(userId, threadId, (account) => ({
      sources: [INBOX_MAILBOX],
      destination: account.archiveMailbox,
    }));
  }

  async unarchiveThread(userId: string, threadId: string): Promise<void> {
    await this.moveThread(userId, threadId, (account) => ({
      sources: account.archiveMailbox ? [account.archiveMailbox] : [],
      destination: INBOX_MAILBOX,
    }));
  }

  async trashThread(userId: string, threadId: string): Promise<void> {
    await this.moveThread(userId, threadId, (account) => ({
      sources: [
        INBOX_MAILBOX,
        ...(account.archiveMailbox ? [account.archiveMailbox] : []),
      ],
      destination: account.trashMailbox,
    }));
  }

  async syncStarStatusToGmail(
    userId: string,
    threadId: string,
    starCount: number,
  ): Promise<void> {
    const messageIds = await this.threadMessageIds(userId, threadId);
    if (messageIds.length === 0) return;
    await this.withAccountSession(userId, (client, account) =>
      setMessageFlag(client, {
        messageIds,
        mailboxes: [
          INBOX_MAILBOX,
          ...(account.archiveMailbox ? [account.archiveMailbox] : []),
        ],
        flag: FLAGGED_FLAG,
        enabled: starCount > 0,
      }),
    );
  }

  async snoozeThread(
    _userId: string,
    threadId: string,
    _snoozeUntil: Date,
  ): Promise<void> {
    this.logger.debug(`snoozeThread is BearlyMail-local for IMAP: ${threadId}`);
  }

  async unsnoozeThread(_userId: string, threadId: string): Promise<void> {
    this.logger.debug(
      `unsnoozeThread is BearlyMail-local for IMAP: ${threadId}`,
    );
  }

  async addLabelToThread(
    _userId: string,
    threadId: string,
    labelName: string,
  ): Promise<void> {
    this.logger.debug(
      `addLabelToThread is BearlyMail-local for IMAP: ${threadId}, label=${labelName}`,
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
    const source = await this.withAccountSession(userId, (client, account) =>
      downloadMessageSource(client, {
        messageId,
        mailboxes: this.searchMailboxesFor(account, IMAP_SEARCH_SCOPE.ALL),
      }),
    );
    if (!source) {
      throw new Error(`Message ${messageId} not found on the IMAP server`);
    }
    const parsed = await simpleParser(source);
    const attachment =
      parsed.attachments.find(
        (candidate, index) =>
          attachmentIdFor(candidate, index) === attachmentId,
      ) ??
      parsed.attachments.find(
        (candidate) =>
          !!attachmentMetadata &&
          candidate.filename === attachmentMetadata.filename,
      );
    if (!attachment) {
      throw new Error(
        `Attachment ${attachmentId} not found in message ${messageId}`,
      );
    }
    return {
      attachmentBuffer: attachment.content,
      filename:
        attachment.filename ||
        attachmentMetadata?.filename ||
        DEFAULT_ATTACHMENT_FILENAME,
      mimeType:
        attachment.contentType ||
        attachmentMetadata?.mimeType ||
        DEFAULT_ATTACHMENT_MIME,
      size: attachment.size,
    };
  }
}
