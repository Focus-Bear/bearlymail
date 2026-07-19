import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { Office365Account } from "../database/entities/office365-account.entity";
import { decryptOffice365AccountEntityForApi } from "../encryption/entity-api-decrypt.util";
import { UsersService } from "../users/users.service";

@Injectable()
export class Office365AccountsService {
  private readonly logger = new Logger(Office365AccountsService.name);

  constructor(
    @InjectRepository(Office365Account)
    private office365AccountRepository: Repository<Office365Account>,
    private usersService: UsersService,
  ) {}

  async create(options: {
    userId: string;
    microsoftId: string;
    email: string;
    name: string;
    accessToken: string;
    refreshToken: string;
    isPrimary?: boolean;
  }): Promise<Office365Account> {
    const {
      userId,
      microsoftId,
      email,
      name,
      accessToken,
      refreshToken,
      isPrimary = false,
    } = options;
    // If this is set as primary, unset other primary accounts
    if (isPrimary) {
      await this.office365AccountRepository.update(
        { userId, isPrimary: true },
        { isPrimary: false },
      );
    }

    const account = this.office365AccountRepository.create({
      userId,
      microsoftId,
      email,
      name,
      accessToken,
      refreshToken,
      isPrimary,
      isActive: true,
      needsRelogin: false,
    });

    return this.office365AccountRepository.save(account);
  }

  async findAllByUser(userId: string): Promise<Office365Account[]> {
    const accounts = await this.office365AccountRepository.find({
      where: { userId, isActive: true },
      order: { isPrimary: "DESC", createdAt: "ASC" },
    });
    for (const account of accounts) {
      decryptOffice365AccountEntityForApi(account);
    }
    return accounts;
  }

  async findPrimary(userId: string): Promise<Office365Account | null> {
    return this.office365AccountRepository.findOne({
      where: { userId, isPrimary: true, isActive: true },
    });
  }

  async findById(id: string, userId: string): Promise<Office365Account | null> {
    return this.office365AccountRepository.findOne({
      where: { id, userId, isActive: true },
    });
  }

  async updateTokens(
    id: string,
    userId: string,
    accessToken: string,
    refreshToken?: string,
  ): Promise<Office365Account> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException(ERROR_MESSAGES.OFFICE365_ACCOUNT_NOT_FOUND);
    }

    account.accessToken = accessToken;
    if (refreshToken) {
      account.refreshToken = refreshToken;
    }
    account.needsRelogin = false;

    return this.office365AccountRepository.save(account);
  }

  async setPrimary(id: string, userId: string): Promise<Office365Account> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException(ERROR_MESSAGES.OFFICE365_ACCOUNT_NOT_FOUND);
    }

    // Unset other primary accounts
    await this.office365AccountRepository.update(
      { userId, isPrimary: true },
      { isPrimary: false },
    );

    account.isPrimary = true;
    return this.office365AccountRepository.save(account);
  }

  async deactivate(id: string, userId: string): Promise<void> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException(ERROR_MESSAGES.OFFICE365_ACCOUNT_NOT_FOUND);
    }

    account.isActive = false;
    await this.office365AccountRepository.save(account);
  }

  async hasConnectedOffice365(userId: string): Promise<boolean> {
    const count = await this.office365AccountRepository.count({
      where: { userId, isActive: true },
    });
    return count > 0;
  }
}
