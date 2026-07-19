import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { EmailProviderRequiredGuard } from "../auth/email-provider-required.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ScheduledEmailsService } from "./scheduled-emails.service";

@Controller("scheduled-emails")
@UseGuards(JwtAuthGuard, EmailProviderRequiredGuard)
export class ScheduledEmailsController {
  constructor(
    private readonly scheduledEmailsService: ScheduledEmailsService,
  ) {}

  @Get()
  async getScheduledEmails(@Request() req) {
    return this.scheduledEmailsService.getScheduledEmails(req.user.userId);
  }

  @Get("suggestions")
  async getSuggestedTimes(@Request() req) {
    // Get user timezone from query params (e.g., ?timezone=America/New_York)
    const userTimezone = req.query.timezone as string | undefined;
    return this.scheduledEmailsService.getSuggestedTimes(userTimezone);
  }

  @Post("check-time")
  async checkSendTime(
    @Body() body: { scheduledSendAt: string; userTimezone?: string },
  ) {
    const scheduledSendAt = new Date(body.scheduledSendAt);
    return this.scheduledEmailsService.checkSendTimeAppropriate(
      scheduledSendAt,
      body.userTimezone,
    );
  }

  @Get(":id")
  async getScheduledEmail(@Request() req, @Param("id") id: string) {
    return this.scheduledEmailsService.getScheduledEmail(req.user.userId, id);
  }

  @Delete(":id")
  async cancelScheduledEmail(@Request() req, @Param("id") id: string) {
    await this.scheduledEmailsService.cancelScheduledEmail(req.user.userId, id);
    return { message: "Scheduled email cancelled" };
  }
}
