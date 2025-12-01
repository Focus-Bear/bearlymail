import { Controller, Get, Post, Put, Param, Body, UseGuards, Request, Query, Inject } from '@nestjs/common';
import { EmailsService } from './emails.service';
import PgBoss = require('pg-boss');
import { Email } from '../database/entities/email.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('emails')
@UseGuards(JwtAuthGuard)
export class EmailsController {
  constructor(
    private readonly emailsService: EmailsService,
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
    const nextTime = await this.emailsService.getNextBatchReleaseTime(req.user.userId);
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

  @Post('force-check')
  async forceCheck(@Request() req) {
    // Add sync job to queue (use generic sync-emails job)
    await this.boss.send('sync-emails', { userId: req.user.userId });
    // Immediately unbatch everything and return
    return this.emailsService.forceCheckNewEmails(req.user.userId);
  }

  @Post('check-urgent')
  async checkUrgent(@Request() req) {
    // Queue sync job first (use generic sync-emails job)
    await this.boss.send('sync-emails', { userId: req.user.userId });
    
    // Wait for sync and priority processing to complete
    // Give time for emails to sync, basic priority calculation, and LLM analysis
    // We wait a bit longer to allow LLM priority refinement to mark emails as urgent
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds for sync and priority processing
    
    // Check for urgent emails among batched ones (this includes newly synced urgent emails)
    return this.emailsService.checkForUrgentEmails(req.user.userId);
  }

}

