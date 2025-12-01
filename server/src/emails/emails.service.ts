import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import PgBoss = require('pg-boss');
import { Email } from '../database/entities/email.entity';
import { EmailThread } from '../database/entities/email-thread.entity';
import { PriorityService } from '../priority/priority.service';
import { RuleType } from '../database/entities/priority-rule.entity';
import { User } from '../database/entities/user.entity';
import { EmailProviderManager } from './email-provider-manager.service';

@Injectable()
export class EmailsService {
  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    private priorityService: PriorityService,
    @Inject('PG_BOSS') private readonly boss: PgBoss,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
  ) {}

  async getInbox(userId: string, includeBatched: boolean = false, mode: 'triage' | 'process' = 'triage'): Promise<Email[]> {
    const startTime = Date.now();
    const now = new Date();
    
    // THREAD-BASED APPROACH using EmailThread:
    // Join with email_threads to get thread-level properties (starCount, isArchived)
    const query = this.emailRepository
      .createQueryBuilder('email')
      .innerJoin('email_threads', 'thread', 'thread.id = email.emailThreadId')
      .where('email.userId = :userId', { userId })
      .andWhere('thread.userId = :userId', { userId })
      // CRITICAL: Exclude ALL archived threads - they should not appear in either tab
      .andWhere('thread.isArchived = false')
      // Exclude snoozed emails that haven't expired yet (snoozed emails are not "in inbox")
      .andWhere('(email.isSnoozed = false OR email.snoozeUntil IS NULL OR email.snoozeUntil <= :now)', { now });

    if (!includeBatched) {
      // Show unbatched emails, or batched emails that have been released, or urgent emails
      // OR starred emails (starred emails should always be visible in Process mode)
      query.andWhere('(email.isBatched = false OR email.batchReleaseAt <= :now OR email.isUrgent = true OR thread.starCount > 0)', { now });
    }

      // Filter by mode: Process = starred threads, Triage = non-starred threads
      // IMPORTANT: This filter must match the thread.starCount in the database
      if (mode === 'process') {
        query.andWhere('thread.starCount > 0');
      } else {
        query.andWhere('thread.starCount = 0');
      }
      
      // Additional safety check: Also filter by thread.isArchived = false (should already be filtered above)
      query.andWhere('thread.isArchived = false');

    // Select only needed columns to avoid decrypting large body/htmlBody fields
    // Use addSelect for thread columns to get them in the result
    const allEmails = await query
      .select([
        'email.id',
        'email.userId',
        'email.threadId',
        'email.messageId',
        'email.from',
        'email.fromName',
        'email.senderJobTitle',
        'email.subject',
        'email.priorityScore',
        'email.isUrgent',
        'email.isSnoozed',
        'email.snoozeUntil',
        'email.isBatched',
        'email.batchReleaseAt',
        'email.isRead',
        'email.summary',
        'email.isProcessingPriority',
        'email.isProcessingSummary',
        'email.receivedAt',
      ])
      .addSelect('thread.starCount', 'thread_starCount')
      .addSelect('thread.isArchived', 'thread_isArchived')
      .getRawAndEntities();

    const queryTime = Date.now() - startTime;
    
    // Group emails by threadId for display
    const threadMap = new Map<string, Email[]>();
    const threadInfoMap = new Map<string, { starCount: number; isArchived: boolean }>();
    
    // allEmails.entities contains the Email entities
    // allEmails.raw contains the raw results with thread columns
    for (let i = 0; i < allEmails.entities.length; i++) {
      const email = allEmails.entities[i];
      const raw = allEmails.raw[i];
      
      // Get thread info from the raw result
      // TypeORM might use different column naming - try both snake_case and camelCase
      const threadStarCount = raw.thread_starCount ?? raw.threadStarCount ?? raw.thread_star_count ?? 0;
      const threadIsArchived = raw.thread_isArchived ?? raw.threadIsArchived ?? raw.thread_is_archived ?? false;
      
      // DEBUG: Log if we're in process mode and thread has starCount = 0 (shouldn't happen)
      if (mode === 'process' && threadStarCount === 0) {
        console.warn(`⚠️ [DEBUG] Process mode: Found email with thread starCount=0! Thread: ${email.threadId.substring(0, 8)}..., Raw keys: ${Object.keys(raw).join(', ')}`);
      }
      
      if (!threadMap.has(email.threadId)) {
        threadMap.set(email.threadId, []);
        threadInfoMap.set(email.threadId, { starCount: threadStarCount, isArchived: threadIsArchived });
      }
      threadMap.get(email.threadId)!.push(email);
    }

    // For each thread, select the representative email
    const threadRepresentatives: Email[] = [];
    
    for (const [threadId, threadEmails] of threadMap.entries()) {
      const threadInfo = threadInfoMap.get(threadId)!;
      const threadIsStarred = threadInfo.starCount > 0;
      
      // DEBUG: Log thread info for debugging Process tab
      if (mode === 'process') {
        if (threadIsStarred) {
          console.log(`⭐ [DEBUG] Process mode: Including starred thread ${threadId.substring(0, 8)}... (starCount=${threadInfo.starCount}, emails=${threadEmails.length})`);
        } else {
          // This shouldn't happen if the query filter is working correctly
          console.error(`❌ [DEBUG] Process mode: Found non-starred thread ${threadId.substring(0, 8)}... (starCount=${threadInfo.starCount}) - skipping!`);
          continue; // Skip this thread - it shouldn't be in process mode
        }
      } else {
        // Triage mode - skip starred threads
        if (threadIsStarred) {
          console.log(`[DEBUG] Triage mode: Skipping starred thread ${threadId.substring(0, 8)}... (starCount=${threadInfo.starCount})`);
          continue;
        }
      }

      // Select the representative email for this thread:
      // Priority: highest priorityScore, then newest receivedAt
      const representative = threadEmails.reduce((best, current) => {
        if (!best) return current;
        
        // Prioritize by priority score
        const currentScore = current.priorityScore ?? 50;
        const bestScore = best.priorityScore ?? 50;
        if (Math.abs(currentScore - bestScore) > 0.01) {
          return currentScore > bestScore ? current : best;
        }
        
        // If same priority, prefer newest
        return new Date(current.receivedAt).getTime() > new Date(best.receivedAt).getTime() ? current : best;
      });

      // Set thread-level properties on representative (for display purposes)
      // Add these as virtual properties since they're not on Email entity anymore
      (representative as any).starCount = threadInfo.starCount;
      (representative as any).isArchived = threadInfo.isArchived;
      
      threadRepresentatives.push(representative);
    }

    // DEBUG: Log thread-based results with detailed star count info
    const starredThreadCount = threadRepresentatives.filter(e => ((e as any).starCount ?? 0) > 0).length;
    
    // DEBUG: Check how many starred threads are actually in the database
    const totalStarredThreadsInDb = await this.emailThreadRepository.count({
      where: { userId, starCount: MoreThan(0), isArchived: false },
    });
    
    console.log(`🧵 [DEBUG] getInbox(${mode}):`);
    console.log(`   - Total starred threads in DB: ${totalStarredThreadsInDb}`);
    console.log(`   - Processed ${threadMap.size} total threads from query`);
    console.log(`   - Returning ${threadRepresentatives.length} threads for ${mode} mode`);
    console.log(`   - ${starredThreadCount} of returned threads have starCount > 0`);
    console.log(`   - Sample threads:`, threadRepresentatives.slice(0, 3).map(e => ({ 
      threadId: e.threadId.substring(0, 8),
      id: e.id.substring(0, 8), 
      subject: e.subject?.substring(0, 30), 
      starCount: (e as any).starCount ?? 0,
      isArchived: (e as any).isArchived,
      priorityScore: e.priorityScore,
      shouldBeIn: ((e as any).starCount ?? 0) > 0 ? 'process' : 'triage'
    })));

    if (queryTime > 1000) {
      console.warn(`⚠️ Slow inbox query (${queryTime}ms) for mode ${mode}, processed ${threadMap.size} threads, returning ${threadRepresentatives.length} threads`);
    }

    // Batch priority recalculation - only for emails that need it (basic score only, LLM happens async)
    const emailsNeedingPriority = threadRepresentatives.filter(e => !e.priorityScore || e.priorityScore === 50);
    if (emailsNeedingPriority.length > 0) {
      // Fetch rules once for all emails
      const rules = await this.priorityService.getPriorityRules(userId);
      
      // OPTIMIZATION: Batch calculate days since last email to avoid N+1 queries
      const daysSinceLastEmailMap = await this.batchCalculateDaysSinceLastEmail(userId, emailsNeedingPriority);
      
      // Calculate priority scores (synchronous, fast)
      const updates = emailsNeedingPriority.map(email => {
        const daysSinceLastEmail = daysSinceLastEmailMap.get(email.id);
        return {
          id: email.id,
          priorityScore: this.priorityService.calculateBasicPriorityScore(email, rules, daysSinceLastEmail),
        };
      });
      
      // Batch update in parallel (non-blocking, don't await to avoid blocking response)
      Promise.all(
        updates.map(update => 
          this.emailRepository.update(update.id, { priorityScore: update.priorityScore })
            .catch(err => console.error(`Failed to update priority for email ${update.id}:`, err))
        )
      ).catch(err => console.error('Error batch updating priorities:', err));
      
      // Update in-memory objects for immediate response
      updates.forEach(update => {
        const email = emailsNeedingPriority.find(e => e.id === update.id);
        if (email) {
          email.priorityScore = update.priorityScore;
        }
      });
    }

    // Return sorted by priority (DESC), then by received date (DESC) for consistent ordering
    // Triage should be sorted by priority so most important unstarred emails appear first
    return threadRepresentatives.sort((a, b) => {
      // First sort by priority score (higher = more important)
      const aScore = a.priorityScore ?? 50;
      const bScore = b.priorityScore ?? 50;
      if (Math.abs(bScore - aScore) > 0.01) {
        return bScore - aScore;
      }
      // If priorities are the same (or very close), sort by received date (newer first)
      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
    });
  }

  async getEmailById(userId: string, emailId: string): Promise<Email> {
    return this.emailRepository.findOne({
      where: { id: emailId, userId },
    });
  }

  async getThreadEmails(userId: string, threadId: string): Promise<Email[]> {
    // CRITICAL: Use query builder with explicit select to avoid decrypting body/htmlBody
    // These are large encrypted fields that cause significant slowdown
    // The frontend can fetch body/htmlBody separately if needed for individual emails
    return this.emailRepository
      .createQueryBuilder('email')
      .select([
        'email.id',
        'email.userId',
        'email.threadId',
        'email.messageId',
        'email.from',
        'email.fromName',
        'email.senderJobTitle',
        'email.subject',
        'email.priorityScore',
        'email.isUrgent',
        'email.starCount',
        'email.isSnoozed',
        'email.snoozeUntil',
        'email.isBatched',
        'email.batchReleaseAt',
        'email.isRead',
        'email.isArchived',
        'email.summary',
        'email.receivedAt',
        // Only include body/htmlBody if explicitly needed - they're large and encrypted
        // For thread view, we can fetch them separately for expanded emails
        'email.body',
        'email.htmlBody',
      ])
      .where('email.userId = :userId', { userId })
      .andWhere('email.threadId = :threadId', { threadId })
      .orderBy('email.receivedAt', 'ASC') // Oldest first for thread view
      .getMany();
  }

  /**
   * Get recent thread IDs that are not archived (for checking archived status in Gmail)
   */
  async getRecentNonArchivedThreadIds(userId: string, days: number = 7): Promise<string[]> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const results = await this.emailThreadRepository
      .createQueryBuilder('thread')
      .select('thread.threadId', 'threadId')
      .where('thread.userId = :userId', { userId })
      .andWhere('thread.isArchived = false')
      .innerJoin('emails', 'email', 'email.emailThreadId = thread.id')
      .andWhere('email.receivedAt >= :cutoffDate', { cutoffDate })
      .limit(50) // Limit to avoid rate limits
      .getRawMany();
    
    return results.map((r: any) => r.threadId).filter((id: string) => id); // Filter out any null/undefined
  }

  /**
   * Get ALL non-archived thread IDs (for checking starred/archived status in Gmail)
   * This is used to ensure all starred emails are properly synced
   */
  async getAllNonArchivedThreadIds(userId: string): Promise<string[]> {
    const results = await this.emailThreadRepository
      .createQueryBuilder('thread')
      .select('thread.threadId', 'threadId')
      .where('thread.userId = :userId', { userId })
      .andWhere('thread.isArchived = false')
      .limit(200) // Limit to avoid rate limits, but higher than recent threads
      .getRawMany();
    
    return results.map((r: any) => r.threadId).filter((id: string) => id); // Filter out any null/undefined
  }

  /**
   * Update archived status for a thread (updates EmailThread)
   */
  async updateThreadArchivedStatus(userId: string, threadId: string, isArchived: boolean): Promise<void> {
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });
    
    if (thread) {
      thread.isArchived = isArchived;
      await this.emailThreadRepository.save(thread);
      console.log(`Updated thread ${threadId.substring(0, 8)}... archived status to ${isArchived}`);
    } else {
      // Thread doesn't exist yet, create it
      await this.getOrCreateEmailThread(userId, threadId, 0, isArchived);
    }
  }

  /**
   * Update star count for a thread (updates EmailThread)
   */
  async updateThreadStarCount(userId: string, threadId: string, starCount: number): Promise<void> {
    const thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });
    
    if (thread) {
      thread.starCount = starCount;
      await this.emailThreadRepository.save(thread);
      console.log(`Updated thread ${threadId.substring(0, 8)}... star count to ${starCount}`);
    } else {
      // Thread doesn't exist yet, create it
      await this.getOrCreateEmailThread(userId, threadId, starCount, false);
    }
  }

  /**
   * Get or create EmailThread for a given userId and threadId
   */
  async getOrCreateEmailThread(userId: string, threadId: string, starCount: number = 0, isArchived: boolean = false): Promise<EmailThread> {
    let thread = await this.emailThreadRepository.findOne({
      where: { userId, threadId },
    });

    if (!thread) {
      thread = this.emailThreadRepository.create({
        userId,
        threadId,
        starCount,
        isArchived,
      });
      thread = await this.emailThreadRepository.save(thread);
      console.log(`Created EmailThread for thread ${threadId.substring(0, 8)}... (starCount=${starCount}, isArchived=${isArchived})`);
    } else {
      // Update if values changed
      const needsUpdate = thread.starCount !== starCount || thread.isArchived !== isArchived;
      if (needsUpdate) {
        thread.starCount = starCount;
        thread.isArchived = isArchived;
        thread = await this.emailThreadRepository.save(thread);
        console.log(`Updated EmailThread for thread ${threadId.substring(0, 8)}... (starCount=${starCount}, isArchived=${isArchived})`);
      }
    }

    return thread;
  }

  async getEmailByMessageId(userId: string, messageId: string): Promise<Email> {
    return this.emailRepository.findOne({
      where: { messageId, userId },
    });
  }

  async createEmail(userId: string, emailData: Partial<Email>): Promise<Email> {
    console.log(`Creating email for user ${userId}: ${emailData.subject}`);
    
    // Extract thread-level properties (these should come from EmailThread, not Email)
    const starCount = (emailData as any).starCount || 0;
    const isArchived = (emailData as any).isArchived || false;
    
    // Get or create EmailThread
    const thread = await this.getOrCreateEmailThread(userId, emailData.threadId!, starCount, isArchived);
    
    // Remove thread-level properties from emailData before creating Email
    const { starCount: _, isArchived: __, ...emailDataWithoutThreadProps } = emailData as any;
    
    // TypeORM create can return Email or Email[], but we're passing a single object so it returns Email
    const emailDataToCreate: Partial<Email> = {
      ...emailDataWithoutThreadProps,
      userId,
      emailThreadId: thread.id, // Link to EmailThread
    };
    const createdEntities = this.emailRepository.create(emailDataToCreate);
    const email = (Array.isArray(createdEntities) ? createdEntities[0] : createdEntities) as Email;

    // Get rules for basic priority calculation
    const rules = await this.priorityService.getPriorityRules(userId);
    
    // Calculate days since last email in thread for priority boost
    const daysSinceLastEmail = await this.calculateDaysSinceLastEmail(userId, email);
    
    // Calculate basic priority score immediately (fast, no LLM)
    email.priorityScore = this.priorityService.calculateBasicPriorityScore(email, rules, daysSinceLastEmail);
    email.isProcessingPriority = true; // Mark as processing for LLM refinement

    // Check if urgent (override batching)
    email.isUrgent = this.checkIfUrgent(email);

    // Apply batching if not urgent and not starred (starCount = 0)
    if (!email.isUrgent && starCount === 0) {
      const user = await this.emailRepository.manager.findOne(User, { where: { id: userId } });
      const batchHours = user?.batchDeliveryHours || 6;
      email.isBatched = true;
      email.batchReleaseAt = new Date(Date.now() + batchHours * 60 * 60 * 1000);
    }

    const savedEmail = await this.emailRepository.save(email);
    console.log(`Saved email ${savedEmail.id} to database`);
    
    // Only queue LLM jobs if they don't already exist
    // Check if priority needs refinement (only if missing or isProcessingPriority is false and priorityScore is default)
    const needsPriorityRefinement = !savedEmail.priorityScore || 
                                     savedEmail.priorityScore === 50 || 
                                     (!savedEmail.isProcessingPriority && !savedEmail.priorityScore);
    
    if (needsPriorityRefinement) {
      this.boss.send('refine-priority', { userId, emailId: savedEmail.id }).catch(err => 
        console.error('Failed to queue priority refinement', err)
      );
    } else {
      console.log(`Skipping priority refinement for email ${savedEmail.id} - already has priority score: ${savedEmail.priorityScore}`);
    }
    
    // Check if summary needs generation (only if missing)
    const needsSummary = !savedEmail.summary || savedEmail.summary.trim() === '';
    
    if (needsSummary) {
      this.boss.send('generate-summary', { userId, emailId: savedEmail.id }).catch(err => 
        console.error('Failed to queue summary generation', err)
      );
    } else {
      console.log(`Skipping summary generation for email ${savedEmail.id} - already has summary`);
    }
    
    return savedEmail;
  }

  private checkIfUrgent(email: Partial<Email>): boolean {
    // More strict urgent keyword detection
    // Only flag as urgent if keywords appear in subject (not body) to reduce false positives
    // Body often contains quoted text or casual mentions of these words
    const urgentKeywords = ['urgent', 'asap', 'critical', 'emergency', 'immediate', 'time-sensitive'];
    const subjectLower = (email.subject || '').toLowerCase();
    
    // Only check subject for urgent keywords - more reliable indicator
    // Require exact word match (not substring) to avoid false positives like "currently" matching "urgent"
    const subjectWords = subjectLower.split(/\s+/);
    return urgentKeywords.some((keyword) => 
      subjectWords.includes(keyword) || subjectLower.includes(` ${keyword} `) || subjectLower.startsWith(`${keyword} `) || subjectLower.endsWith(` ${keyword}`)
    );
  }

  async markAsRead(userId: string, emailId: string): Promise<Email> {
    await this.emailRepository.update({ id: emailId, userId }, { isRead: true });
    return this.getEmailById(userId, emailId);
  }

  async archiveEmail(userId: string, emailId: string): Promise<void> {
    const email = await this.getEmailById(userId, emailId);
    if (email && email.threadId) {
      await this.updateThreadArchivedStatus(userId, email.threadId, true);
    }
  }

  async updateEmail(emailId: string, updates: Partial<Email>): Promise<Email | null> {
    await this.emailRepository.update({ id: emailId }, updates);
    return this.emailRepository.findOne({ where: { id: emailId } });
  }

  async setStarCount(userId: string, emailId: string, starCount: number): Promise<Email> {
    const email = await this.getEmailById(userId, emailId);
    if (email && email.threadId) {
      const thread = await this.emailThreadRepository.findOne({
        where: { userId, threadId: email.threadId },
      });
      const oldStarCount = thread?.starCount ?? 0;
      
      // Ensure starCount is between 0-3
      const newStarCount = Math.max(0, Math.min(3, starCount));
      await this.updateThreadStarCount(userId, email.threadId, newStarCount);
      
      // Trigger learning if star count changed
      if (oldStarCount !== newStarCount) {
        // Queue learning job asynchronously (don't block the response)
        this.boss.send('learn-from-star', { userId, emailId, starCount: newStarCount })
          .catch(err => console.error('Failed to queue learning job', err));
      }
    }
    return email;
  }

  // Backwards compatibility - toggle between 0 and 3 stars
  async toggleStar(userId: string, emailId: string): Promise<Email> {
    const email = await this.getEmailById(userId, emailId);
    if (email && email.threadId) {
      const thread = await this.emailThreadRepository.findOne({
        where: { userId, threadId: email.threadId },
      });
      const currentStarCount = thread?.starCount ?? 0;
      const newStarCount = currentStarCount > 0 ? 0 : 3;
      await this.updateThreadStarCount(userId, email.threadId, newStarCount);
    }
    return email;
  }

  async forceCheckNewEmails(userId: string): Promise<Email[]> {
    // Unbatch ALL pending batched emails for the user, effectively "delivering" them now
    await this.emailRepository.update(
      {
        userId,
        isBatched: true,
      },
      { isBatched: false },
    );

    // Return Triage inbox by default after force check
    return this.getInbox(userId, true, 'triage');
  }

  async getNextBatchReleaseTime(userId: string): Promise<Date | null> {
    const nextBatch = await this.emailRepository.findOne({
      where: { userId, isBatched: true },
      order: { batchReleaseAt: 'ASC' },
      select: ['batchReleaseAt'],
    });
    return nextBatch?.batchReleaseAt || null;
  }

  async checkForUrgentEmails(userId: string): Promise<{ hasUrgent: boolean; urgentCount: number; urgentEmails: Array<{ subject: string; from: string; priorityScore: number }> }> {
    // Get all batched emails that are marked as urgent AND have very high priority score
    // Require BOTH conditions to be more strict about what counts as urgent
    // Priority threshold raised to 90+ (was 80+) to reduce false positives
    // Join with email_threads to check isArchived
    const urgentBatchedEmails = await this.emailRepository
      .createQueryBuilder('email')
      .innerJoin('email_threads', 'thread', 'thread.id = email.emailThreadId')
      .where('email.userId = :userId', { userId })
      .andWhere('thread.userId = :userId', { userId })
      .andWhere('email.isBatched = true')
      .andWhere('thread.isArchived = false')
      .andWhere('email.isUrgent = true') // Must have urgent flag
      .andWhere('email.priorityScore >= 90') // AND must have very high priority (90+)
      .orderBy('email.priorityScore', 'DESC')
      .addOrderBy('email.receivedAt', 'DESC')
      .take(10)
      .getMany();

    return {
      hasUrgent: urgentBatchedEmails.length > 0,
      urgentCount: urgentBatchedEmails.length,
      urgentEmails: urgentBatchedEmails.map(email => ({
        subject: email.subject, // Will be automatically decrypted by transformer
        from: email.fromName || email.from, // Will be automatically decrypted by transformer
        priorityScore: email.priorityScore,
      })),
    };
  }

  /**
   * Batch calculate days since last email for multiple emails efficiently
   * Returns a Map<emailId, daysSinceLastEmail>
   */
  private async batchCalculateDaysSinceLastEmail(userId: string, emails: Partial<Email>[]): Promise<Map<string, number | undefined>> {
    const resultMap = new Map<string, number | undefined>();
    
    // Filter out emails that can't be calculated (missing required fields)
    const validEmails = emails.filter(e => e.threadId && e.from && e.receivedAt && e.id);
    if (validEmails.length === 0) {
      // Set all to undefined
      emails.forEach(e => {
        if (e.id) resultMap.set(e.id, undefined);
      });
      return resultMap;
    }

    // Group by threadId to batch queries more efficiently
    const threadMap = new Map<string, Partial<Email>[]>();
    validEmails.forEach(email => {
      const threadId = email.threadId!;
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId)!.push(email);
    });

    // For each thread, fetch all previous emails in one query, then calculate for each
    try {
      const threadIds = Array.from(threadMap.keys());
      if (threadIds.length === 0) {
        validEmails.forEach(e => {
          if (e.id) resultMap.set(e.id, undefined);
        });
        return resultMap;
      }

      // Fetch all previous emails for all threads in one query (or a few queries if too many)
      // Since we need to match by encrypted 'from' field, we'll do one query per thread
      // But at least we're grouping by thread to minimize queries
      const promises = Array.from(threadMap.entries()).map(async ([threadId, threadEmails]) => {
        // Get the earliest receivedAt in this thread batch
        const earliestReceivedAt = threadEmails.reduce((earliest, email) => {
          if (!earliest || !email.receivedAt) return earliest || email.receivedAt;
          return email.receivedAt < earliest ? email.receivedAt : earliest;
        }, threadEmails[0]?.receivedAt);

        if (!earliestReceivedAt) return;

        // Fetch all emails in this thread before the earliest one
        // Note: We can't filter by 'from' efficiently due to encryption, so we fetch all and filter in memory
        const previousEmails = await this.emailRepository
          .createQueryBuilder('email')
          .where('email.userId = :userId', { userId })
          .andWhere('email.threadId = :threadId', { threadId })
          .andWhere('email.receivedAt < :receivedAt', { receivedAt: earliestReceivedAt })
          .orderBy('email.receivedAt', 'DESC')
          .getMany();

        // For each email in the batch, find the last email from the same sender BEFORE that email's receivedAt
        threadEmails.forEach(email => {
          if (!email.id || !email.from || !email.receivedAt) {
            resultMap.set(email.id || '', undefined);
            return;
          }

          // Find last email from same sender that was received BEFORE this email
          // (TypeORM decrypts 'from' automatically, so we can compare decrypted values)
          const lastEmail = previousEmails.find(e => 
            e.from === email.from && e.receivedAt < email.receivedAt
          );
          
          if (!lastEmail) {
            resultMap.set(email.id, undefined);
            return;
          }

          // Calculate days difference
          const daysDiff = (email.receivedAt.getTime() - lastEmail.receivedAt.getTime()) / (1000 * 60 * 60 * 24);
          resultMap.set(email.id, Math.max(0, Math.round(daysDiff * 10) / 10));
        });
      });

      await Promise.all(promises);
    } catch (error) {
      console.error('Error batch calculating days since last email:', error);
      // Set all to undefined on error
      validEmails.forEach(e => {
        if (e.id) resultMap.set(e.id, undefined);
      });
    }

    // Set undefined for emails that were filtered out
    emails.forEach(e => {
      if (e.id && !resultMap.has(e.id)) {
        resultMap.set(e.id, undefined);
      }
    });

    return resultMap;
  }

  /**
   * Calculate days since the last email in the thread from the same sender
   * Returns undefined if this is the first email in the thread or from this sender
   * @deprecated Use batchCalculateDaysSinceLastEmail for multiple emails
   */
  private async calculateDaysSinceLastEmail(userId: string, email: Partial<Email>): Promise<number | undefined> {
    if (!email.threadId || !email.from || !email.receivedAt) {
      return undefined;
    }

    try {
      // Find the last email in the same thread from the same sender, before the current email
      const lastEmail = await this.emailRepository
        .createQueryBuilder('email')
        .where('email.userId = :userId', { userId })
        .andWhere('email.threadId = :threadId', { threadId: email.threadId })
        .andWhere('email.from = :from', { from: email.from })
        .andWhere('email.receivedAt < :receivedAt', { receivedAt: email.receivedAt })
        .orderBy('email.receivedAt', 'DESC')
        .take(1)
        .getOne();

      if (!lastEmail) {
        return undefined; // First email from this sender in the thread
      }

      // Calculate days difference
      const daysDiff = (email.receivedAt.getTime() - lastEmail.receivedAt.getTime()) / (1000 * 60 * 60 * 24);
      return Math.max(0, Math.round(daysDiff * 10) / 10); // Round to 1 decimal place
    } catch (error) {
      console.error('Error calculating days since last email:', error);
      return undefined;
    }
  }

  /**
   * Get priority score explanation breakdown for an email
   */
  async getPriorityExplanation(userId: string, emailId: string): Promise<{
    score: number;
    breakdown: Array<{ factor: string; value: number; description: string }>;
  }> {
    const email = await this.getEmailById(userId, emailId);
    if (!email) {
      throw new Error('Email not found');
    }

    const rules = await this.priorityService.getPriorityRules(userId);
    const daysSinceLastEmail = await this.calculateDaysSinceLastEmail(userId, email);
    
    const breakdown: Array<{ factor: string; value: number; description: string }> = [];
    let currentScore = 50;

    // Base score
    breakdown.push({
      factor: 'Base Score',
      value: 50,
      description: 'Starting priority score',
    });

    // Explicit rules
    const explicitRules = rules.filter((r) => r.ruleType === RuleType.EXPLICIT_SENDER);
    for (const rule of explicitRules) {
      // Simplified matching check (would need to decrypt conditionKey/conditionVal)
      breakdown.push({
        factor: `Rule: ${rule.conditionKey}`,
        value: rule.priorityBoost,
        description: `Custom priority rule boost`,
      });
      currentScore += rule.priorityBoost;
    }

    // Days since last email
    if (daysSinceLastEmail !== undefined && daysSinceLastEmail > 0) {
      const daysBoost = Math.min(30, 2 * Math.pow(daysSinceLastEmail, 1.5));
      breakdown.push({
        factor: 'Days Since Last Email',
        value: daysBoost,
        description: `${daysSinceLastEmail} days since last email from this sender (exponential boost)`,
      });
      currentScore += daysBoost;
    }

    // Urgent keywords
    if (this.checkIfUrgent(email)) {
      breakdown.push({
        factor: 'Urgent Keywords',
        value: 20,
        description: 'Email contains urgent keywords (urgent, asap, critical, etc.)',
      });
      currentScore += 20;
    }

    return {
      score: Math.max(0, Math.min(100, currentScore)),
      breakdown,
    };
  }

  /**
   * Search emails using the email provider's search functionality
   */
  async searchEmails(userId: string, query: string, maxResults: number = 50): Promise<Email[]> {
    // Use the injected EmailProviderManager
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error('No email provider connected');
    }

    // Use provider's search method
    const rawEmails = await provider.searchEmails(userId, query, maxResults);

    // Convert raw emails to database entities and save/fetch them
    const emails: Email[] = [];
    for (const rawEmail of rawEmails) {
      // Check if email already exists in DB
      let email = await this.getEmailByMessageId(userId, rawEmail.messageId);
      
      if (!email) {
        // Create new email entry from search result (without triggering full analysis)
        // Handle thread-level properties separately
        const starCount = (rawEmail as any).starCount || 0;
        const isArchived = false;
        const thread = await this.getOrCreateEmailThread(userId, rawEmail.threadId, starCount, isArchived);
        
        email = this.emailRepository.create({
          userId,
          messageId: rawEmail.messageId,
          threadId: rawEmail.threadId,
          emailThreadId: thread.id,
          subject: rawEmail.subject,
          from: rawEmail.from,
          fromName: rawEmail.fromName,
          body: rawEmail.body,
          htmlBody: rawEmail.htmlBody,
          receivedAt: rawEmail.receivedAt,
          priorityScore: 50, // Default score for search results
          isRead: rawEmail.isRead || false,
          isBatched: false,
        });
        email = await this.emailRepository.save(email);
      }
      
      emails.push(email);
    }

    return emails;
  }
}
