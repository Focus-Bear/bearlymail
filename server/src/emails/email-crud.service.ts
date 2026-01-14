import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Email } from "../database/entities/email.entity";

@Injectable()
export class EmailCrudService {
  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
  ) {}

  /**
   * Get email by ID
   */
  async getEmailById(userId: string, emailId: string): Promise<Email> {
    return this.emailRepository.findOne({
      where: { id: emailId, userId },
    });
  }

  /**
   * Get email by message ID
   */
  async getEmailByMessageId(userId: string, messageId: string): Promise<Email> {
    return this.emailRepository.findOne({
      where: { messageId, userId },
    });
  }

  /**
   * Update email
   */
  async updateEmail(
    emailId: string,
    updates: Partial<Email>,
  ): Promise<Email | null> {
    await this.emailRepository.update({ id: emailId }, updates);
    return this.emailRepository.findOne({ where: { id: emailId } });
  }
}
