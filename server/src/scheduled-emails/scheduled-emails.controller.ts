import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ScheduledEmailsService } from "./scheduled-emails.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GmailRequiredGuard } from "../auth/gmail-required.guard";

@Controller("scheduled-emails")
@UseGuards(JwtAuthGuard, GmailRequiredGuard)
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
