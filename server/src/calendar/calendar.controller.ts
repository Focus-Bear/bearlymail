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

  /**
   * Parse an ICS attachment and check if the event already exists in the
   * user's Google Calendar.
   * GET /calendar/ics-info/:emailId/:attachmentId
   */
  @Get("ics-info/:emailId/:attachmentId")
  async getIcsInfo(
    @Request() req,
    @Param("emailId") emailId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    return this.calendarService.getIcsInfo(
      req.user.userId,
      emailId,
      attachmentId,
    );
  }

  /**
   * Add the event from an ICS attachment to the user's primary Google Calendar.
   * POST /calendar/add-ics-event/:emailId/:attachmentId
   */
  @Post("add-ics-event/:emailId/:attachmentId")
  async addIcsEvent(
    @Request() req,
    @Param("emailId") emailId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    const event = await this.calendarService.parseIcsAttachment(
      req.user.userId,
      emailId,
      attachmentId,
    );
    return this.calendarService.addIcsEventToCalendar(req.user.userId, event);
  }
}
