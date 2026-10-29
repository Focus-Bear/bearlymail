import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import type { ImapFlow } from "imapflow";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import {
  BOOLEAN_STRING_VALUES,
  SELF_HOSTED_ENV_KEY,
} from "../constants/domain-types";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { ImapAccount } from "../database/entities/imap-account.entity";
import { getJobPriority } from "../queue/job-priorities";
import { ImapAccountSettingsDto } from "./dto/imap-account-settings.dto";
import { smtpServerFilesSentMail } from "./imap-server-presets";
import {
  archiveMailboxPathFor,
  detectSpecialMailboxes,
  type ImapServerSettings,
  type ImapSessionOptions,
  type SpecialMailboxes,
  withImapSession,
} from "./imap-session";
import {
  describeMailConnectionError,
  type MailConnectionFailure,
} from "./mail-connection-errors";
import { type SmtpServerSettings, verifySmtpSettings } from "./smtp-sender";

export type ConnectionTestResult =
  | { ok: true; mailboxes: SpecialMailboxes }
  | { ok: false; failure: MailConnectionFailure };

/** What the client may see about an account: never the credentials. */
export interface ImapAccountSummary {
  id: string;
  email: string;
  name: string | null;
  imapHost: string;
  smtpHost: string;
  isPrimary: boolean;
  needsRelogin: boolean;
  lastError: string | null;
}

export function imapServerSettingsOf(account: ImapAccount): ImapServerSettings {
  return {
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    username: account.username,
    password: account.password,
  };
}

export function smtpServerSettingsOf(account: ImapAccount): SmtpServerSettings {
  return {
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    username: account.username,
    password: account.password,
  };
}

function settingsFromDto(dto: ImapAccountSettingsDto): {
  imap: ImapServerSettings;
  smtp: SmtpServerSettings;
} {
  const username = dto.username?.trim() || dto.email.trim();
  return {
    imap: {
      host: dto.imapHost,
      port: dto.imapPort,
      secure: dto.imapSecure,
      username,
      password: dto.password,
    },
    smtp: {
      host: dto.smtpHost,
      port: dto.smtpPort,
      secure: dto.smtpSecure,
      username,
      password: dto.password,
    },
  };
}

function toSummary(account: ImapAccount): ImapAccountSummary {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    imapHost: account.imapHost,
    smtpHost: account.smtpHost,
    isPrimary: account.isPrimary,
    needsRelogin: account.needsRelogin,
    lastError: account.lastError,
  };
}

@Injectable()
export class ImapAccountsService {
  private readonly logger = new Logger(ImapAccountsService.name);
  readonly sessionOptions: ImapSessionOptions;

  constructor(
    @InjectRepository(ImapAccount)
    private readonly imapAccountRepository: Repository<ImapAccount>,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    configService: ConfigService,
  ) {
    this.sessionOptions = {
      allowPrivateHosts:
        configService.get<string>(SELF_HOSTED_ENV_KEY) ===
        BOOLEAN_STRING_VALUES.TRUE,
    };
  }

  /** Logs in over IMAP and SMTP without changing anything anywhere. */
  async testConnection(
    dto: ImapAccountSettingsDto,
  ): Promise<ConnectionTestResult> {
    return this.verifyConnection(dto, { createMissingArchive: false });
  }

  private async verifyConnection(
    dto: ImapAccountSettingsDto,
    options: { createMissingArchive: boolean },
  ): Promise<ConnectionTestResult> {
    const { imap, smtp } = settingsFromDto(dto);
    let mailboxes: SpecialMailboxes;
    try {
      mailboxes = await withImapSession(imap, this.sessionOptions, (client) =>
        this.findMailboxes(client, options),
      );
    } catch (error) {
      return { ok: false, failure: describeMailConnectionError("imap", error) };
    }
    try {
      await verifySmtpSettings(smtp, this.sessionOptions);
    } catch (error) {
      return { ok: false, failure: describeMailConnectionError("smtp", error) };
    }
    return { ok: true, mailboxes };
  }

  /**
   * Finds the Archive/Sent/Trash folders. On connect, creates Archive when the
   * server has none — archiving must move mail out of INBOX somewhere.
   */
  private async findMailboxes(
    client: ImapFlow,
    options: { createMissingArchive: boolean },
  ): Promise<SpecialMailboxes> {
    const listed = await client.list();
    const mailboxes = detectSpecialMailboxes(listed);
    if (mailboxes.archive || !options.createMissingArchive) return mailboxes;
    const archivePath = archiveMailboxPathFor(listed);
    await client.mailboxCreate(archivePath);
    return { ...mailboxes, archive: archivePath };
  }

