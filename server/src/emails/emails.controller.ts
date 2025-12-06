import { Controller, Get, Post, Put, Param, Body, UseGuards, Request, Query, Inject } from '@nestjs/common';
import { EmailsService } from './emails.service';
import { EmailProviderManager } from './email-provider-manager.service';
import { ContactsService } from '../contacts/contacts.service';
import { BlockedSendersService } from '../blocked-senders/blocked-senders.service';
import { BatchScheduleService } from '../batch-schedule/batch-schedule.service';
import PgBoss = require('pg-boss');
import { Email } from '../database/entities/email.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailRecipient } from './interfaces/email-provider.interface';

@Controller('emails')
@UseGuards(JwtAuthGuard)
export class EmailsController {
  constructor(
    private readonly emailsService: EmailsService,
    private readonly emailProviderManager: EmailProviderManager,
    private readonly contactsService: ContactsService,
    private readonly blockedSendersService: BlockedSendersService,
    private readonly batchScheduleService: BatchScheduleService,
    @Inject('PG_BOSS') private readonly boss: PgBoss,
  ) {}

  @Get('inbox')
  async getInbox(
    @Request() req, 
    @Query('includeBatched') includeBatched?: string,
    @Query('mode') mode: 'triage' | 'process' = 'triage'
  ) {
    return this.emailsService.getInbox(req.user.userId, includeBatched === 'true', mode);
  }

