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
  async getInbox(@Request() req, @Query('includeBatched') includeBatched?: string) {
    return this.emailsService.getInbox(req.user.userId, includeBatched === 'true');
  }

  @Get(':id')
  async getEmail(@Request() req, @Param('id') id: string) {
    return this.emailsService.getEmailById(req.user.userId, parseInt(id));
  }

  @Post()
  async createEmail(@Request() req, @Body() emailData: Partial<Email>) {
    return this.emailsService.createEmail(req.user.userId, emailData);
  }

  @Put(':id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    return this.emailsService.markAsRead(req.user.userId, parseInt(id));
  }

  @Put(':id/archive')
  async archiveEmail(@Request() req, @Param('id') id: string) {
    await this.emailsService.archiveEmail(req.user.userId, parseInt(id));
    return { message: 'Email archived' };
  }

  @Post('force-check')
  async forceCheck(@Request() req) {
    // Add sync job to queue
    await this.boss.send('sync-gmail', { userId: req.user.userId });
    // Immediately return currently available emails (sync happens in background)
    return this.emailsService.forceCheckNewEmails(req.user.userId);
  }
}

