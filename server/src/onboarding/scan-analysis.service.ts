import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PgBoss = require('pg-boss');
import { ScanEmail } from '../database/entities/scan-email.entity';
import { ScanEmailService } from '../emails/scan-email.service';
import { PriorityService } from '../priority/priority.service';
import { PriorityRule, RuleType } from '../database/entities/priority-rule.entity';
import { ContextService } from '../context/context.service';
import { ContextKey, Source } from '../database/entities/user-context.entity';
import { google } from 'googleapis';
import { UsersService } from '../users/users.service';

@Injectable()
export class ScanAnalysisService {
  private readonly logger = new Logger(ScanAnalysisService.name);

  constructor(
    @InjectRepository(ScanEmail)
    private scanEmailRepository: Repository<ScanEmail>,
    private scanEmailService: ScanEmailService,
    private priorityService: PriorityService,
    private contextService: ContextService,
    private usersService: UsersService,
    @Inject('PG_BOSS') private readonly boss: PgBoss,
  ) {}

  /**
   * Analyze all scanned emails and create priority rules and user context
   * Called after scan completes
   */
  async analyzeScanResults(userId: string): Promise<void> {
    this.logger.log(`Starting analysis of scan results for user ${userId}`);

    try {
      const scanEmails = await this.scanEmailService.findAllForUser(userId);
      if (scanEmails.length === 0) {
        this.logger.warn(`No scan emails found for user ${userId}, skipping analysis`);
        return;
      }

      this.logger.log(`Analyzing ${scanEmails.length} scanned emails for user ${userId}`);

      // Enrich scan emails with reply/archive data from Gmail
      await this.enrichScanEmails(userId, scanEmails);

      // Analyze and create priority rules
      await this.createPriorityRules(userId, scanEmails);

      // Create user context from scanned emails
      await this.createUserContext(userId, scanEmails);

      // Delete temporary scan emails
      await this.scanEmailService.deleteAllForUser(userId);
      this.logger.log(`Deleted ${scanEmails.length} temporary scan emails for user ${userId}`);

      this.logger.log(`Completed analysis for user ${userId}`);
    } catch (error) {
      this.logger.error(`Error analyzing scan results for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Enrich scan emails with reply time and archive status from Gmail threads
   */
  private async enrichScanEmails(userId: string, scanEmails: ScanEmail[]): Promise<void> {
    const user = await this.usersService.findOne(userId);
    if (!user?.googleCalendarAccessToken) {
      this.logger.warn(`User ${userId} not connected, skipping enrichment`);
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: user.googleCalendarAccessToken,
      refresh_token: user.googleCalendarRefreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Group by thread to analyze replies
    const threadMap = new Map<string, ScanEmail[]>();
    for (const email of scanEmails) {
      if (!threadMap.has(email.threadId)) {
        threadMap.set(email.threadId, []);
      }
      threadMap.get(email.threadId)!.push(email);
    }

    // Analyze each thread
    for (const [threadId, emails] of threadMap.entries()) {
      try {
        const thread = await gmail.users.threads.get({
          userId: 'me',
          id: threadId,
          format: 'full',
        });

        const messages = thread.data.messages || [];
        const originalEmail = emails[0]; // First email in thread

        // Check if user replied (has a SENT label in thread - more reliable than checking From header)
        const userReplied = messages.some((msg: any) => {
          const labelIds = msg.labelIds || [];
          return labelIds.includes('SENT');
        });

        if (userReplied) {
          // Find user's first reply (message with SENT label)
          const replyMessage = messages.find((msg: any) => {
            const labelIds = msg.labelIds || [];
            return labelIds.includes('SENT');
          });

          if (replyMessage && originalEmail.receivedAt) {
            const replyDate = new Date(parseInt(replyMessage.internalDate || '0'));
            const receivedDate = originalEmail.receivedAt;
            const hoursToReply = (replyDate.getTime() - receivedDate.getTime()) / (1000 * 60 * 60);
            originalEmail.timeToReply = Math.max(0, hoursToReply);
            originalEmail.wasRepliedTo = true;
          }
        }

        // Check if archived (not in INBOX label)
        const lastMessage = messages[messages.length - 1];
        const labelIds = lastMessage.labelIds || [];
        const isArchived = !labelIds.includes('INBOX');

        for (const email of emails) {
          email.isArchived = isArchived;
          if (isArchived && !email.archivedAt) {
            email.archivedAt = email.receivedAt;
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to enrich thread ${threadId}:`, error);
      }
    }