  @Get('batch-status')
  async getBatchStatus(@Request() req) {
    // Get next delivery time from the batch schedule, not from batched emails
    const schedule = await this.batchScheduleService.getSchedule(req.user.userId);
    if (!schedule) {
      // Use default schedule for new users
      const defaults = this.batchScheduleService.getDefaultSchedule();
      const tempSchedule = {
        ...defaults,
        userId: req.user.userId,
        id: 'temp',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;
      const nextTime = this.batchScheduleService.getNextBatchReleaseTime(tempSchedule, false);
      return { nextDelivery: nextTime };
    }
    const nextTime = this.batchScheduleService.getNextBatchReleaseTime(schedule, false);
    return { nextDelivery: nextTime };
  }

  @Get('search')
  async searchEmails(@Request() req, @Query('q') query: string, @Query('maxResults') maxResults?: string) {
    if (!query) {
      return [];
    }
    const max = maxResults ? parseInt(maxResults, 10) : 50;
    return this.emailsService.searchEmails(req.user.userId, query, max);
  }

  @Get(':id/priority-explanation')
  async getPriorityExplanation(@Request() req, @Param('id') id: string) {
    return this.emailsService.getPriorityExplanation(req.user.userId, id);
  }

  @Get(':id/thread')
  async getThread(@Request() req, @Param('id') id: string) {
    // Get the email to find its threadId
    const email = await this.emailsService.getEmailById(req.user.userId, id);
    if (!email) {
      throw new Error('Email not found');
    }
    // Return all emails in the thread
    return this.emailsService.getThreadEmails(req.user.userId, email.threadId);
  }

  @Get(':id')
  async getEmail(@Request() req, @Param('id') id: string) {
    return this.emailsService.getEmailById(req.user.userId, id);
  }

  @Post()
  async createEmail(@Request() req, @Body() emailData: Partial<Email>) {
    return this.emailsService.createEmail(req.user.userId, emailData);
  }

  @Put(':id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    return this.emailsService.markAsRead(req.user.userId, id);
  }

  @Put(':id/archive')
  async archiveEmail(@Request() req, @Param('id') id: string) {
    await this.emailsService.archiveEmail(req.user.userId, id);
    return { message: 'Email archived' };
  }

  @Put(':id/star')
  async toggleStar(@Request() req, @Param('id') id: string) {
    return this.emailsService.toggleStar(req.user.userId, id);
  }

  @Put(':id/star-count')
  async setStarCount(@Request() req, @Param('id') id: string, @Body() body: { starCount: number }) {
    return this.emailsService.setStarCount(req.user.userId, id, body.starCount);
  }

  @Post(':id/block-sender')
  async blockSender(
    @Request() req, 
    @Param('id') id: string,
    @Body() body?: { reason?: string; blockDomain?: boolean },
  ) {
    const email = await this.emailsService.getEmailById(req.user.userId, id);
    if (!email) {
      throw new Error('Email not found');
    }

    // Block the sender
    await this.blockedSendersService.blockSender(
      req.user.userId,
      email.from,
      email.fromName,
      body?.reason,
      body?.blockDomain,
    );

    // Archive the thread
    await this.emailsService.archiveEmail(req.user.userId, id);

    return { 
      success: true, 
      message: `Blocked sender ${email.from}`,
      blockedEmail: email.from,
    };
  }

  @Post('force-check')
  async forceCheck(@Request() req) {
    // Add sync job to queue with singletonKey to prevent duplicates
    // Only one sync job per user can be queued at a time
    await this.boss.send('sync-emails', { userId: req.user.userId }, {
      singletonKey: `sync-emails-${req.user.userId}`,
      singletonMinutes: 5, // Don't allow another sync for same user within 5 minutes
    });
    // Immediately unbatch everything and return
    return this.emailsService.forceCheckNewEmails(req.user.userId);
  }

  @Post('check-urgent')
  async checkUrgent(@Request() req) {
    // DON'T queue a sync job here - this is called on every page load!
    // Just check for urgent emails in the existing data
    // Syncing is handled by the cron job and force-check button
    return this.emailsService.checkForUrgentEmails(req.user.userId);
  }

  @Get('debug/starred-threads')
  async debugStarredThreads(@Request() req) {
    return this.emailsService.debugStarredThreads(req.user.userId);
  }

  @Get('debug/orphan-emails')
  async debugOrphanEmails(@Request() req) {
    return this.emailsService.debugOrphanEmails(req.user.userId);
  }

  @Post('debug/fix-orphan-emails')
  async fixOrphanEmails(@Request() req) {
    return this.emailsService.fixOrphanEmails(req.user.userId);
  }

  @Post('debug/reset-stuck-jobs')
  async resetStuckJobs(@Request() req) {
    // Reset jobs that are stuck in retry state with future startafter times
    const now = new Date();
    
    // Get all jobs that are scheduled for the future (stuck in backoff)
    const stuckJobs = await (this.boss as any).getQueueSize('refine-priority');
    const stuckSummary = await (this.boss as any).getQueueSize('generate-summary');
    const stuckSync = await (this.boss as any).getQueueSize('sync-emails');
    
    // Use raw SQL to reset startafter for stuck jobs
    const result = await (this.boss as any).db.executeSql(`
      UPDATE pgboss.job 
      SET startafter = NOW(), retrycount = 0 
      WHERE state = 'retry' 
      AND startafter > NOW()
      AND name IN ('refine-priority', 'generate-summary', 'sync-emails', 'learn-from-star')
    `);
    
    return {
      message: 'Reset stuck jobs',
      queueSizes: {
        'refine-priority': stuckJobs,
        'generate-summary': stuckSummary,
        'sync-emails': stuckSync,
      },
      resetCount: result?.rowCount || 0,
    };
  }

  @Post('debug/fix-stuck-calculating')
  async fixStuckCalculating(@Request() req) {
    return this.emailsService.fixStuckCalculatingThreads(req.user.userId);
  }

  @Post('send')
  async sendEmail(
    @Request() req,
    @Body() body: {
      to: EmailRecipient[];
      subject: string;
      body: string;
      cc?: EmailRecipient[];
      bcc?: EmailRecipient[];
    },
  ) {
    const userId = req.user.userId;
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    
    if (!provider) {
      throw new Error('No email provider connected. Please connect your email account.');
    }

    // Send the email
    const result = await provider.sendEmail(
      userId,
      body.to,
      body.subject,
      body.body,
      body.cc,
      body.bcc,
    );

    // Track contact frequency for each recipient
    const allRecipients = [...body.to, ...(body.cc || []), ...(body.bcc || [])];
    for (const recipient of allRecipients) {
      await this.contactsService.incrementContactFrequency(userId, recipient.email);
    }

    return {
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    };
  }

  @Post(':id/accelerate')
  async accelerateEmail(@Request() req, @Param('id') id: string) {
    // Accelerate processing for a specific email (user is viewing it)
    // This bumps the priority of any pending jobs for this email
    const userId = req.user.userId;
    
    // Re-queue with high priority if jobs are stuck
    const email = await this.emailsService.getEmailById(userId, id);
    if (!email) {
      return { message: 'Email not found' };
    }
    
    const queued: string[] = [];
    
    // If summary is processing or missing, queue with priority
    if (email.isProcessingSummary || !email.summary) {
      await this.boss.send('generate-summary', { userId, emailId: id }, {
        priority: 10, // Higher priority (default is 0)
        singletonKey: `summary-${id}`,
      });
      queued.push('generate-summary');
    }
    
    // If priority is default, queue refinement with priority
    if (email.priorityScore === 50 || email.isProcessingPriority) {
      await this.boss.send('refine-priority', { userId, emailId: id }, {
        priority: 10,
        singletonKey: `priority-${id}`,
      });
      queued.push('refine-priority');
    }
    
    return { message: 'Accelerated processing', queued };
  }

}

