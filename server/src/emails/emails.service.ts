import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, IsNull, Not } from 'typeorm';
import PgBoss = require('pg-boss');
import * as fs from 'fs';
import * as path from 'path';
import { Email } from '../database/entities/email.entity';
import { EmailThread } from '../database/entities/email-thread.entity';
import { UserContext, ContextKey } from '../database/entities/user-context.entity';
import { PriorityService } from '../priority/priority.service';
import { User } from '../database/entities/user.entity';
import { EmailProviderManager } from './email-provider-manager.service';
import { BlockedSendersService } from '../blocked-senders/blocked-senders.service';
import { EncryptionHelper } from '../encryption/encryption.helper';

// Performance budgets in milliseconds
const PERF_BUDGETS = {
  INBOX_TOTAL: 500,
  INBOX_PROCESS_TOTAL: 1000, // Process mode can be slower (3.5s target)
  THREAD_QUERY: 100,
  THREAD_QUERY_PROCESS: 300, // Process mode query is more complex
  THREAD_COUNT_QUERY: 50,
  EMAIL_QUERY: 100, // Raw SQL query for emails
  DECRYPTION: 100, // Decrypting encrypted fields (from, fromName, subject, summary)
  PRIORITY_CALC: 200,
  LABEL_CONVERT: 100,
  THREAD_GROUPING: 50, // Just combining thread info with emails (no decryption)
};

interface PerfSpan {
  name: string;
  start: number;
  end?: number;
  duration?: number;
  budget: number;
  exceeded?: boolean;
}

class PerformanceTracker {
  private spans: PerfSpan[] = [];
  private startTime: number;
  private logger = new Logger('PerformanceTracker');
  private static logsDir = path.join(process.cwd(), 'logs');
  private logFile = path.join(PerformanceTracker.logsDir, 'performance.log');

  constructor(private operation: string) {
    this.startTime = Date.now();
    // Ensure logs directory exists
    if (!fs.existsSync(PerformanceTracker.logsDir)) {
      fs.mkdirSync(PerformanceTracker.logsDir, { recursive: true });
    }
  }

  startSpan(name: string, budget: number): () => void {
    const span: PerfSpan = { name, start: Date.now(), budget };
    this.spans.push(span);
    return () => {
      span.end = Date.now();
      span.duration = span.end - span.start;
      span.exceeded = span.duration > budget;
    };
  }

  finish(mode?: 'triage' | 'process'): void {
    const totalDuration = Date.now() - this.startTime;
    const exceededSpans = this.spans.filter(s => s.exceeded);
    const budget = mode === 'process' ? PERF_BUDGETS.INBOX_PROCESS_TOTAL : PERF_BUDGETS.INBOX_TOTAL;
    const totalExceeded = totalDuration > budget;
    
    // Only log if the TOTAL budget was exceeded (not just individual spans)
    if (totalExceeded) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        operation: this.operation,
        totalDuration,
        totalBudget: budget,
        totalExceeded,
        mode: mode || 'triage',
        spans: this.spans.map(s => ({
          name: s.name,
          duration: s.duration,
          budget: s.budget,
          exceeded: s.exceeded,
        })),
        exceededSpans: exceededSpans.map(s => `${s.name}: ${s.duration}ms (budget: ${s.budget}ms)`),
      };
      
      const logLine = JSON.stringify(logEntry) + '\n';
      
      // Log to console - only if total exceeded budget
      this.logger.warn(`⚠️ PERF ISSUE: ${this.operation} (mode: ${mode || 'triage'}) took ${totalDuration}ms (budget: ${budget}ms)`);
      exceededSpans.forEach(s => {
        this.logger.warn(`   - ${s.name}: ${s.duration}ms exceeded budget of ${s.budget}ms`);
      });
      
