import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { Email } from '../database/entities/email.entity';
import { PriorityService } from '../priority/priority.service';

import { User } from '../database/entities/user.entity';

@Injectable()
export class EmailsService {
  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private priorityService: PriorityService,
  ) {}

  async getInbox(userId: number, includeBatched: boolean = false): Promise<Email[]> {
    const query = this.emailRepository
      .createQueryBuilder('email')
      .where('email.userId = :userId', { userId })
      .andWhere('email.isArchived = false')
      .andWhere('(email.isSnoozed = false OR email.snoozeUntil <= :now)', { now: new Date() });

    if (!includeBatched) {
      query.andWhere('(email.isBatched = false OR email.batchReleaseAt <= :now)', { now: new Date() });
    }

    // Check for urgent emails that should override batching
    query.orWhere('(email.userId = :userId AND email.isUrgent = true AND email.isArchived = false)', { userId });

    const emails = await query
      .orderBy('email.priorityScore', 'DESC')
      .addOrderBy('email.receivedAt', 'DESC')
      .getMany();

    // Recalculate priority for emails that need it
    for (const email of emails) {
      if (!email.priorityScore || email.priorityScore === 50) {
        email.priorityScore = await this.priorityService.calculatePriorityScore(userId, email);
        await this.emailRepository.save(email);
      }
    }

    // Re-sort after priority updates
    return emails.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  async getEmailById(userId: number, emailId: number): Promise<Email> {
    return this.emailRepository.findOne({
      where: { id: emailId, userId },
    });
  }

  async createEmail(userId: number, emailData: Partial<Email>): Promise<Email> {
    const email = this.emailRepository.create({
      ...emailData,
      userId,
    });

    // Calculate priority score
    email.priorityScore = await this.priorityService.calculatePriorityScore(userId, email);

    // Check if urgent (override batching)
    email.isUrgent = this.checkIfUrgent(email);

    // Apply batching if not urgent
    if (!email.isUrgent) {
      const user = await this.emailRepository.manager.findOne(User, { where: { id: userId } });
      const batchHours = user?.batchDeliveryHours || 6;
      email.isBatched = true;
      email.batchReleaseAt = new Date(Date.now() + batchHours * 60 * 60 * 1000);
    }

    return this.emailRepository.save(email);
  }

  private checkIfUrgent(email: Partial<Email>): boolean {
    const urgentKeywords = ['urgent', 'asap', 'critical', 'emergency', 'immediate'];
    const subjectLower = (email.subject || '').toLowerCase();
    const bodyLower = (email.body || '').toLowerCase();

    return urgentKeywords.some((keyword) => 
      subjectLower.includes(keyword) || bodyLower.includes(keyword)
    );
  }

  async markAsRead(userId: number, emailId: number): Promise<Email> {
    await this.emailRepository.update({ id: emailId, userId }, { isRead: true });
    return this.getEmailById(userId, emailId);
  }

  async archiveEmail(userId: number, emailId: number): Promise<void> {
    await this.emailRepository.update({ id: emailId, userId }, { isArchived: true });
  }

  async forceCheckNewEmails(userId: number): Promise<Email[]> {
    // This would typically trigger an email sync from the email provider
    // For now, we'll just return any batched emails that are ready
    const now = new Date();
    await this.emailRepository.update(
      {
        userId,
        isBatched: true,
        batchReleaseAt: LessThan(now),
      },
      { isBatched: false },
    );

    return this.getInbox(userId, true);
  }
}

