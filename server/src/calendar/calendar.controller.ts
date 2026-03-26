import {
  Body,
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { IsIn } from "class-validator";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DAYS } from "../constants/time-constants";

class RsvpRequestDto {
  @IsIn(["accepted", "declined", "tentative"])
  response!: "accepted" | "declined" | "tentative";
}
import { CalendarService } from "./calendar.service";

/**
 * Safely extracts an error code from an unknown error value.
 * Avoids no-explicit-any and no-nested-ternary lint rules.
 */
function getErrCode(err: unknown): string | number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  if ("code" in err) return (err as { code?: string | number }).code;
  if ("status" in err) return (err as { status?: number }).status;
  return undefined;
}

@Controller("calendar")
@UseGuards(JwtAuthGuard)
export class CalendarController {
  private readonly logger = new Logger(CalendarController.name);

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
   * Update the user's RSVP status on a Google Calendar event by its event ID.
   * POST /calendar/event/:calendarEventId/rsvp
   */
  @Post("event/:calendarEventId/rsvp")
  async rsvpToEvent(
    @Request() req,
    @Param("calendarEventId") calendarEventId: string,
    @Body() body: RsvpRequestDto,
  ) {
    try {
      return await this.calendarService.rsvpByEventId(
        req.user.userId,
        calendarEventId,
        body.response,
      );
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[RSVP] rsvpToEvent unexpected error: ${message}`);
      throw new InternalServerErrorException(
        "An unexpected error occurred while updating RSVP",
      );
    }
  }

  /**
   * Parse an ICS attachment and check if the event already exists in the
   * user's Google Calendar.
   * GET /calendar/ics-info/:emailId/:attachmentId
   *
   * Returns 400 for malformed ICS, 404 if attachment cannot be retrieved,
   * 500 for unexpected failures.
   */
  @Get("ics-info/:emailId/:attachmentId")
  async getIcsInfo(
    @Request() req,
    @Param("emailId") emailId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    try {
      return await this.calendarService.getIcsInfo(
        req.user.userId,
        emailId,
        attachmentId,
      );
    } catch (err) {
      // Re-throw NestJS HTTP exceptions as-is (they already have the right status code)
      if (err instanceof HttpException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[ICS] getIcsInfo unexpected error: ${message}`);
      throw new InternalServerErrorException(
        "An unexpected error occurred while loading the calendar invite",
      );
    }
  }

  /**
   * Add the event from an ICS attachment to the user's primary Google Calendar.
   * POST /calendar/add-ics-event/:emailId/:attachmentId
   *
   * Returns 400 for malformed ICS or missing calendar connection,
   * 404 if attachment cannot be retrieved, 500 for unexpected failures.
   */
  @Post("add-ics-event/:emailId/:attachmentId")
  async addIcsEvent(
    @Request() req,
    @Param("emailId") emailId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    try {
      const event = await this.calendarService.parseIcsAttachment(
        req.user.userId,
        emailId,
        attachmentId,
      );
      return await this.calendarService.addIcsEventToCalendar(
        req.user.userId,
        event,
      );
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.error("addIcsEvent failed", {
        message: err.message,
        stack: err.stack,
        userId: req.user?.userId,
        errorCode: getErrCode(err),
      });
      throw new InternalServerErrorException(
        "An unexpected error occurred while adding the calendar event",
      );
    }
  }
}
