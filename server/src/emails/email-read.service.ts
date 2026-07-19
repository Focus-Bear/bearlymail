import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";

@Injectable()
export class EmailReadService {
  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
  ) {}

  /**
   * Mark an email as read
   */
  async markAsRead(
    userId: string,
    emailId: string,
    getEmailById: (userId: string, emailId: string) => Promise<Email>,
  ): Promise<Email> {
    await this.emailRepository.update(
      { id: emailId, userId },
      { isRead: true },
    );
    return getEmailById(userId, emailId);
  }

  /**
   * Mark an email as unread
   */
  async markAsUnread(
    userId: string,
    emailId: string,
    getEmailById: (userId: string, emailId: string) => Promise<Email>,
  ): Promise<Email> {
    await this.emailRepository.update(
      { id: emailId, userId },
      { isRead: false },
    );
    return getEmailById(userId, emailId);
  }

  /**
   * Bulk mark multiple emails as read
   */
  async bulkMarkAsRead(userId: string, emailIds: string[]): Promise<void> {
    if (emailIds.length === 0) return;
    await this.emailRepository.update(
      { id: In(emailIds), userId },
      { isRead: true },
    );
  }

  /**
   * Bulk mark multiple emails as unread
   */
  async bulkMarkAsUnread(userId: string, emailIds: string[]): Promise<void> {
    if (emailIds.length === 0) return;
    await this.emailRepository.update(
      { id: In(emailIds), userId },
      { isRead: false },
    );
  }
}
