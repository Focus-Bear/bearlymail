import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { BlockedSendersService } from './blocked-senders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('blocked-senders')
@UseGuards(JwtAuthGuard)
export class BlockedSendersController {
  constructor(private readonly blockedSendersService: BlockedSendersService) {}

  /**
   * Get all blocked senders
   */
  @Get()
  async getBlockedSenders(@Request() req) {
    return this.blockedSendersService.getBlockedSenders(req.user.userId);
  }

  /**
   * Block a sender
   */
  @Post()
  async blockSender(
    @Request() req,
    @Body() body: {
      email: string;
      senderName?: string;
      reason?: string;
      blockDomain?: boolean;
    },
  ) {
    const blocked = await this.blockedSendersService.blockSender(
      req.user.userId,
      body.email,
      body.senderName,
      body.reason,
      body.blockDomain,
    );
    return {
      id: blocked.id,
      email: blocked.email,
      senderName: blocked.senderName,
      reason: blocked.reason,
      blockedAt: blocked.blockedAt,
    };
  }

  /**
   * Unblock a sender by ID
   */
  @Delete(':id')
  async unblockSender(@Request() req, @Param('id') id: string) {
    await this.blockedSendersService.unblockSender(req.user.userId, id);
    return { success: true };
  }

  /**
   * Check if a sender is blocked
   */
  @Post('check')
  async checkBlocked(@Request() req, @Body() body: { email: string }) {
    const isBlocked = await this.blockedSendersService.isSenderBlocked(
      req.user.userId,
      body.email,
    );
    return { isBlocked };
  }
}




