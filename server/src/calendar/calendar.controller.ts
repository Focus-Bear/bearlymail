import {
  BadRequestException,
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
import { CalendarMeetingConflictService } from "./calendar-meeting-conflict.service";

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

/** Split a comma-separated recipient list, tolerating quoted display names. */
function splitRecipients(recipients: string | string[] | undefined): string[] {
  if (Array.isArray(recipients)) {
    return recipients.map((address) => address.trim()).filter(Boolean);
  }
  if (typeof recipients !== "string") {
    return [];
  }
  return recipients
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

@Controller("calendar")
@UseGuards(JwtAuthGuard)
export class CalendarController {
  private readonly logger = new Logger(CalendarController.name);

  constructor(
    private readonly calendarService: CalendarService,
    private readonly calendarMeetingConflictService: CalendarMeetingConflictService,
  ) {}

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

  /**
   * Analyse an email to detect whether the sender proposes a specific meeting
   * time, and check whether that time is free on the user's calendar.
   * POST /calendar/check-proposed-time/:emailId
   */
  @Post("check-proposed-time/:emailId")
  async checkProposedTime(@Request() req, @Param("emailId") emailId: string) {
    try {
      return await this.calendarService.checkMeetingProposal(
        req.user.userId,
        emailId,
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[check-proposed-time] error: ${message}`);
      throw new InternalServerErrorException(
        "An unexpected error occurred while checking the proposed meeting time",
      );
    }
  }

  /**
   * Re-check whether an exact time/duration is free on the user's calendar.
   * Called as the user edits the proposed time in the scheduling panel so the
   * conflict warning reflects the slot they actually picked, not the original.
   * POST /calendar/check-availability
   */
  @Post("check-availability")
  async checkAvailability(
    @Request() req,
    @Body() body: { proposedTime: string; durationMinutes?: number },
  ) {
    if (!body.proposedTime) {
      throw new BadRequestException("proposedTime is required");
    }
    try {
      return await this.calendarService.checkTimeAvailability(
        req.user.userId,
        body.proposedTime,
        body.durationMinutes ?? null,
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[check-availability] error: ${message}`);
      throw new InternalServerErrorException(
        "An unexpected error occurred while checking calendar availability",
      );
    }
  }

  /**
   * Create a calendar event directly from an email proposal.
   * Uses the email sender as the guest and the proposed time.
   * POST /calendar/create-from-email-proposal
   */
  @Post("create-from-email-proposal")
  async createFromEmailProposal(
    @Request() req,
    @Body()
    body: {
      emailId: string;
      proposedTime: string;
      topic: string;
      durationMinutes?: number;
    },
  ) {
    const DEFAULT_DURATION = 30;
    if (!body.emailId || !body.proposedTime || !body.topic) {
      throw new BadRequestException(
        "emailId, proposedTime and topic are required",
      );
    }
    try {
      return await this.calendarService.createEventFromEmailProposal(
        req.user.userId,
        body.emailId,
        body.proposedTime,
        body.topic,
        body.durationMinutes ?? DEFAULT_DURATION,
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[create-from-email-proposal] error: ${message}`);
      throw new InternalServerErrorException(
        "An unexpected error occurred while creating the calendar event",
      );
    }
  }

  /**
   * Pre-send advisory: does the outbound draft mention a day for a meeting/call
   * with the recipient that does not line up with the user's calendar? Runs
   * alongside the tone check. Never blocks — returns `{ calendarWarning: null }`
   * when calendar isn't connected, no meeting date is mentioned, or on any error.
   * POST /calendar/check-meeting-references
   */
  @Post("check-meeting-references")
  async checkMeetingReferences(
    @Request() req,
    @Body()
    body: {
      text: string;
      recipients?: string | string[];
      currentDate?: string;
      timezone?: string;
    },
  ): Promise<{ calendarWarning: string | null }> {
    const recipients = splitRecipients(body.recipients);
    if (!body.text?.trim() || recipients.length === 0) {
      return { calendarWarning: null };
    }
    return this.calendarMeetingConflictService.checkOutboundMeetingReferences({
      userId: req.user.userId,
      text: body.text,
      recipients,
      currentDate: body.currentDate || new Date().toISOString(),
      timezone: body.timezone || "UTC",
    });
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

  /**
   * Accept a reschedule request (METHOD:COUNTER ics): move the matched
   * calendar event to the attendee's proposed new time and notify attendees.
   * POST /calendar/ics-info/:emailId/:attachmentId/accept-reschedule
   *
   * Returns 400 if the ics isn't a COUNTER or calendar isn't connected,
   * 404 if no matching calendar event was found, 500 for unexpected failures.
   */
  @Post("ics-info/:emailId/:attachmentId/accept-reschedule")
  async acceptReschedule(
    @Request() req,
    @Param("emailId") emailId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    try {
      return await this.calendarService.acceptCounterProposal(
        req.user.userId,
        emailId,
        attachmentId,
      );
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[ICS] acceptReschedule unexpected error: ${message}`);
      throw new InternalServerErrorException(
        "An unexpected error occurred while accepting the new time",
      );
    }
  }

  /**
   * Decline a reschedule request (METHOD:COUNTER ics): keep the calendar
   * event at its current time and reply telling the proposer.
   * POST /calendar/ics-info/:emailId/:attachmentId/decline-reschedule
   *
   * Returns 400 if the ics isn't a COUNTER, 404 if no matching calendar event
   * was found, 500 for unexpected failures.
   */
  @Post("ics-info/:emailId/:attachmentId/decline-reschedule")
  async declineReschedule(
    @Request() req,
    @Param("emailId") emailId: string,
    @Param("attachmentId") attachmentId: string,
  ) {
    try {
      return await this.calendarService.declineCounterProposal(
        req.user.userId,
        emailId,
        attachmentId,
      );
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[ICS] declineReschedule unexpected error: ${message}`);
      throw new InternalServerErrorException(
        "An unexpected error occurred while declining the new time",
      );
    }
  }
}
