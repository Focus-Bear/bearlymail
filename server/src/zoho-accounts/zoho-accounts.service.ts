import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { ZohoAccount } from "../database/entities/zoho-account.entity";
import { decryptZohoAccountEntityForApi } from "../encryption/entity-api-decrypt.util";
import { UsersService } from "../users/users.service";

export interface CreateZohoAccountOptions {
  userId: string;
  zohoId: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  accountsServer: string;
  isPrimary?: boolean;
}

@Injectable()
export class ZohoAccountsService {
  private readonly logger = new Logger(ZohoAccountsService.name);

  constructor(
    @InjectRepository(ZohoAccount)
    private zohoAccountRepository: Repository<ZohoAccount>,
    private usersService: UsersService,
  ) {}

  async update(id: string, updateData: Partial<ZohoAccount>): Promise<void> {
    await this.zohoAccountRepository.update(id, updateData);
  }

  async create(options: CreateZohoAccountOptions): Promise<ZohoAccount> {
    const {
      userId,
      zohoId,
      email,
      name,
      accessToken,
      refreshToken,
      accountsServer,
      isPrimary = false,
    } = options;

    // If this is set as primary, unset other primary accounts
    if (isPrimary) {
      await this.zohoAccountRepository.update(
        { userId, isPrimary: true },
        { isPrimary: false },
      );
    }

    const account = this.zohoAccountRepository.create({
      userId,
      zohoId,
      email,
      name,
      accessToken,
      refreshToken,
      accountsServer,
      isPrimary,
      isActive: true,
      needsRelogin: false,
    });

    return this.zohoAccountRepository.save(account);
  }

  async findAllByUser(userId: string): Promise<ZohoAccount[]> {
    const accounts = await this.zohoAccountRepository.find({
      where: { userId, isActive: true },
      order: { isPrimary: "DESC", createdAt: "ASC" },
    });
    for (const account of accounts) {
      decryptZohoAccountEntityForApi(account);
    }
    return accounts;
  }

  /**
   * Returns the account Zoho operations (sync, send, archive…) should act on.
   *
   * Prefers the explicitly-flagged primary, but falls back to the oldest active
   * account when none is flagged. Without this fallback an active-but-not-primary
   * account (e.g. after the primary was deactivated, or a reconnect edge case)
   * makes hasConnectedZoho/isConnected report "connected" while sync silently
   * skips with a misleading "not connected" log and no error — emails never sync.
   */
  async findPrimary(userId: string): Promise<ZohoAccount | null> {
    const primary = await this.zohoAccountRepository.findOne({
      where: { userId, isPrimary: true, isActive: true },
    });
    if (primary) {
      return primary;
    }
    return this.zohoAccountRepository.findOne({
      where: { userId, isActive: true },
      order: { createdAt: "ASC" },
    });
  }

  async findById(id: string, userId: string): Promise<ZohoAccount | null> {
    return this.zohoAccountRepository.findOne({
      where: { id, userId, isActive: true },
    });
  }

  async updateTokens(
    id: string,
    userId: string,
    accessToken: string,
    refreshToken?: string,
    accountsServer?: string,
  ): Promise<ZohoAccount> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException(ERROR_MESSAGES.ZOHO_ACCOUNT_NOT_FOUND);
    }

    account.accessToken = accessToken;
    if (refreshToken) {
      account.refreshToken = refreshToken;
    }
    if (accountsServer) {
      account.accountsServer = accountsServer;
    }
    account.needsRelogin = false;

    return this.zohoAccountRepository.save(account);
  }

  async setPrimary(id: string, userId: string): Promise<ZohoAccount> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException(ERROR_MESSAGES.ZOHO_ACCOUNT_NOT_FOUND);
    }

    // Unset other primary accounts
    await this.zohoAccountRepository.update(
      { userId, isPrimary: true },
      { isPrimary: false },
    );

    account.isPrimary = true;
    return this.zohoAccountRepository.save(account);
  }

  async deactivate(id: string, userId: string): Promise<void> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException(ERROR_MESSAGES.ZOHO_ACCOUNT_NOT_FOUND);
    }

    account.isActive = false;
    await this.zohoAccountRepository.save(account);
  }

  async hasConnectedZoho(userId: string): Promise<boolean> {
    const count = await this.zohoAccountRepository.count({
      where: { userId, isActive: true },
    });
    return count > 0;
  }
}
