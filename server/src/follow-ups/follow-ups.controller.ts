import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FollowUpsService } from './follow-ups.service';

@Controller('follow-ups')
@UseGuards(JwtAuthGuard)
export class FollowUpsController {
  constructor(private followUpsService: FollowUpsService) {}

  /**
   * Get all follow-ups that need action (due for follow-up)
   */
  @Get('due')
  async getDueFollowUps(@Request() req) {
    return this.followUpsService.getDueFollowUps(req.user.id);
  }

  /**
   * Get all follow-ups that are awaiting reply (not yet due)
   */
  @Get('awaiting')
  async getAwaitingFollowUps(@Request() req) {
    return this.followUpsService.getAwaitingReplyFollowUps(req.user.id);
  }

  /**
   * Generate follow-up drafts for all due follow-ups
   */
  @Post('generate-drafts')
  async generateDrafts(@Request() req) {
    return this.followUpsService.generateFollowUpDrafts(req.user.id);
  }

  /**
   * Create a new follow-up reminder
   */
  @Post()
  async createFollowUp(
    @Request() req,
    @Body() body: { threadId: string; followUpDays: number; sentEmailId?: string },
  ) {
    return this.followUpsService.createFollowUp(
      req.user.id,
      body.threadId,
      body.followUpDays,
      body.sentEmailId,
    );
  }

  /**
   * Update a follow-up draft
   */
  @Put(':id/draft')
  async updateDraft(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { draft: string },
  ) {
    return this.followUpsService.updateDraft(id, req.user.id, body.draft);
  }

  /**
   * Mark a follow-up as completed (sent)
   */
  @Post(':id/complete')
  async completeFollowUp(@Request() req, @Param('id') id: string) {
    await this.followUpsService.completeFollowUp(id, req.user.id);
    return { success: true };
  }

  /**
   * Cancel a follow-up
   */
  @Delete(':id')
  async cancelFollowUp(@Request() req, @Param('id') id: string) {
    await this.followUpsService.cancelFollowUp(id, req.user.id);
    return { success: true };
  }

  /**
   * Get a single follow-up
   */
  @Get(':id')
  async getFollowUp(@Request() req, @Param('id') id: string) {
    return this.followUpsService.getFollowUp(id, req.user.id);
  }
}




