import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GoogleAccount } from "../database/entities/google-account.entity";
import { UsersService } from "../users/users.service";

@Injectable()
export class GoogleAccountsService {
  private readonly logger = new Logger(GoogleAccountsService.name);

  constructor(
    @InjectRepository(GoogleAccount)
    private googleAccountRepository: Repository<GoogleAccount>,
    private usersService: UsersService,
  ) {}

  // eslint-disable-next-line max-params
  async create(
    userId: string,
    googleId: string,
    email: string,
    name: string,
    accessToken: string,
    refreshToken: string,
    isPrimary: boolean = false,
  ): Promise<GoogleAccount> {
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
      throw new NotFoundException("Google account not found");
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
      throw new NotFoundException("Google account not found");
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
      throw new NotFoundException("Google account not found");
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
