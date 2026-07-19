import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { AppleMailAccount } from "../database/entities/apple-mail-account.entity";
import { decryptAppleMailAccountEntityForApi } from "../encryption/entity-api-decrypt.util";
import { getJobPriority } from "../queue/job-priorities";
import { AppleMailScriptService } from "./apple-mail-script.service";

@Injectable()
export class AppleMailAccountsService {
  private readonly logger = new Logger(AppleMailAccountsService.name);

  constructor(
    @InjectRepository(AppleMailAccount)
    private appleMailAccountRepository: Repository<AppleMailAccount>,
    private appleMailScriptService: AppleMailScriptService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  isAvailable(): boolean {
    return this.appleMailScriptService.isSupported();
  }

  /**
   * Enumerates accounts configured in the local Mail.app and stores a row for
   * each (or only those named in accountNames). Existing rows are reactivated
   * rather than duplicated. The first stored account becomes primary.
   */
  async connect(
    userId: string,
    accountNames?: string[],
  ): Promise<AppleMailAccount[]> {
    if (!this.isAvailable()) {
      throw new BadRequestException(
        "Apple Mail is only available when the server runs on macOS",
      );
    }

    const localAccounts = await this.appleMailScriptService.listAccounts();
    const selected = accountNames?.length
      ? localAccounts.filter((account) => accountNames.includes(account.name))
      : localAccounts;

    if (selected.length === 0) {
      throw new BadRequestException(
        "No matching accounts found in Mail.app on this machine",
      );
    }

    const existing = await this.appleMailAccountRepository.find({
      where: { userId },
    });
    const hasPrimary = existing.some(
      (account) => account.isActive && account.isPrimary,
    );

    const connected: AppleMailAccount[] = [];
    let primaryAssigned = hasPrimary;
    for (const local of selected) {
      const email = local.emails[0] || local.name;
      const match = existing.find(
        (account) => account.accountName === local.name,
      );
      if (match) {
        match.isActive = true;
        match.email = email;
        match.name = local.fullName || local.name;
        if (!primaryAssigned) {
          match.isPrimary = true;
          primaryAssigned = true;
        }
        connected.push(await this.appleMailAccountRepository.save(match));
        continue;
      }
      const account = this.appleMailAccountRepository.create({
        userId,
        accountName: local.name,
        email,
        name: local.fullName || local.name,
        isActive: true,
        isPrimary: !primaryAssigned,
      });
      primaryAssigned = true;
      connected.push(await this.appleMailAccountRepository.save(account));
    }

    this.logger.log(
      `Connected ${connected.length} Apple Mail account(s) for user ${userId}`,
    );
    if (connected.length > 0) {
      this.queueEmailFetch(userId);
    }
    return connected;
  }

  /**
   * Kick off an immediate inbox sync for a freshly connected mailbox so the
   * inbox populates now instead of waiting for the next 5-minute fetch cron.
   * No `singletonSeconds` — dedupes against an in-flight job via singletonKey
   * but is never throttled away right after connecting.
   */
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
      .catch((err) => {
        this.logger.warn(
          `Failed to queue email fetch for newly connected Apple Mail user ${userId}: ${err}`,
        );
      });
  }

  async findAllByUser(userId: string): Promise<AppleMailAccount[]> {
    const accounts = await this.appleMailAccountRepository.find({
      where: { userId, isActive: true },
      order: { isPrimary: "DESC", createdAt: "ASC" },
    });
    for (const account of accounts) {
      decryptAppleMailAccountEntityForApi(account);
    }
    return accounts;
  }

  async findPrimary(userId: string): Promise<AppleMailAccount | null> {
    return this.appleMailAccountRepository.findOne({
      where: { userId, isPrimary: true, isActive: true },
    });
  }

  async findById(id: string, userId: string): Promise<AppleMailAccount | null> {
    return this.appleMailAccountRepository.findOne({
      where: { id, userId, isActive: true },
    });
  }

  /**
   * Active accounts without API-facing decryption — accountName is stored in
   * plaintext, so this is what the provider uses to address Mail.app.
   */
  async findActiveAccounts(userId: string): Promise<AppleMailAccount[]> {
    return this.appleMailAccountRepository.find({
      where: { userId, isActive: true },
      order: { isPrimary: "DESC", createdAt: "ASC" },
    });
  }

  async setPrimary(id: string, userId: string): Promise<AppleMailAccount> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException("Apple Mail account not found");
    }

    await this.appleMailAccountRepository.update(
      { userId, isPrimary: true },
      { isPrimary: false },
    );

    account.isPrimary = true;
    return this.appleMailAccountRepository.save(account);
  }

  async deactivate(id: string, userId: string): Promise<void> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException("Apple Mail account not found");
    }

    account.isActive = false;
    await this.appleMailAccountRepository.save(account);
  }

  async hasConnectedAppleMail(userId: string): Promise<boolean> {
    const count = await this.appleMailAccountRepository.count({
      where: { userId, isActive: true },
    });
    return count > 0;
  }
}
