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
   * Mark an email as read. The client calls this when the user opens an email,
   * so it also stamps `openedAt` the first time — the auto-archive proposal
   * miner's "opened" signal, which archiving (unlike `isRead`) never sets.
   */
  async markAsRead(
    userId: string,
    emailId: string,
    getEmailById: (userId: string, emailId: string) => Promise<Email>,
  ): Promise<Email> {
    await this.emailRepository
      .createQueryBuilder()
      .update(Email)
      .set({ isRead: true, openedAt: () => `COALESCE("openedAt", now())` })
      .where("id = :emailId", { emailId })
      .andWhere('"userId" = :userId', { userId })
      .execute();
    return getEmailById(userId, emailId);
  }

  /**
   * Record that the USER archived or deleted these threads. Must run before the
   * archive marks the threads' emails read, so "archived while unread" can
   * still be told apart. Idempotent: an email's first archive wins.
   */
  async recordUserArchive(userId: string, threadIds: string[]): Promise<void> {
    if (threadIds.length === 0) return;
    await this.emailRepository
      .createQueryBuilder()
      .update(Email)
      .set({
        archivedAt: () => "now()",
        archivedWhileUnread: () => `("isRead" = false AND "openedAt" IS NULL)`,
      })
      .where('"userId" = :userId', { userId })
      .andWhere('"threadId" IN (:...threadIds)', { threadIds })
      .andWhere('"archivedAt" IS NULL')
      .execute();
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
