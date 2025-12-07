import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { FollowUp, FollowUpStatus } from '../database/entities/follow-up.entity';
import { EmailThread } from '../database/entities/email-thread.entity';
import { Email } from '../database/entities/email.entity';
import { LLMService } from '../llm/llm.service';

@Injectable()
export class FollowUpsService {
  private readonly logger = new Logger(FollowUpsService.name);

  constructor(
    @InjectRepository(FollowUp)
    private followUpRepository: Repository<FollowUp>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private llmService: LLMService,
  ) {}

  /**
   * Create a follow-up reminder after sending an email
   */
  async createFollowUp(
    userId: string,
    threadId: string,
    followUpDays: number,
    sentEmailId?: string,
  ): Promise<FollowUp> {
    // Find the email thread
    const emailThread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    // Get the latest emails in the thread to capture context
    const emails = await this.emailRepository.find({
      where: { userId, threadId },
      order: { receivedAt: 'DESC' },
      take: 10,
    });

    // Find the last email from "them" (not from user)
    const userEmails = emails.filter(e => e.from.includes('@') && !this.isFromUser(e, userId));
    const myEmails = emails.filter(e => this.isFromUser(e, userId));

    const lastTheirEmail = userEmails[0];
    const lastMyEmail = myEmails[0];

    const followUpDueAt = new Date();
    followUpDueAt.setDate(followUpDueAt.getDate() + followUpDays);

    const followUp = this.followUpRepository.create({
      userId,
      threadId,
      emailThreadId: emailThread?.id,
      sentEmailId,
      status: FollowUpStatus.AWAITING_REPLY,
      followUpDueAt,
      followUpDays,
      lastTheirReply: lastTheirEmail?.body?.substring(0, 2000),
      lastTheirReplyFrom: lastTheirEmail?.fromName || lastTheirEmail?.from,
      lastTheirReplyAt: lastTheirEmail?.receivedAt,
      lastMyReply: lastMyEmail?.body?.substring(0, 2000),
      lastMyReplyAt: lastMyEmail?.receivedAt,
      subject: emails[0]?.subject,
    });

    return this.followUpRepository.save(followUp);
  }

  /**
   * Get all follow-ups for a user that are due (awaiting reply tab)
   */
  async getDueFollowUps(userId: string): Promise<FollowUp[]> {
    const now = new Date();
    
    return this.followUpRepository.find({
      where: [
        {
          userId,
          status: FollowUpStatus.FOLLOW_UP_DUE,
        },
        {
          userId,
          status: FollowUpStatus.AWAITING_REPLY,
          followUpDueAt: LessThanOrEqual(now),
        },
      ],
      order: { followUpDueAt: 'ASC' },
    });
  }

  /**
   * Get all active follow-ups (awaiting reply, not yet due)
   */
  async getAwaitingReplyFollowUps(userId: string): Promise<FollowUp[]> {
    return this.followUpRepository.find({
      where: {
        userId,
        status: FollowUpStatus.AWAITING_REPLY,
      },
      order: { followUpDueAt: 'ASC' },
    });
  }

  /**
   * Update follow-up status when a reply is received
   */
  async markAsReplied(userId: string, threadId: string): Promise<void> {
    await this.followUpRepository.update(
      { userId, threadId, status: FollowUpStatus.AWAITING_REPLY },
      { status: FollowUpStatus.COMPLETED },
    );
    await this.followUpRepository.update(
      { userId, threadId, status: FollowUpStatus.FOLLOW_UP_DUE },
      { status: FollowUpStatus.COMPLETED },
    );
  }

  /**
   * Generate follow-up draft messages for all due follow-ups
   */
  async generateFollowUpDrafts(userId: string): Promise<FollowUp[]> {
    const dueFollowUps = await this.getDueFollowUps(userId);
    
    for (const followUp of dueFollowUps) {
      if (!followUp.draftFollowUp) {
        try {
          const draft = await this.llmService.generateFollowUpDraft(
            followUp.subject || 'Follow up',
            followUp.lastMyReply || '',
            followUp.lastTheirReply || '',
            followUp.lastTheirReplyFrom || 'them',
            followUp.followUpDays,
          );
          followUp.draftFollowUp = draft;
          await this.followUpRepository.save(followUp);
        } catch (error) {
          this.logger.error(`Error generating follow-up draft for ${followUp.id}:`, error);
        }
      }
      
      // Update status to FOLLOW_UP_DUE if past due date
      if (followUp.status === FollowUpStatus.AWAITING_REPLY && 
          followUp.followUpDueAt <= new Date()) {
        followUp.status = FollowUpStatus.FOLLOW_UP_DUE;
        await this.followUpRepository.save(followUp);
      }
    }
    
    return dueFollowUps;
  }

  /**
   * Update a follow-up draft
   */
  async updateDraft(followUpId: string, userId: string, draft: string): Promise<FollowUp> {
    const followUp = await this.followUpRepository.findOne({
      where: { id: followUpId, userId },
    });
    
    if (!followUp) {
      throw new Error('Follow-up not found');
    }
    
    followUp.draftFollowUp = draft;
    return this.followUpRepository.save(followUp);
  }

  /**
   * Mark a follow-up as completed (sent or cancelled)
   */
  async completeFollowUp(followUpId: string, userId: string, cancelled = false): Promise<void> {
    await this.followUpRepository.update(
      { id: followUpId, userId },
      { status: cancelled ? FollowUpStatus.CANCELLED : FollowUpStatus.COMPLETED },
    );
  }

  /**
   * Cancel a follow-up
   */
  async cancelFollowUp(followUpId: string, userId: string): Promise<void> {
    await this.completeFollowUp(followUpId, userId, true);
  }

  /**
   * Check if an email is from the user (sent by them)
   */
  private isFromUser(email: Email, userId: string): boolean {
    // This is a simplified check - in production you'd compare against user's email
    // For now, we check if the email was sent (has certain characteristics)
    // A better approach would be to check the email labels for SENT
    return email.labels?.includes('SENT') || false;
  }

  /**
   * Get a single follow-up by ID
   */
  async getFollowUp(followUpId: string, userId: string): Promise<FollowUp | null> {
    return this.followUpRepository.findOne({
      where: { id: followUpId, userId },
    });
  }
}



