import { Controller, Get, Put, Post, UseGuards, Request, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('consent-status')
  async getConsentStatus(@Request() req) {
    return this.usersService.getConsentStatus(req.user.userId);
  }

  @Get('me')
  async getProfile(@Request() req) {
    const user = await this.usersService.findOne(req.user.userId);
    const { password, ...result } = user;
    return result;
  }

  @Put('me')
  async updateProfile(@Request() req, @Body() updates: any) {
    return this.usersService.update(req.user.userId, updates);
  }

  @Post('accept-consent')
  async acceptConsent(
    @Request() req,
    @Body() body: { termsAccepted: boolean; privacyAccepted: boolean },
  ) {
    return this.usersService.acceptConsent(req.user.userId, body.termsAccepted, body.privacyAccepted);
  }
}