    // Save enriched emails
    await this.scanEmailRepository.save(scanEmails);
  }

  /**
   * Create priority rules based on email patterns
   */
  private async createPriorityRules(userId: string, scanEmails: ScanEmail[]): Promise<void> {
    // Analyze senders user replied to quickly
    const quickReplySenders = new Map<string, { count: number; avgHours: number }>();
    const starredSenders = new Map<string, number>();
    const archivedSenders = new Map<string, number>();

    for (const email of scanEmails) {
      const sender = email.from;

      // Quick replies (within 2 hours)
      if (email.wasRepliedTo && email.timeToReply !== null && email.timeToReply <= 2) {
        const existing = quickReplySenders.get(sender) || { count: 0, avgHours: 0 };
        existing.count++;
        existing.avgHours = (existing.avgHours * (existing.count - 1) + email.timeToReply) / existing.count;
        quickReplySenders.set(sender, existing);
      }

      // Starred emails (starCount > 0)
      if (email.starCount > 0) {
        starredSenders.set(sender, (starredSenders.get(sender) || 0) + 1);
      }

      // Archived emails (indicating low priority)
      if (email.isArchived && !email.wasRepliedTo) {
        archivedSenders.set(sender, (archivedSenders.get(sender) || 0) + 1);
      }
    }

    // Create rules for quick reply senders (high priority)
    for (const [sender, data] of quickReplySenders.entries()) {
      if (data.count >= 2) { // At least 2 quick replies
        await this.priorityService.createPriorityRule(userId, {
          conditionKey: 'from',
          conditionVal: sender,
          priorityBoost: 20,
          ruleType: RuleType.EXPLICIT_SENDER,
        });
        this.logger.log(`Created priority rule for quick-reply sender: ${sender}`);
      }
    }

    // Create rules for starred senders (high priority)
    for (const [sender, count] of starredSenders.entries()) {
      if (count >= 3) { // Starred at least 3 times
        await this.priorityService.createPriorityRule(userId, {
          conditionKey: 'from',
          conditionVal: sender,
          priorityBoost: 15,
          ruleType: RuleType.EXPLICIT_SENDER,
        });
        this.logger.log(`Created priority rule for starred sender: ${sender}`);
      }
    }

    // Create rules for archived senders (low priority)
    for (const [sender, count] of archivedSenders.entries()) {
      if (count >= 5) { // Archived at least 5 times without reply
        await this.priorityService.createPriorityRule(userId, {
          conditionKey: 'from',
          conditionVal: sender,
          priorityBoost: -15,
          ruleType: RuleType.EXPLICIT_SENDER,
        });
        this.logger.log(`Created priority rule for archived sender: ${sender}`);
      }
    }
  }

  /**
   * Create user context from scanned emails
   */
  private async createUserContext(userId: string, scanEmails: ScanEmail[]): Promise<void> {
    // Calculate average reply time (store as context for future use)
    const repliedEmails = scanEmails.filter(e => e.wasRepliedTo && e.timeToReply !== null && e.timeToReply > 0);
    if (repliedEmails.length > 0) {
      const avgReplyTime = repliedEmails.reduce((sum, e) => sum + (e.timeToReply || 0), 0) / repliedEmails.length;
      await this.contextService.createOrUpdateContext(
        userId,
        ContextKey.AVERAGE_REPLY_TIME,
        avgReplyTime.toFixed(2),
        Source.AUTOGENERATED,
      );
      this.logger.log(`User average reply time: ${avgReplyTime.toFixed(2)} hours`);
    }

    // Extract common senders (colleagues)
    const senderCounts = new Map<string, number>();
    for (const email of scanEmails) {
      if (email.fromName) {
        senderCounts.set(email.fromName, (senderCounts.get(email.fromName) || 0) + 1);
      }
    }

    // Top 20 most frequent senders
    const topSenders = Array.from(senderCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name]) => name);

    for (const sender of topSenders) {
      await this.contextService.createOrUpdateContext(
        userId,
        ContextKey.COLLEAGUE_NAME,
        sender,
        Source.AUTOGENERATED,
      );
    }

    this.logger.log(`Created user context for ${topSenders.length} colleagues`);
  }
}

