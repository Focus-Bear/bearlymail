import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Email } from '../database/entities/email.entity';
import { UserContext, ContextKey, Source } from '../database/entities/user-context.entity';
import { LLMService } from '../llm/llm.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PriorityLearningService {
  private readonly logger = new Logger(PriorityLearningService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    private llmService: LLMService,
    private usersService: UsersService,
  ) {}

  /**
   * Check if user's star selection differs significantly from AI prediction
   * Returns whether we should prompt user for explanation
   */
  async checkStarDiscrepancy(
    userId: string,
    emailId: string,
    userStarCount: number,
  ): Promise<{ shouldPrompt: boolean; predictedStarCount?: number; email?: Email }> {
    try {
      const email = await this.emailRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!email) {
        return { shouldPrompt: false };
      }

      // Get priority score and convert to predicted star count
      // Priority score 0-25 = 0 stars, 26-50 = 1 star, 51-75 = 2 stars, 76-100 = 3 stars
      const priorityScore = email.priorityScore ?? 50;
      const predictedStarCount = priorityScore <= 25 ? 0 : 
                                 priorityScore <= 50 ? 1 :
                                 priorityScore <= 75 ? 2 : 3;

      // Check for significant discrepancy (difference of 2 or more)
      const discrepancy = Math.abs(userStarCount - predictedStarCount);
      const shouldPrompt = discrepancy >= 2 && userStarCount > 0;

      return {
        shouldPrompt,
        predictedStarCount,
        email,
      };
    } catch (error) {
      this.logger.error(`Error checking star discrepancy for email ${emailId}`, error);
      return { shouldPrompt: false };
    }
  }

  /**
   * Store user feedback about why they gave different priority than AI predicted
   */
  async storeStarFeedback(
    userId: string,
    emailId: string,
    userStarCount: number,
    predictedStarCount: number,
    explanation: string,
  ): Promise<void> {
    try {
      const email = await this.emailRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!email) {
        this.logger.warn(`Email ${emailId} not found for storing feedback`);
        return;
      }

      // Create or update context based on user feedback
      // Store as USER_EDITED context with explanation
      const contextValue = userStarCount > predictedStarCount
        ? `Higher priority than expected: ${email.fromName || email.from}`
        : `Lower priority than expected: ${email.fromName || email.from}`;

      await this.userContextRepository.save({
        userId,
        contextKey: userStarCount === 3 ? ContextKey.VIP_CONTACT : ContextKey.OTHER,
        contextValue: contextValue,
        source: Source.USER_EDITED,
        explanation: `User feedback: ${explanation}`,
      });

      this.logger.log(`Stored star feedback for email ${emailId}: ${explanation}`);
    } catch (error) {
      this.logger.error(`Error storing star feedback for email ${emailId}`, error);
    }
  }

  /**
   * Learn from user's star selection and potentially add VIP contacts
   * Called when user sets starCount (0-3) on an email
   */
  async learnFromStarSelection(userId: string, emailId: string, starCount: number): Promise<void> {
    try {
      const email = await this.emailRepository.findOne({
        where: { id: emailId, userId },
      });

      if (!email) {
        this.logger.warn(`Email ${emailId} not found for user ${userId}`);
        return;
      }

      // Get user's recent emails from this sender
      const result = await this.emailRepository
        .createQueryBuilder('email')
        .innerJoin('email_threads', 'thread', 'thread.id = email.emailThreadId')
        .select([
          'email.id',
          'email.userId',
          'email.threadId',
          'email.from',
          'email.fromName',
          'email.subject',
          'email.receivedAt',
        ])
        .addSelect('thread.starCount', 'thread_starCount')
        .addSelect('thread.isArchived', 'thread_isArchived')
        .where('email.userId = :userId', { userId })
        .andWhere('email.from = :from', { from: email.from })
        .orderBy('email.receivedAt', 'DESC')
        .take(20)
        .getRawAndEntities();
      
      const recentEmailsFromSender = result.entities.map((e, index) => {
        const raw = result.raw[index];
        (e as any).starCount = raw.thread_starCount ?? 0;
        (e as any).isArchived = raw.thread_isArchived ?? false;
        return e;
      });

      // Count how many times user starred emails from this sender
      const starredCount = recentEmailsFromSender.filter(e => (e as any).starCount > 0).length;
      const threeStarCount = recentEmailsFromSender.filter(e => (e as any).starCount === 3).length;

      // If user consistently gives 3 stars to this sender, suggest adding as VIP
      if (starCount === 3 && threeStarCount >= 2) {
        await this.suggestVipContact(userId, email);
      }
    } catch (error) {
      this.logger.error(`Error learning from star selection for email ${emailId}`, error);
    }
  }

  /**
   * Suggest adding a sender as VIP contact
   */
  private async suggestVipContact(userId: string, email: Email): Promise<void> {
    const senderName = email.fromName || email.from;
    
    // Check if already a VIP
    const existingVip = await this.userContextRepository.findOne({
      where: { 
        userId, 
        contextKey: ContextKey.VIP_CONTACT,
      },
    });

    // Check if this sender is already in VIP list
    if (existingVip) {
      const existingVips = await this.userContextRepository.find({
        where: { userId, contextKey: ContextKey.VIP_CONTACT },
      });
      
      const alreadyVip = existingVips.some(vip => 
        email.from.toLowerCase().includes(vip.contextValue.toLowerCase()) ||
        vip.contextValue.toLowerCase().includes(email.from.toLowerCase())
      );
      
      if (alreadyVip) {
        return;
      }
    }

    // Auto-add as VIP (could also prompt user instead)
    await this.userContextRepository.save({
      userId,
      contextKey: ContextKey.VIP_CONTACT,
      contextValue: senderName,
      source: Source.AUTOGENERATED,
    });

    this.logger.log(`Auto-added ${senderName} as VIP contact for user ${userId}`);
  }
}
