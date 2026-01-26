import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ZohoAccount } from "../database/entities/zoho-account.entity";
import { UsersService } from "../users/users.service";

@Injectable()
export class ZohoAccountsService {
  private readonly logger = new Logger(ZohoAccountsService.name);

  constructor(
    @InjectRepository(ZohoAccount)
    private zohoAccountRepository: Repository<ZohoAccount>,
    private usersService: UsersService,
  ) {}

  // eslint-disable-next-line max-params
  async create(
    userId: string,
    zohoId: string,
    email: string,
    name: string,
    accessToken: string,
    refreshToken: string,
    isPrimary: boolean = false,
  ): Promise<ZohoAccount> {
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
      isPrimary,
      isActive: true,
      needsRelogin: false,
    });

    return this.zohoAccountRepository.save(account);
  }

  async findAllByUser(userId: string): Promise<ZohoAccount[]> {
    return this.zohoAccountRepository.find({
      where: { userId, isActive: true },
      order: { isPrimary: "DESC", createdAt: "ASC" },
    });
  }

  async findPrimary(userId: string): Promise<ZohoAccount | null> {
    return this.zohoAccountRepository.findOne({
      where: { userId, isPrimary: true, isActive: true },
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
  ): Promise<ZohoAccount> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException("Zoho account not found");
    }

    account.accessToken = accessToken;
    if (refreshToken) {
      account.refreshToken = refreshToken;
    }
    account.needsRelogin = false;

    return this.zohoAccountRepository.save(account);
  }

  async setPrimary(id: string, userId: string): Promise<ZohoAccount> {
    const account = await this.findById(id, userId);
    if (!account) {
      throw new NotFoundException("Zoho account not found");
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
      throw new NotFoundException("Zoho account not found");
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
