import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserContext, ContextKey, Source } from '../database/entities/user-context.entity';
import { Email } from '../database/entities/email.entity';
import { EmailThread } from '../database/entities/email-thread.entity';
import { LLMService } from '../llm/llm.service';
import { UsersService } from '../users/users.service';
import { cleanEmailContent } from '../llm/email-content-cleaner';

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);

  constructor(
    @InjectRepository(UserContext)
    private contextRepository: Repository<UserContext>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private threadRepository: Repository<EmailThread>,
    private llmService: LLMService,
    private usersService: UsersService,
  ) {}

  async getUserContext(userId: string): Promise<UserContext[]> {
    return this.contextRepository.find({
      where: { userId },
      order: { lastModified: 'DESC' },
    });
  }

  async analyzeAndLearnFromEmails(userId: string): Promise<void> {
    this.logger.log(`Starting deep email analysis for user ${userId}`);

    try {
      // Step 1: Fetch emails for analysis (0-20%)
      // Only analyze emails from at least 24 hours ago to avoid recent unprocessed emails
      await this.usersService.update(userId, { scanProgress: 0, scanTotal: 100 });
      
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);
      
      const receivedEmailsData = await this.emailRepository
        .createQueryBuilder('email')
        .leftJoinAndSelect('email.thread', 'thread')
        .where('email.userId = :userId', { userId })
        .andWhere('email.receivedAt < :oneDayAgo', { oneDayAgo })
        .orderBy('email.receivedAt', 'DESC')
        .take(200) // Get more emails since we're filtering by date
        .getMany();

      const totalEmails = receivedEmailsData.length;
      await this.usersService.update(userId, { scanProgress: 10, scanTotal: 100 });

      // Get user's email to exclude from VIP contacts
      const user = await this.usersService.findOne(userId);
      const userEmail = user?.email ? user.email.toLowerCase() : null;

      const receivedPayload = receivedEmailsData.map(e => ({
        from: e.from,
        fromName: e.fromName,
        subject: e.subject,
        body: cleanEmailContent(e.body, e.htmlBody, 2000), // Clean email content for analysis
        receivedAt: e.receivedAt.toISOString(),
        isRead: e.isRead,
        timeToReply: e.timeToReply ? e.timeToReply * 60 : null, // Convert hours to minutes
        starCount: e.thread?.starCount || 0,
        isArchived: e.thread?.isArchived || false,
      }));

      // Use same emails as proxy for sent (in real app, filter by SENT label)
      const sentPayload = receivedEmailsData.slice(0, 20).map(e => ({
        to: 'recipient@example.com',
        subject: e.subject,
        body: cleanEmailContent(e.body, e.htmlBody, 2000),
        sentAt: e.receivedAt.toISOString(),
      }));

      await this.usersService.update(userId, { scanProgress: 20, scanTotal: 100 });

      // Step 1.5: Identify VIP contacts from starred threads (before LLM analysis)
      // Only consider threads from at least 24 hours ago that were actually starred
      await this.usersService.update(userId, { scanProgress: 25, scanTotal: 100 });
      
      // Query starred threads directly (starCount > 0) from at least 24 hours ago
      const starredThreads = await this.threadRepository
        .createQueryBuilder('thread')
        .leftJoinAndSelect('thread.emails', 'email')
        .where('thread.userId = :userId', { userId })
        .andWhere('thread.starCount > 0')
        .andWhere('thread.updatedAt < :oneDayAgo', { oneDayAgo })
        .orderBy('thread.updatedAt', 'DESC')
        .getMany();
      
      // Group threads by sender (contact) and count distinct threads
      const vipContacts = new Map<string, { from: string; fromName?: string; threadCount: number }>();
      
      for (const thread of starredThreads) {
        // Get the first email from the thread to identify the sender
        const firstEmail = thread.emails?.[0];
        if (!firstEmail) continue;
        
        const emailKey = firstEmail.from.toLowerCase();
        
        // Exclude the logged-in user's own email from VIP contacts
        if (userEmail && emailKey === userEmail) {
          continue;
        }
        
        const existing = vipContacts.get(emailKey);
        if (existing) {
          // Increment thread count for this contact
          existing.threadCount += 1;
          // Update fromName if we have a better one
          if (firstEmail.fromName && !existing.fromName) {
            existing.fromName = firstEmail.fromName;
          }
        } else {
          // First thread from this contact
          vipContacts.set(emailKey, {
            from: firstEmail.from,
            fromName: firstEmail.fromName,
            threadCount: 1,
          });
        }
      }
      
      this.logger.log(`Found ${vipContacts.size} VIP contacts from ${starredThreads.length} starred threads`);

      // Step 2: Call LLM for analysis (20-80%)
      await this.usersService.update(userId, { scanProgress: 30, scanTotal: 100 });
      const analysis = await this.llmService.analyzeEmailPatterns(
        receivedPayload, 
        sentPayload, 
        undefined, 
        userId
      );

      await this.usersService.update(userId, { scanProgress: 70, scanTotal: 100 });

      this.logger.log('LLM Analysis Result:', JSON.stringify(analysis, null, 2));

      // Step 3: Save Context - clear old autogenerated context first (80-100%)
      await this.usersService.update(userId, { scanProgress: 80, scanTotal: 100 });
      
      // Delete old autogenerated context
      await this.contextRepository.delete({ userId, source: Source.AUTOGENERATED });
      
      // Save VIP contacts from starred threads (this takes priority over LLM analysis)
      for (const [emailKey, contact] of vipContacts.entries()) {
        const displayName = contact.fromName || contact.from;
        // Store explanation as a translation key pattern that frontend can translate
        // Format: "translationKey:param1:param2" - frontend will parse and translate
        // Use threadCount to indicate number of distinct starred threads
        const explanation = `vipContactStarredExplanation:${contact.threadCount}`;
        await this.createOrUpdateContext(
          userId,
          ContextKey.VIP_CONTACT,
          displayName,
          Source.AUTOGENERATED,
          undefined,
          explanation
        );
        this.logger.log(`Added VIP contact: ${displayName} (threadCount: ${contact.threadCount})`);
      }
      
      // Process LLM analysis results (but filter out VIP_CONTACT since we've already handled it)
      if (analysis.context) {
        for (const item of analysis.context) {
          // Skip items with invalid data
          if (!item || !item.key || !item.value) {
            this.logger.warn('Skipping context item with invalid data:', item);
            continue;
          }
          
          let key = ContextKey.OTHER;
          let priority: number | undefined;
          
          // Safely convert to strings
          const keyStr = String(item.key || '');
          const valueStr = String(item.value || '');
          const keyUpper = keyStr.toUpperCase();
          const keyLower = keyStr.toLowerCase();
          const valueLower = valueStr.toLowerCase();
          
          // Skip VIP_CONTACT from LLM - we determine VIP contacts from starred emails
          if (keyUpper === 'VIP_CONTACT' || keyUpper === 'VIP' || keyLower.includes('vip') || keyLower.includes('important contact')) {
            this.logger.log(`Skipping LLM VIP contact suggestion: ${valueStr} (VIP contacts are determined from starred emails)`);
            continue;
          }
          
          // Map exact enum keys first
          if (keyUpper === 'USER_INFO' || keyUpper === 'USER') {
          key = ContextKey.USER_INFO;
        } else if (keyUpper === 'CURRENT_TOPIC' || keyUpper === 'WORKING_ON' || keyUpper === 'PROJECT') {
          key = ContextKey.WORKING_ON;
          // Try to extract priority from value
          if (valueLower.includes('high') || valueLower.includes('urgent')) {
            priority = 1;
          } else if (valueLower.includes('low')) {
            priority = 3;
          } else {
            priority = 2;
          }
        } else if (keyUpper === 'URGENT') {
          key = ContextKey.URGENT;
        } else if (keyUpper === 'NOT_IMPORTANT' || keyUpper === 'NOT IMPORTANT') {
          key = ContextKey.NOT_IMPORTANT;
        } else if (keyUpper === 'MY_GOALS' || keyUpper === 'GOALS' || keyUpper === 'GOAL') {
          key = ContextKey.MY_GOALS;
        } else if (keyUpper === 'DONT_CARE' || keyUpper === "DON'T_CARE") {
          key = ContextKey.DONT_CARE;
        } else {
          // Fallback to keyword matching for flexibility
          if (keyLower.includes('vip') || keyLower.includes('important contact')) {
            key = ContextKey.VIP_CONTACT;
          } else if (keyLower.includes('urgent')) {
            key = ContextKey.URGENT;
          } else if (keyLower.includes('not important') || keyLower.includes('notimportant') || keyLower.includes('don\'t care') || keyLower.includes('ignore')) {
            key = ContextKey.NOT_IMPORTANT;
          } else if (keyLower.includes('goal') || keyLower.includes('objective')) {
            key = ContextKey.MY_GOALS;
          } else if (keyLower.includes('working on') || keyLower.includes('project') || keyLower.includes('topic') || keyLower.includes('focus')) {
            key = ContextKey.WORKING_ON;
            if (valueLower.includes('high') || valueLower.includes('urgent')) {
              priority = 1;
            } else if (valueLower.includes('low')) {
              priority = 3;
            } else {
              priority = 2;
            }
          } else if (keyLower.includes('user') || keyLower.includes('about me') || keyLower.includes('preference')) {
            key = ContextKey.USER_INFO;
          }
        }
        
        const explanationStr = item.source ? String(item.source) : undefined;
        await this.createOrUpdateContext(userId, key, valueStr, Source.AUTOGENERATED, priority, explanationStr);
      }
      
      await this.usersService.update(userId, { scanProgress: 95, scanTotal: 100 });
    }

    // 4. Save Writing Style to user's tone settings
    if (analysis.writingStyle) {
      await this.usersService.update(userId, {
        toneSettings: {
          rules: [
            `Tone: ${analysis.writingStyle.tone}`,
            `Style: ${analysis.writingStyle.style}`,
            ...analysis.writingStyle.commonPhrases.map(p => `Common phrase: "${p}"`)
          ]
        }
      });
    }

    // Mark analysis as complete
    await this.usersService.update(userId, { scanProgress: 100, scanTotal: 100 });
    
    this.logger.log(`Completed email analysis for user ${userId}`);
    
    // Clear progress after a short delay to allow frontend to see completion
    setTimeout(async () => {
      await this.usersService.update(userId, { scanProgress: null, scanTotal: null });
    }, 5000);
    } catch (error) {
      // Set error state so frontend can display error message
      this.logger.error(`Context analysis failed for user ${userId}:`, error);
      try {
        await this.usersService.update(userId, { scanProgress: -1, scanTotal: 100 });
        // Clear error state after 30 seconds
        setTimeout(async () => {
          await this.usersService.update(userId, { scanProgress: null, scanTotal: null });
        }, 30000);
      } catch (updateError) {
        this.logger.error(`Failed to update error state for user ${userId}:`, updateError);
      }
      throw error;
    }
  }

  async createOrUpdateContext(
    userId: string,
    contextKey: ContextKey,
    contextValue: string,
    source: Source,
    priority?: number,
    explanation?: string,
  ): Promise<UserContext> {
    const existing = await this.contextRepository.findOne({
      where: { userId, contextKey, contextValue },
    });

    if (existing) {
      existing.lastModified = new Date();
      if (source === Source.USER_EDITED) {
        existing.source = Source.USER_EDITED;
      }
      if (priority !== undefined) {
        existing.priority = priority;
      }
      return this.contextRepository.save(existing);
    }

    const context = this.contextRepository.create({
      userId,
      contextKey,
      contextValue,
      source,
      priority,
      explanation,
    });

    return this.contextRepository.save(context);
  }

  async updateContext(
    contextId: string,
    userId: string,
    updates: Partial<UserContext>,
  ): Promise<UserContext> {
    updates.source = Source.USER_EDITED;
    await this.contextRepository.update({ contextId, userId }, updates);
    return this.contextRepository.findOne({ where: { contextId, userId } });
  }

  async deleteContext(contextId: string, userId: string): Promise<void> {
    await this.contextRepository.delete({ contextId, userId });
  }
}
