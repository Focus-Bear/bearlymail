import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ScanEmail } from "../database/entities/scan-email.entity";

@Injectable()
export class ScanEmailService {
  constructor(
    @InjectRepository(ScanEmail)
    private scanEmailRepository: Repository<ScanEmail>,
  ) {}

  async createScanEmail(
    userId: string,
    emailData: Partial<ScanEmail>,
  ): Promise<ScanEmail> {
    const scanEmail = this.scanEmailRepository.create({
      ...emailData,
      userId,
    });
    return this.scanEmailRepository.save(scanEmail);
  }

  async findByMessageId(
    userId: string,
    messageId: string,
  ): Promise<ScanEmail | null> {
    return this.scanEmailRepository.findOne({
      where: { userId, messageId },
    });
  }

  async findAllForUser(userId: string): Promise<ScanEmail[]> {
    return this.scanEmailRepository.find({
      where: { userId },
      order: { receivedAt: "DESC" },
    });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.scanEmailRepository.delete({ userId });
  }

  async countForUser(userId: string): Promise<number> {
    return this.scanEmailRepository.count({ where: { userId } });
  }
}