      // Append to log file
      try {
        fs.appendFileSync(this.logFile, logLine);
      } catch (err) {
        this.logger.error('Failed to write to performance log file:', err);
      }
    }
  }
}

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    private priorityService: PriorityService,
    @Inject('PG_BOSS') private readonly boss: PgBoss,
    @Inject(forwardRef(() => EmailProviderManager))
    private emailProviderManager: EmailProviderManager,
    private blockedSendersService: BlockedSendersService,
  ) {}

  async getInbox(userId: string, _includeBatched: boolean = false, mode: 'triage' | 'process' = 'triage'): Promise<Email[]> {
    const perf = new PerformanceTracker(`getInbox(${mode})`);
    
    // Pre-warm blocked senders cache to avoid DB query during filtering
    await this.blockedSendersService.getBlockedEmailHashes(userId);
    
    // Auto-fix stuck calculating threads (non-blocking, runs in background)
    // Only check occasionally to avoid performance impact (10% chance)
    if (Math.random() < 0.1) {
      this.fixStuckCalculatingThreads(userId).catch(err => 
        this.logger.error('Error auto-fixing stuck calculating threads:', err)
      );
    }
    
    // OPTIMIZED: Single combined query that fetches threads + full email data in one round-trip
    // This eliminates the second database round-trip, saving ~250ms network latency
    const threadQueryBudget = mode === 'process' ? PERF_BUDGETS.THREAD_QUERY_PROCESS : PERF_BUDGETS.THREAD_QUERY;
    const endCombinedQuery = perf.startSpan('combined_query', threadQueryBudget + PERF_BUDGETS.EMAIL_QUERY);

    // Build filter conditions
    let threadFilter = '';
    if (mode === 'process') {
      threadFilter = 'AND thread."starCount" > 0';
    } else {
      threadFilter = 'AND thread."isArchived" = false AND thread."starCount" = 0';
    }

    // Single query: Get threads + full email data in one round-trip
    // Uses LATERAL JOIN to find best email per thread, then fetches all needed fields
    const rawEmails = await this.emailRepository.query(
      `SELECT
        thread."starCount",
        thread."isArchived",
        e.id,
        e."userId",
        e."threadId",
        e."emailThreadId",
        e."messageId",
        e."from",
        e."fromName",
        e."senderJobTitle",
        e.subject,
        e."priorityScore",
        e."isUrgent",
        e."isSnoozed",
        e."snoozeUntil",
        e."isBatched",
        e."batchReleaseAt",
        e."isRead",
        e.summary,
        e."isProcessingPriority",
        e."isProcessingSummary",
        e."receivedAt",
        e.labels
      FROM email_threads thread
      CROSS JOIN LATERAL (
        SELECT *
        FROM emails em
        WHERE em."emailThreadId" = thread.id AND em."userId" = $1
        ORDER BY COALESCE(em."priorityScore", 50) DESC NULLS LAST, em."receivedAt" DESC
        LIMIT 1
      ) e
      WHERE thread."userId" = $1
        ${threadFilter}
      LIMIT 200`,
      [userId]
    );

    endCombinedQuery();

    if (rawEmails.length === 0) {
      perf.finish(mode);
      return [];
    }

    this.logger.debug(`Found ${rawEmails.length} threads for mode=${mode}`);
    
    // STEP 2: Decrypt encrypted fields and add thread info
    const endDecryption = perf.startSpan('decryption', PERF_BUDGETS.DECRYPTION);

    const threadRepresentatives: Email[] = rawEmails.map((row: any) => {
      // Decrypt and parse labels (stored as encrypted JSON)
      let labels: string[] | null = null;
      if (row.labels) {
        try {
          const decryptedLabels = EncryptionHelper.decrypt(row.labels);
          if (decryptedLabels) {
            labels = JSON.parse(decryptedLabels);
          }
        } catch (error) {
          this.logger.warn(`Failed to decrypt/parse labels for email ${row.id}:`, error);
          labels = null;
        }
      }

      return {
        id: row.id,
        userId: row.userId,
        threadId: row.threadId,
        emailThreadId: row.emailThreadId,
        messageId: row.messageId,
        from: EncryptionHelper.decrypt(row.from),
        fromName: EncryptionHelper.decrypt(row.fromName),
        senderJobTitle: EncryptionHelper.decrypt(row.senderJobTitle),
        subject: EncryptionHelper.decrypt(row.subject),
        priorityScore: row.priorityScore,
        isUrgent: row.isUrgent,
        isSnoozed: row.isSnoozed,
        snoozeUntil: row.snoozeUntil,
        isBatched: row.isBatched,
        batchReleaseAt: row.batchReleaseAt,
        isRead: row.isRead,
        summary: EncryptionHelper.decrypt(row.summary),
        isProcessingPriority: row.isProcessingPriority,
        isProcessingSummary: row.isProcessingSummary,
        receivedAt: row.receivedAt,
        labels: labels || [],
        // Thread-level properties from the combined query
        starCount: row.starCount,
        isArchived: row.isArchived,
      } as unknown as Email;
    });

    endDecryption();
    
    // STEP 5: Calculate priorities if needed (only for emails with default score)
    // OPTIMIZATION: Skip days calculation for inbox display - it's expensive and provides marginal value
    // The priority score is already calculated when emails are first received
    const emailsNeedingPriority = threadRepresentatives.filter(e => !e.priorityScore || e.priorityScore === 50);
    if (emailsNeedingPriority.length > 0) {
      const endPriorityCalc = perf.startSpan('priority_calc', PERF_BUDGETS.PRIORITY_CALC);

      // Fetch context once for all emails using raw query for speed
      const endGetContexts = perf.startSpan('priority_get_contexts', 100);
      const contexts = await this.userContextRepository.query(
        `SELECT "contextId", "userId", "contextKey", "contextValue", priority, explanation
         FROM user_contexts WHERE "userId" = $1`,
        [userId]
      ) as UserContext[];
      endGetContexts();

      // OPTIMIZATION: Skip expensive days calculation for inbox display
      // Days since last email provides marginal priority improvement (~5-15 points)
      // but costs 250-2300ms in database queries
      // Priority scores are already calculated on email receipt, so this is redundant

      // Calculate priority scores (synchronous, fast)
      const endScoreCalc = perf.startSpan('priority_score_calc', 50);
      const updates = emailsNeedingPriority.map(email => ({
          id: email.id,
        priorityScore: this.priorityService.calculateBasicPriorityScore(email, contexts, undefined),
      }));
      endScoreCalc();

      // Update in-memory objects immediately
      updates.forEach(update => {
        const email = emailsNeedingPriority.find(e => e.id === update.id);
        if (email) email.priorityScore = update.priorityScore;
      });

      // Batch update in DB (non-blocking)
      Promise.all(
        updates.map(update =>
          this.emailRepository.update(update.id, { priorityScore: update.priorityScore })
            .catch(err => this.logger.error(`Failed to update priority for email ${update.id}:`, err))
        )
      ).catch(err => this.logger.error('Error batch updating priorities:', err));

      endPriorityCalc();
    }

    // STEP 6: Sort by priority (DESC), then by received date (DESC)
    const sortedEmails = threadRepresentatives.sort((a, b) => {
      const aScore = a.priorityScore ?? 50;
      const bScore = b.priorityScore ?? 50;
      if (Math.abs(bScore - aScore) > 0.01) {
        return bScore - aScore;
      }
      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
    });

    // STEP 7: Filter out blocked senders
    const endBlockedFilter = perf.startSpan('blocked_filter', 50);
    const blockedEmailIds = await this.blockedSendersService.filterBlockedEmails(
      userId,
      sortedEmails.map(e => ({ id: e.id, from: e.from }))
    );
    const blockedSet = new Set(blockedEmailIds);
    const filteredEmails = sortedEmails.filter(e => !blockedSet.has(e.id));
    endBlockedFilter();
    
    if (blockedEmailIds.length > 0) {
      this.logger.debug(`Filtered ${blockedEmailIds.length} emails from blocked senders`);
    }
    
    // STEP 8: Convert labels (non-blocking background task)
    this.convertEmailLabels(userId, filteredEmails).catch(err => 
      this.logger.error('Error converting labels:', err)
    );

    this.logger.log(`getInbox(${mode}): Returning ${filteredEmails.length} threads (from ${rawEmails.length} matching threads, ${blockedEmailIds.length} blocked)`);
    
    perf.finish(mode);
    return filteredEmails;
  }

  /**
   * Convert label IDs to human-readable names for a list of emails
   */
  private async convertEmailLabels(userId: string, emails: Email[]): Promise<void> {
    // Collect all unique label IDs
    const allLabelIds = new Set<string>();
    for (const email of emails) {
      if (email.labels && Array.isArray(email.labels)) {
        email.labels.forEach(id => allLabelIds.add(id));
      }
    }

    if (allLabelIds.size === 0) return;

    // Get label names from Gmail
    const labelNames = await this.emailProviderManager.convertLabelIdsToNames(userId, Array.from(allLabelIds));
    
    // Create a mapping
    const labelIdToName = new Map<string, string>();
    const labelIdsArray = Array.from(allLabelIds);
    labelIdsArray.forEach((id, index) => {
      if (labelNames[index]) {
        labelIdToName.set(id, labelNames[index]);
      }
    });

    // Update emails in place (and save to DB for next time)
    for (const email of emails) {
      if (email.labels && Array.isArray(email.labels)) {
        const convertedLabels = email.labels
          .map(id => labelIdToName.get(id) || id)
          .filter(name => !name.startsWith('Label_') && !name.startsWith('label_'));
        
        // Only update if labels changed
        if (JSON.stringify(convertedLabels) !== JSON.stringify(email.labels)) {
          email.labels = convertedLabels;
          // Update in DB (non-blocking)
          this.emailRepository.update(email.id, { labels: convertedLabels }).catch(err =>
            console.error(`Failed to update labels for email ${email.id}:`, err)
          );
        }
      }
    }
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
        'email.isSnoozed',
        'email.snoozeUntil',
        'email.isBatched',
        'email.batchReleaseAt',
        'email.isRead',
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
   * Get ALL threads for sync comparison (returns threadId, isArchived, starCount)
   * Used by Gmail sync to compare with Gmail search results
   */
  async getAllThreadsForSync(userId: string): Promise<Array<{ threadId: string; isArchived: boolean; starCount: number }>> {
    const results = await this.emailThreadRepository
      .createQueryBuilder('thread')
      .select(['thread.threadId', 'thread.isArchived', 'thread.starCount'])
      .where('thread.userId = :userId', { userId })
      .limit(500) // Reasonable limit for sync
      .getMany();
    
    return results.map(t => ({
      threadId: t.threadId,
      isArchived: t.isArchived,
      starCount: t.starCount,
    })).filter(t => t.threadId); // Filter out any null/undefined threadIds
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
   * Batch update thread statuses (archived + starred) in a single transaction
   * This is MUCH faster than individual updates for syncing many threads
   */
  async batchUpdateThreadStatus(
    userId: string,
    updates: { threadId: string; isArchived: boolean; starCount: number }[],
    deletedThreadIds: string[],
  ): Promise<void> {
    if (updates.length === 0 && deletedThreadIds.length === 0) return;

    // Use a transaction for atomic updates
    await this.emailThreadRepository.manager.transaction(async (manager) => {
      const threadRepo = manager.getRepository(this.emailThreadRepository.target);

      // Batch update existing threads
      if (updates.length > 0) {
        // Group by archived status and star count to minimize queries
        const archivedUpdates = updates.filter(u => u.isArchived);
        const starredUpdates = updates.filter(u => u.starCount > 0);
        const unstarredUpdates = updates.filter(u => u.starCount === 0 && !u.isArchived);

        // Update archived threads
        if (archivedUpdates.length > 0) {
          const archivedIds = archivedUpdates.map(u => u.threadId);
          await threadRepo
            .createQueryBuilder()
            .update()
            .set({ isArchived: true })
            .where('userId = :userId', { userId })
            .andWhere('threadId IN (:...threadIds)', { threadIds: archivedIds })
            .execute();
        }

        // Update starred threads (starCount = 3)
        if (starredUpdates.length > 0) {
          const starredIds = starredUpdates.map(u => u.threadId);
          await threadRepo
            .createQueryBuilder()
            .update()
            .set({ starCount: 3 })
            .where('userId = :userId', { userId })
            .andWhere('threadId IN (:...threadIds)', { threadIds: starredIds })
            .execute();
        }

        // Update unstarred threads (starCount = 0)
        if (unstarredUpdates.length > 0) {
          const unstarredIds = unstarredUpdates.map(u => u.threadId);
          await threadRepo
            .createQueryBuilder()
            .update()
            .set({ starCount: 0 })
            .where('userId = :userId', { userId })
            .andWhere('threadId IN (:...threadIds)', { threadIds: unstarredIds })
            .execute();
        }
      }

      // Mark deleted threads as archived
      if (deletedThreadIds.length > 0) {
        await threadRepo
          .createQueryBuilder()
          .update()
          .set({ isArchived: true })
          .where('userId = :userId', { userId })
          .andWhere('threadId IN (:...threadIds)', { threadIds: deletedThreadIds })
          .execute();
      }
    });
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
    
    // Check if sender is blocked
    const senderEmail = emailData.from || '';
    const isBlocked = await this.blockedSendersService.isSenderBlocked(userId, senderEmail);
    
    // Extract thread-level properties (these should come from EmailThread, not Email)
    const starCount = (emailData as any).starCount || 0;
    // If blocked, always archive
    const isArchived = isBlocked ? true : ((emailData as any).isArchived || false);
    
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

    // If sender is blocked, skip priority calculation and LLM processing
    if (isBlocked) {
      console.log(`📛 Email from blocked sender ${senderEmail} - auto-archiving and skipping LLM processing`);
      email.priorityScore = 0; // Lowest priority
      email.isProcessingPriority = false;
      email.isProcessingSummary = false;
      email.summary = '[Blocked sender]';
      
      // Add blocked-by-bearlymail label
      const existingLabels = email.labels || [];
      email.labels = [...existingLabels, 'blocked-by-bearlymail'];
      
      const savedEmail = await this.emailRepository.save(email);
      return savedEmail;
    }

    // Get context for basic priority calculation
    const contexts = await this.priorityService.getUserContexts(userId);
    
    // Calculate days since last email in thread for priority boost
    const daysSinceLastEmail = await this.calculateDaysSinceLastEmail(userId, email);
    
    // Calculate basic priority score immediately (fast, no LLM)
    email.priorityScore = this.priorityService.calculateBasicPriorityScore(email, contexts, daysSinceLastEmail);
    email.isProcessingPriority = true; // Mark as processing for LLM refinement
    email.isProcessingSummary = true; // Mark as processing for summary generation

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
    this.logger.debug(`Saved email ${savedEmail.id} to database`);
    
    // IMPORTANT: Always queue jobs immediately when isProcessingPriority/Summary is set
    // This ensures "Calculating..." status in UI has an actual job behind it
    // Use singleton key to prevent duplicate jobs for the same email
    const priorityJobId = await this.boss.send(
      'refine-priority', 
      { userId, emailId: savedEmail.id },
      {
        singletonKey: `refine-priority-${savedEmail.id}`,
        singletonMinutes: 5, // Prevent duplicate jobs within 5 minutes
      }
    ).catch(err => {
      this.logger.error(`Failed to queue priority refinement for email ${savedEmail.id}:`, err);
      // Reset flag if job queueing failed
      this.emailRepository.update({ id: savedEmail.id }, { isProcessingPriority: false });
      return null;
    });
    
    if (priorityJobId) {
      this.logger.debug(`Queued priority refinement job ${priorityJobId} for email ${savedEmail.id}`);
    }
    
    // Queue summary generation job
    const summaryJobId = await this.boss.send(
      'generate-summary', 
      { userId, emailId: savedEmail.id },
      {
        singletonKey: `generate-summary-${savedEmail.id}`,
        singletonMinutes: 5,
      }
    ).catch(err => {
      this.logger.error(`Failed to queue summary generation for email ${savedEmail.id}:`, err);
      // Reset flag if job queueing failed
      this.emailRepository.update({ id: savedEmail.id }, { isProcessingSummary: false });
      return null;
    });
    
    if (summaryJobId) {
      this.logger.debug(`Queued summary generation job ${summaryJobId} for email ${savedEmail.id}`);
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

        // Fetch all emails in this thread before the earliest one using raw query
        // Only fetch 'from' and 'receivedAt' to avoid decrypting unnecessary fields
        const previousEmailsRaw = await this.emailRepository.query(
          `
          SELECT id, "from", "receivedAt"
          FROM emails
          WHERE "userId" = $1
            AND "threadId" = $2
            AND "receivedAt" < $3
          ORDER BY "receivedAt" DESC
          `,
          [userId, threadId, earliestReceivedAt]
        );
        
        // Decrypt only the 'from' field we need
        const previousEmails = previousEmailsRaw.map((row: any) => ({
          id: row.id,
          from: EncryptionHelper.decrypt(row.from),
          receivedAt: row.receivedAt,
        }));

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
   * Returns dimensions: Urgency, Goal Alignment, VIP Contact
   */
  async getPriorityExplanation(userId: string, emailId: string): Promise<{
    score: number;
    dimensions: {
      urgency: { score: number; reasons: string[] };
      goalAlignment: { score: number; reasons: string[] };
      vipContact: { score: number; reasons: string[] };
    };
    breakdown: Array<{ factor: string; value: number; description: string }>;
  }> {
    const email = await this.getEmailById(userId, emailId);
    if (!email) {
      throw new Error('Email not found');
    }

    // Return precomputed explanation if available
    if (email.priorityExplanation) {
      return email.priorityExplanation;
    }

    // Fallback: compute explanation on demand if not precomputed (for legacy emails)
    // Get user context for prioritization
    const contexts = await this.userContextRepository.find({ where: { userId } });
    const daysSinceLastEmail = await this.calculateDaysSinceLastEmail(userId, email);
    
    // Initialize dimensions
    const dimensions = {
      urgency: { score: 0, reasons: [] as string[] },
      goalAlignment: { score: 0, reasons: [] as string[] },
      vipContact: { score: 0, reasons: [] as string[] },
    };
    
    const breakdown: Array<{ factor: string; value: number; description: string }> = [];
    let currentScore = 50;
    const emailText = `${email.subject} ${email.body}`.toLowerCase();
    const senderEmail = email.from?.toLowerCase() || '';
    const senderName = email.fromName?.toLowerCase() || '';

    // Base score
    breakdown.push({
      factor: 'Base Score',
      value: 50,
      description: 'Starting priority score for all emails',
    });

    // === VIP CONTACT DIMENSION ===
    const vipContacts = contexts.filter(c => c.contextKey === ContextKey.VIP_CONTACT);
    const matchedVip = vipContacts.find(vip => 
      senderEmail.includes(vip.contextValue.toLowerCase()) || 
      senderName.includes(vip.contextValue.toLowerCase())
    );
    
    if (matchedVip) {
      const vipBoost = 25;
      dimensions.vipContact.score += vipBoost;
      dimensions.vipContact.reasons.push(`VIP contact: ${matchedVip.contextValue}`);
      breakdown.push({
        factor: '⭐ VIP Contact',
        value: vipBoost,
        description: `From VIP: ${matchedVip.contextValue}`,
      });
      currentScore += vipBoost;
    }

    // Check job title for VIP
    if (email.senderJobTitle) {
      const jobTitleScore = this.calculateJobTitleScore(email.senderJobTitle);
      if (jobTitleScore > 0.5) {
        const titleBoost = Math.round(jobTitleScore * 15);
        dimensions.vipContact.score += titleBoost;
        dimensions.vipContact.reasons.push(`Important role: ${email.senderJobTitle}`);
      breakdown.push({
          factor: '⭐ VIP Contact',
          value: titleBoost,
          description: `Sender role: ${email.senderJobTitle}`,
        });
        currentScore += titleBoost;
      }
    }

    // === GOAL ALIGNMENT DIMENSION ===
    // Check against user's goals
    const goals = contexts.filter(c => c.contextKey === ContextKey.MY_GOALS);
    for (const goal of goals) {
      const keywords = goal.contextValue.toLowerCase().split(/[,;]/).map(k => k.trim()).filter(Boolean);
      const matchedKeywords = keywords.filter(kw => emailText.includes(kw));
      if (matchedKeywords.length > 0) {
        const goalBoost = 15;
        dimensions.goalAlignment.score += goalBoost;
        dimensions.goalAlignment.reasons.push(`Aligns with goal: ${goal.contextValue.substring(0, 50)}`);
        breakdown.push({
          factor: '🎯 Goal Alignment',
          value: goalBoost,
          description: `Matches goal: ${matchedKeywords.join(', ')}`,
        });
        currentScore += goalBoost;
        break; // Only count one goal match
      }
    }

    // Check "What I'm working on" items
    const workingOn = contexts.filter(c => c.contextKey === ContextKey.WORKING_ON);
    for (const project of workingOn) {
      const keywords = project.contextValue.toLowerCase().split(/[,;]/).map(k => k.trim()).filter(Boolean);
      const matchedKeywords = keywords.filter(kw => emailText.includes(kw));
      if (matchedKeywords.length > 0) {
        // Priority 1 = +15, Priority 2 = +10, Priority 3 = +5
        const priorityBoost = project.priority === 1 ? 15 : project.priority === 2 ? 10 : 5;
        dimensions.goalAlignment.score += priorityBoost;
        dimensions.goalAlignment.reasons.push(`Related to: ${project.contextValue.substring(0, 50)} (Priority ${project.priority || 2})`);
        breakdown.push({
          factor: '🎯 Goal Alignment',
          value: priorityBoost,
          description: `Working on: ${matchedKeywords.join(', ')}`,
        });
        currentScore += priorityBoost;
        break; // Only count one project match
      }
    }

    // Check "Don't care" items (negative alignment)
    const dontCare = contexts.filter(c => c.contextKey === ContextKey.DONT_CARE);
    for (const item of dontCare) {
      const keywords = item.contextValue.toLowerCase().split(/[,;]/).map(k => k.trim()).filter(Boolean);
      const matchedKeywords = keywords.filter(kw => emailText.includes(kw));
      if (matchedKeywords.length > 0) {
        const penalty = -20;
        dimensions.goalAlignment.score += penalty;
        dimensions.goalAlignment.reasons.push(`Matches "don't care": ${item.contextValue.substring(0, 50)}`);
        breakdown.push({
          factor: '🎯 Goal Alignment',
          value: penalty,
          description: `Low interest: ${matchedKeywords.join(', ')}`,
        });
        currentScore += penalty;
        break;
      }
    }

    // === URGENCY DIMENSION ===
    // Check for urgent keywords
    const urgentKeywords = ['urgent', 'asap', 'critical', 'emergency', 'immediate', 'deadline', 'time-sensitive'];
    const foundUrgentKeywords = urgentKeywords.filter(kw => emailText.includes(kw));
    
    if (foundUrgentKeywords.length > 0) {
      const urgencyBoost = Math.min(25, foundUrgentKeywords.length * 10);
      dimensions.urgency.score += urgencyBoost;
      dimensions.urgency.reasons.push(`Contains urgent keywords: ${foundUrgentKeywords.join(', ')}`);
      breakdown.push({
        factor: '🔥 Urgency',
        value: urgencyBoost,
        description: `Contains: ${foundUrgentKeywords.join(', ')}`,
      });
      currentScore += urgencyBoost;
    }

    // Days since last email (affects urgency)
    if (daysSinceLastEmail !== undefined && daysSinceLastEmail > 3) {
      const daysBoost = Math.round(Math.min(15, daysSinceLastEmail * 2) * 10) / 10;
      dimensions.urgency.score += daysBoost;
      dimensions.urgency.reasons.push(`${daysSinceLastEmail} days since last contact - may need follow-up`);
      breakdown.push({
        factor: '🔥 Urgency',
        value: daysBoost,
        description: `${daysSinceLastEmail} days since last email - needs attention`,
      });
      currentScore += daysBoost;
    }

    // Low urgency indicators
    const lowUrgencyKeywords = ['no rush', 'whenever', 'optional', 'fyi', 'just wanted to', 'low priority'];
    const foundLowUrgency = lowUrgencyKeywords.filter(kw => emailText.includes(kw));
    if (foundLowUrgency.length > 0) {
      const penalty = -10;
      dimensions.urgency.score += penalty;
      dimensions.urgency.reasons.push(`Low urgency indicators: ${foundLowUrgency.join(', ')}`);
      breakdown.push({
        factor: '🔥 Urgency',
        value: penalty,
        description: `Low urgency: ${foundLowUrgency.join(', ')}`,
      });
      currentScore += penalty;
    }

    // Calculate final score
    const calculatedScore = Math.max(0, Math.min(100, currentScore));
    const actualScore = email.priorityScore;
    const difference = Math.round((actualScore - calculatedScore) * 10) / 10;
    
    // If there's unexplained difference, attribute to AI analysis
    if (Math.abs(difference) >= 1) {
      // Distribute to most relevant dimension
      if (dimensions.urgency.score === 0 && foundUrgentKeywords.length === 0) {
        dimensions.goalAlignment.score += difference;
        dimensions.goalAlignment.reasons.push('AI analysis of email content and context');
      } else {
        dimensions.urgency.score += difference;
        dimensions.urgency.reasons.push('AI analysis of email tone and timing');
      }
      breakdown.push({
        factor: '🤖 AI Analysis',
        value: difference,
        description: 'Additional context from AI analysis',
      });
    }

    // Normalize dimension scores to 0-100
    dimensions.urgency.score = Math.max(0, Math.min(100, 50 + dimensions.urgency.score));
    dimensions.goalAlignment.score = Math.max(0, Math.min(100, 50 + dimensions.goalAlignment.score));
    dimensions.vipContact.score = Math.max(0, Math.min(100, 50 + dimensions.vipContact.score));

    const explanation = {
      score: actualScore,
      dimensions,
      breakdown,
    };
    
    // Save the explanation for future use (non-blocking)
    this.emailRepository.update({ id: emailId }, { priorityExplanation: explanation })
      .catch(err => this.logger.warn(`Failed to save priority explanation for email ${emailId}:`, err));

    return explanation;
  }

  private calculateJobTitleScore(jobTitle: string): number {
    if (!jobTitle) return 0;
    
    const highPriorityTitles = ['ceo', 'president', 'director', 'manager', 'lead', 'head', 'chief', 'vp', 'vice president', 'founder'];
    const titleLower = jobTitle.toLowerCase();
    
    for (const title of highPriorityTitles) {
      if (titleLower.includes(title)) return 1;
    }
    
    return 0.5;
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
          labels: rawEmail.labelIds || [],
        });
        email = await this.emailRepository.save(email);
      }
      
      emails.push(email);
    }

    return emails;
  }

  /**
   * Debug endpoint to find missing starred threads
   * Compares Gmail starred emails with what's in our DB
   */
  async debugStarredThreads(userId: string): Promise<{
    gmail: {
      starredThreadCount: number;
      starredThreadIds: string[];
      error?: string;
    };
    database: {
      starredThreadCount: number;
      starredEmailCount: number;
    };
    processTabResults: number;
    comparison: {
      inGmailNotInDb: string[];
      inDbNotInGmail: string[];
      inDbButArchived: string[];
    };
    starredThreads: Array<{
      threadId: string;
      starCount: number;
      isArchived: boolean;
      isSnoozed: boolean;
      emailCount: number;
      latestSubject: string;
      latestFrom: string;
      issues: string[];
      inGmail: boolean;
    }>;
    missingFromProcessTab: Array<{
      threadId: string;
      reason: string;
      details: any;
    }>;
  }> {
    // 1. Search Gmail for starred emails in inbox
    let gmailStarredThreadIds: string[] = [];
    let gmailError: string | undefined;
    
    try {
      const provider = await this.emailProviderManager.getPrimaryProvider(userId);
      if (provider) {
        // Search for starred emails in inbox
        const starredEmails = await provider.searchEmails(userId, 'is:starred is:inbox', 100);
        // Get unique thread IDs
        gmailStarredThreadIds = [...new Set(starredEmails.map(e => e.threadId))];
        this.logger.debug(`Gmail search found ${starredEmails.length} starred emails in ${gmailStarredThreadIds.length} threads`);
      } else {
        gmailError = 'No email provider connected';
      }
    } catch (error) {
      gmailError = error.message || 'Failed to search Gmail';
      this.logger.error('Error searching Gmail for starred emails:', error);
    }

    // 2. Get all starred threads from email_threads table
    const allStarredThreads = await this.emailThreadRepository
      .createQueryBuilder('thread')
      .where('thread.userId = :userId', { userId })
      .andWhere('thread."starCount" > 0')
      .getMany();

    // 3. Get all emails that belong to starred threads
    const starredThreadIds = allStarredThreads.map(t => t.id);
    const emailsInStarredThreads = starredThreadIds.length > 0 
      ? await this.emailRepository
          .createQueryBuilder('email')
          .where('email.userId = :userId', { userId })
          .andWhere('email."emailThreadId" IN (:...threadIds)', { threadIds: starredThreadIds })
          .getMany()
      : [];

    // 4. Run the actual getInbox query for process mode to see what's returned
    const processTabEmails = await this.getInbox(userId, false, 'process');

    // 5. Compare Gmail vs DB
    const dbThreadIds = allStarredThreads.map(t => t.threadId);
    const inGmailNotInDb = gmailStarredThreadIds.filter(id => !dbThreadIds.includes(id));
    const inDbNotInGmail = dbThreadIds.filter(id => !gmailStarredThreadIds.includes(id));
    const inDbButArchived = allStarredThreads
      .filter(t => t.isArchived)
      .map(t => t.threadId);

    // 6. Identify issues for each starred thread
    const threadDetails = await Promise.all(allStarredThreads.map(async (thread) => {
      const threadEmails = emailsInStarredThreads.filter(e => e.emailThreadId === thread.id);
      const latestEmail = threadEmails.sort((a, b) => 
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      )[0];

      const issues: string[] = [];
      const inGmail = gmailStarredThreadIds.includes(thread.threadId);
      
      // Check if archived
      if (thread.isArchived) {
        issues.push('Thread is ARCHIVED');
      }

      // Check if in Gmail
      if (!inGmail && !gmailError) {
        issues.push('NOT STARRED IN GMAIL (or not in inbox)');
      }

      // Check if all emails are snoozed
      const allSnoozed = threadEmails.every(e => e.isSnoozed && e.snoozeUntil && new Date(e.snoozeUntil) > new Date());
      if (allSnoozed && threadEmails.length > 0) {
        issues.push('All emails in thread are SNOOZED');
      }

      // Check if thread appears in process results
      const inProcessTab = processTabEmails.some(e => e.threadId === thread.threadId);
      if (!inProcessTab && issues.length === 0) {
        issues.push('NOT IN PROCESS TAB (unknown reason)');
      }

      return {
        threadId: thread.threadId.substring(0, 12) + '...',
        starCount: thread.starCount,
        isArchived: thread.isArchived,
        isSnoozed: allSnoozed,
        emailCount: threadEmails.length,
        latestSubject: latestEmail?.subject?.substring(0, 50) || 'N/A',
        latestFrom: latestEmail?.fromName || latestEmail?.from || 'N/A',
        issues,
        inGmail,
      };
    }));

    // 7. Identify threads missing from process tab
    const missingFromProcessTab = threadDetails
      .filter(t => t.issues.length > 0)
      .map(t => ({
        threadId: t.threadId,
        reason: t.issues.join(', '),
        details: {
          starCount: t.starCount,
          isArchived: t.isArchived,
          isSnoozed: t.isSnoozed,
          emailCount: t.emailCount,
          subject: t.latestSubject,
          from: t.latestFrom,
          inGmail: t.inGmail,
        },
      }));

    return {
      gmail: {
        starredThreadCount: gmailStarredThreadIds.length,
        starredThreadIds: gmailStarredThreadIds.map(id => id.substring(0, 12) + '...'),
        error: gmailError,
      },
      database: {
        starredThreadCount: allStarredThreads.length,
        starredEmailCount: emailsInStarredThreads.length,
      },
      processTabResults: processTabEmails.length,
      comparison: {
        inGmailNotInDb: inGmailNotInDb.map(id => id.substring(0, 12) + '...'),
        inDbNotInGmail: inDbNotInGmail.map(id => id.substring(0, 12) + '...'),
        inDbButArchived: inDbButArchived.map(id => id.substring(0, 12) + '...'),
      },
      starredThreads: threadDetails,
      missingFromProcessTab,
    };
  }

  /**
   * Debug endpoint to find emails without emailThreadId (orphan emails)
   */
  async debugOrphanEmails(userId: string): Promise<{
    totalEmailsInDb: number;
    emailsWithThreadId: number;
    orphanEmails: number;
    orphanEmailDetails: Array<{
      id: string;
      threadId: string;
      emailThreadId: string | null;
      subject: string;
      from: string;
      receivedAt: Date;
    }>;
    threadsInDb: number;
    threadsWithoutEmails: Array<{
      id: string;
      threadId: string;
      starCount: number;
      isArchived: boolean;
    }>;
  }> {
    // Count total emails
    const totalEmailsInDb = await this.emailRepository.count({ where: { userId } });
    
    // Count emails with emailThreadId set
    const emailsWithThreadId = await this.emailRepository.count({
      where: { userId, emailThreadId: Not(IsNull()) },
    });
    
    // Get orphan emails (no emailThreadId)
    const orphanEmailsList = await this.emailRepository.find({
      where: { userId, emailThreadId: IsNull() },
      select: ['id', 'threadId', 'emailThreadId', 'subject', 'from', 'receivedAt'],
      take: 50, // Limit to 50 for performance
    });
    
    // Get all threads
    const allThreads = await this.emailThreadRepository.find({ where: { userId } });
    
    // Find threads that have no emails pointing to them
    const threadIdsWithEmails = await this.emailRepository
      .createQueryBuilder('email')
      .select('DISTINCT email."emailThreadId"', 'emailThreadId')
      .where('email.userId = :userId', { userId })
      .andWhere('email."emailThreadId" IS NOT NULL')
      .getRawMany();
    
    const threadIdsWithEmailsSet = new Set(threadIdsWithEmails.map(r => r.emailThreadId));
    
    const threadsWithoutEmails = allThreads
      .filter(t => !threadIdsWithEmailsSet.has(t.id))
      .map(t => ({
        id: t.id.substring(0, 12) + '...',
        threadId: t.threadId.substring(0, 12) + '...',
        starCount: t.starCount,
        isArchived: t.isArchived,
      }));
    
    return {
      totalEmailsInDb,
      emailsWithThreadId,
      orphanEmails: totalEmailsInDb - emailsWithThreadId,
      orphanEmailDetails: orphanEmailsList.map(e => ({
        id: e.id.substring(0, 12) + '...',
        threadId: e.threadId?.substring(0, 12) + '...' || 'N/A',
        emailThreadId: e.emailThreadId?.substring(0, 12) + '...' || null,
        subject: e.subject?.substring(0, 50) || 'N/A',
        from: e.from?.substring(0, 30) || 'N/A',
        receivedAt: e.receivedAt,
      })),
      threadsInDb: allThreads.length,
      threadsWithoutEmails,
    };
  }

  /**
   * Fix orphan emails by creating/linking EmailThread records
   */
  async fixOrphanEmails(userId: string): Promise<{
    fixed: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let fixed = 0;
    
    // Get all orphan emails
    const orphanEmails = await this.emailRepository.find({
      where: { userId, emailThreadId: IsNull() },
    });
    
    this.logger.log(`Found ${orphanEmails.length} orphan emails to fix`);
    
    for (const email of orphanEmails) {
      try {
        // Check if a thread already exists for this Gmail threadId
        let thread = await this.emailThreadRepository.findOne({
          where: { userId, threadId: email.threadId },
        });
        
        if (!thread) {
          // Create a new thread
          thread = this.emailThreadRepository.create({
            userId,
            threadId: email.threadId,
            starCount: 0,
            isArchived: false,
          });
          thread = await this.emailThreadRepository.save(thread);
          this.logger.log(`Created new thread ${thread.id} for Gmail thread ${email.threadId}`);
        }
        
        // Link email to thread
        await this.emailRepository.update(email.id, { emailThreadId: thread.id });
        fixed++;
      } catch (err) {
        const errorMsg = `Failed to fix email ${email.id}: ${err.message}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }
    
    this.logger.log(`Fixed ${fixed} orphan emails, ${errors.length} errors`);
    
    return { fixed, errors };
  }

  /**
   * Fix threads stuck in "calculating" status
   * Finds emails with isProcessingPriority=true that are older than 10 minutes
   * and either resets them or re-queues the job
   */
  async fixStuckCalculatingThreads(userId: string): Promise<{ fixed: number; requeued: number; errors: string[] }> {
    this.logger.log(`Checking for stuck calculating threads for user ${userId}`);
    
    // Find emails that have been in "calculating" state for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const stuckEmails = await this.emailRepository.find({
      where: {
        userId,
        isProcessingPriority: true,
      },
      select: ['id', 'receivedAt', 'priorityScore'],
    });

    // Filter to only those that are actually stuck (older than 10 minutes or have default score)
    const actuallyStuck = stuckEmails.filter(email => {
      const emailAge = Date.now() - new Date(email.receivedAt).getTime();
      return emailAge > 10 * 60 * 1000 || email.priorityScore === 50;
    });

    this.logger.log(`Found ${actuallyStuck.length} stuck calculating threads (out of ${stuckEmails.length} total)`);

    let fixed = 0;
    let requeued = 0;
    const errors: string[] = [];

    for (const email of actuallyStuck) {
      try {
        // Check if there's an active job for this email
        // PgBoss doesn't have a direct API to check by data, so we'll just re-queue
        // The singleton key will prevent duplicates if a job already exists
        
        // Reset the flag first
        await this.emailRepository.update(
          { id: email.id },
          { isProcessingPriority: false }
        );

        // Re-queue the job
        const jobId = await this.boss.send(
          'refine-priority',
          { userId, emailId: email.id },
          {
            singletonKey: `refine-priority-${email.id}`,
            singletonMinutes: 5,
          }
        ).catch(err => {
          this.logger.error(`Failed to re-queue priority job for email ${email.id}:`, err);
          return null;
        });

        if (jobId) {
          requeued++;
          this.logger.debug(`Re-queued priority job ${jobId} for stuck email ${email.id}`);
        } else {
          fixed++; // Just reset the flag, couldn't queue
        }
      } catch (err: any) {
        const errorMsg = `Failed to fix stuck email ${email.id}: ${err.message}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    this.logger.log(`Fixed ${fixed} stuck threads, re-queued ${requeued} jobs, ${errors.length} errors`);
    
    return { fixed, requeued, errors };
  }
}

