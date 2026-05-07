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
   *
   * Uses findOne + save() rather than repository.update() to ensure TypeORM
   * column transformers (e.g. encryptedJsonTransformer on `attachments`,
   * `labels`, `actionItemsJson`) are applied before writing to the database.
   * repository.update() bypasses transformers, causing encrypted-JSON fields
   * to be serialised by node-postgres as PostgreSQL array literals which
   * cannot be round-tripped back through the transformer on read.
   *
   * userId is required to prevent IDOR — only the owning user's email is
   * fetched and updated. Immutable fields (id, userId, receivedAt) are
   * stripped from updates before merging to prevent mass-assignment.
   */
  async updateEmail(
    userId: string,
    emailId: string,
    updates: Partial<Email>,
  ): Promise<Email | null> {
    const existing = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });
    if (!existing) return null;

    // Strip immutable fields to prevent mass-assignment overwrites
    const {
      id: _id,
      userId: _userId,
      receivedAt: _receivedAt,
      ...safeUpdates
    } = updates as Partial<Email> & {
      id?: string;
      userId?: string;
      receivedAt?: Date;
    };

    Object.assign(existing, safeUpdates);
    return this.emailRepository.save(existing);
  }
}
