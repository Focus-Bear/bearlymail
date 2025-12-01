import { Controller, Get, Post, Put, Param, Body, UseGuards, Request } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  async submit(@Body() body: { email: string; firstName: string; reason: string }) {
    return this.waitlistService.create(body.email, body.firstName, body.reason);
  }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAll(@Request() req) {
    return this.waitlistService.findAll();
  }

  @Put(':id/approve')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async approve(@Param('id') id: string) {
    return this.waitlistService.approve(id);
  }
}