  /**
   * Verifies the settings, then stores (or refreshes) the account and kicks
   * off the first sync. Reconnecting the same address updates it in place,
   * which is also how a user fixes a changed password.
   */
  async connect(
    userId: string,
    dto: ImapAccountSettingsDto,
  ): Promise<ImapAccountSummary> {
    const test = await this.verifyConnection(dto, {
      createMissingArchive: true,
    });
    if (test.ok === false) {
      throw new BadRequestException({
        message: "Could not connect to the mail server",
        failure: test.failure,
      });
    }

    const { imap } = settingsFromDto(dto);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.findActiveAccounts(userId);
    const match = existing.find((account) => account.email === email);
    const account =
      match ?? this.imapAccountRepository.create({ userId, email });
    Object.assign(account, {
      name: dto.name?.trim() || match?.name || null,
      username: imap.username,
      password: dto.password,
      imapHost: dto.imapHost.trim().toLowerCase(),
      imapPort: dto.imapPort,
      imapSecure: dto.imapSecure,
      smtpHost: dto.smtpHost.trim().toLowerCase(),
      smtpPort: dto.smtpPort,
      smtpSecure: dto.smtpSecure,
      archiveMailbox: test.mailboxes.archive,
      sentMailbox: smtpServerFilesSentMail(dto.smtpHost)
        ? null
        : test.mailboxes.sent,
      trashMailbox: test.mailboxes.trash,
      isActive: true,
      isPrimary: match?.isPrimary ?? existing.length === 0,
      needsRelogin: false,
      lastError: null,
    });
    const saved = await this.imapAccountRepository.save(account);
    this.logger.log(`Connected IMAP account ${saved.id} for user ${userId}`);
    this.queueEmailFetch(userId);
    return toSummary(saved);
  }

  /** Immediate first sync instead of waiting for the next fetch cron. */
  private queueEmailFetch(userId: string): void {
    this.boss
      .send(
        JOB_NAMES.FETCH_USER_EMAILS,
        { userId },
        {
          priority: getJobPriority(JOB_NAMES.FETCH_USER_EMAILS, true),
          singletonKey: `fetch-user-emails-${userId}`,
        },
      )
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to queue email fetch for new IMAP account of user ${userId}: ${String(error)}`,
        );
      });
  }

  async listSummaries(userId: string): Promise<ImapAccountSummary[]> {
    const accounts = await this.findActiveAccounts(userId);
    return accounts.map(toSummary);
  }

  /** Full rows including decrypted credentials — server-side use only. */
  async findActiveAccounts(userId: string): Promise<ImapAccount[]> {
    return this.imapAccountRepository.find({
      where: { userId, isActive: true },
      order: { isPrimary: "DESC", createdAt: "ASC" },
    });
  }

  async findPrimary(userId: string): Promise<ImapAccount | null> {
    const accounts = await this.findActiveAccounts(userId);
    return accounts[0] ?? null;
  }

  async hasConnectedImap(userId: string): Promise<boolean> {
    const count = await this.imapAccountRepository.count({
      where: { userId, isActive: true },
    });
    return count > 0;
  }

  async setPrimary(id: string, userId: string): Promise<ImapAccountSummary> {
    const account = await this.findOwnedAccount(id, userId);
    await this.imapAccountRepository.update(
      { userId, isPrimary: true },
      { isPrimary: false },
    );
    account.isPrimary = true;
    return toSummary(await this.imapAccountRepository.save(account));
  }

  /** Deletes the row so the stored password doesn't outlive the connection. */
  async disconnect(id: string, userId: string): Promise<void> {
    const account = await this.findOwnedAccount(id, userId);
    await this.imapAccountRepository.remove(account);
  }

  async recordSyncOutcome(
    accountId: string,
    outcome: { error: string | null; needsRelogin: boolean },
  ): Promise<void> {
    await this.imapAccountRepository.update(
      { id: accountId },
      { lastError: outcome.error, needsRelogin: outcome.needsRelogin },
    );
  }

  private async findOwnedAccount(
    id: string,
    userId: string,
  ): Promise<ImapAccount> {
    const account = await this.imapAccountRepository.findOne({
      where: { id, userId, isActive: true },
    });
    if (!account) throw new NotFoundException("Mail account not found");
    return account;
  }
}
