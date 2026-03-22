import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { GoogleAccount } from "../database/entities/google-account.entity";
import { UsersService } from "../users/users.service";

export interface CreateGoogleAccountOptions {
  userId: string;
  googleId: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  isPrimary?: boolean;
}

@Injectable()
export class GoogleAccountsService {
  private readonly logger = new Logger(GoogleAccountsService.name);

  constructor(
    @InjectRepository(GoogleAccount)
    private googleAccountRepository: Repository<GoogleAccount>,
    private usersService: UsersService,
  ) {}

  async create(options: CreateGoogleAccountOptions): Promise<GoogleAccount> {
    const {
      userId,
      googleId,
      email,
      name,
      accessToken,
      refreshToken,
      isPrimary = false,
    } = options;

    // If this is set as primary, unset other primary accounts
    if (isPrimary) {
      await this.googleAccountRepository.update(
        { userId, isPrimary: true },
        { isPrimary: false },
      );
    }

    const account = this.googleAccountRepository.create({
      userId,
      googleId,
      email,
      name,
      accessToken,
      refreshToken,
      isPrimary,
      isActive: true,
      needsRelogin: false,
    });

    return this.googleAccountRepository.save(account);
  }

  async findAllByUser(userId: string): Promise<GoogleAccount[]> {
    return this.googleAccountRepository.find({
      where: { userId, isActive: true },
      order: { isPrimary: "DESC", createdAt: "ASC" },
    });
  }

  async findPrimary(userId: string): Promise<GoogleAccount | null> {
    return this.googleAccountRepository.findOne({
      where: { userId, isPrimary: true, isActive: true },
    });
  }

  async findById(id: string, userId: string): Promise<GoogleAccount | null> {
    return this.googleAccountRepository.findOne({
      where: { id, userId, isActive: true },
    });
  }

  async updateTokens(
    id: string,
    userId: string,
    accessToken: string,
    refreshToken?: string,
  ): Promise<GoogleAccount> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException(ERROR_MESSAGES.GOOGLE_ACCOUNT_NOT_FOUND);
    }

    account.accessToken = accessToken;
    if (refreshToken) {
      account.refreshToken = refreshToken;
    }
    account.needsRelogin = false;

    return this.googleAccountRepository.save(account);
  }

  async setPrimary(id: string, userId: string): Promise<GoogleAccount> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException(ERROR_MESSAGES.GOOGLE_ACCOUNT_NOT_FOUND);
    }

    // Unset other primary accounts
    await this.googleAccountRepository.update(
      { userId, isPrimary: true },
      { isPrimary: false },
    );

    account.isPrimary = true;
    return this.googleAccountRepository.save(account);
  }

  async deactivate(id: string, userId: string): Promise<void> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException(ERROR_MESSAGES.GOOGLE_ACCOUNT_NOT_FOUND);
    }

    account.isActive = false;
    await this.googleAccountRepository.save(account);
  }

  async hasConnectedGmail(userId: string): Promise<boolean> {
    const count = await this.googleAccountRepository.count({
      where: { userId, isActive: true },
    });
    return count > 0;
  }
}
