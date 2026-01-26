import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Office365Account } from "../database/entities/office365-account.entity";
import { UsersService } from "../users/users.service";

@Injectable()
export class Office365AccountsService {
  private readonly logger = new Logger(Office365AccountsService.name);

  constructor(
    @InjectRepository(Office365Account)
    private office365AccountRepository: Repository<Office365Account>,
    private usersService: UsersService,
  ) {}

  // eslint-disable-next-line max-params
  async create(
    userId: string,
    microsoftId: string,
    email: string,
    name: string,
    accessToken: string,
    refreshToken: string,
    isPrimary: boolean = false,
  ): Promise<Office365Account> {
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
    return this.office365AccountRepository.find({
      where: { userId, isActive: true },
      order: { isPrimary: "DESC", createdAt: "ASC" },
    });
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
      throw new NotFoundException("Office 365 account not found");
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
      throw new NotFoundException("Office 365 account not found");
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
      throw new NotFoundException("Office 365 account not found");
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
