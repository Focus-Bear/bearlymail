import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DAYS } from "../constants/time-constants";
import { CalendarService } from "./calendar.service";

@Controller("calendar")
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get("slots")
  async getAvailableSlots(@Request() req) {
    return this.calendarService.getAvailableTimeSlots(
      req.user.userId,
      DAYS.MONTH,
    );
  }

  @Post("meeting-reply/:id")
  async generateMeetingReply(
    @Request() req,
    @Param("id") id: string,
    @Body() body?: { provider?: "gemini" | "openai" },
  ) {
    return {
      draft: await this.calendarService.generateMeetingReply(
        req.user.userId,
        id,
        body?.provider,
      ),
    };
  }

  @Post("invitation/:emailId/respond")
  async respondToInvitation(
    @Request() req,
    @Param("emailId") emailId: string,
    @Body() body: { response: "accepted" | "declined" | "tentative" },
  ) {
    await this.calendarService.respondToInvitation(
      req.user.userId,
      emailId,
      body.response,
    );
    return { success: true };
  }
}
