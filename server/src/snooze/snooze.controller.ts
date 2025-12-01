import { Controller, Post, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { SnoozeService } from './snooze.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('snooze')
@UseGuards(JwtAuthGuard)
export class SnoozeController {
  constructor(private readonly snoozeService: SnoozeService) {}

  @Post(':id')
  async snoozeEmail(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { duration: string },
  ) {
    return this.snoozeService.snoozeEmail(req.user.userId, id, body.duration);
  }

  @Delete(':id')
  async unsnoozeEmail(@Request() req, @Param('id') id: string) {
    return this.snoozeService.unsnoozeEmail(req.user.userId, id);
  }
}

