import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { MAX_ADDITIONAL_GUESTS } from "../constants/booking-constants";
import { DAYS, MINUTES } from "../constants/time-constants";
import { CalendarService } from "./calendar.service";

interface PublicCalendarRequest extends Request {
  user?: { userId: string; email?: string };
}

const DEFAULT_SLOTS_LIMIT = 8;
const MAX_SLOTS_LIMIT = 50;
const MAX_AGENDA_LENGTH = 500;

@Controller("public/calendar")
export class PublicCalendarController {
  private readonly logger = new Logger(PublicCalendarController.name);

  constructor(private readonly calendarService: CalendarService) {}

  /** Static `booking/*` routes must be registered before `:userId/*` (Nest route order). */
  @Get("booking/:bookingToken")
  async getBooking(@Param("bookingToken") bookingToken: string) {
    return this.calendarService.getBookingByToken(bookingToken);
  }

  @Post("booking/:bookingToken/reschedule")
  async rescheduleBooking(
    @Param("bookingToken") bookingToken: string,
    @Body() body: { newStartTime: string },
  ) {
    if (!body.newStartTime) {
      throw new BadRequestException("New start time is required");
    }

    return this.calendarService.rescheduleBooking(
      bookingToken,
      body.newStartTime,
    );
  }

  @Post("booking/:bookingToken/cancel")
  async cancelBooking(@Param("bookingToken") bookingToken: string) {
    return this.calendarService.cancelBooking(bookingToken);
  }

  @Get(":userId/slots")
  @UseGuards(OptionalJwtAuthGuard)
  async getPublicSlots(
    @Param("userId") userId: string,
    @Req() req: PublicCalendarRequest,
  ) {
    const { daysAhead, offset, limit, afterDate } = req.query as Record<
      string,
      string | undefined
    >;
    // Search a 14-day window from afterDate (or now). A 14-day window is enough
    // to find 8 slots for most users without over-fetching calendar data.
    const days = daysAhead ? parseInt(daysAhead, 10) : DAYS.WEEK * 2;
    const slotOffset = offset ? parseInt(offset, 10) : 0;
    const slotLimit = limit
      ? Math.min(parseInt(limit, 10), MAX_SLOTS_LIMIT)
      : DEFAULT_SLOTS_LIMIT;
    const afterDateParsed = afterDate ? new Date(afterDate) : undefined;
    try {
      return await this.calendarService.getAvailableSlotsWithTimezone(
        userId,
        days,
        slotOffset,
        slotLimit,
        afterDateParsed,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.warn(
        `Public calendar slots unavailable for user ${userId}: ${message}`,
      );
      const isPageOwner = req.user
        ? await this.calendarService.isSameBookingHost(req.user.userId, userId)
        : false;
      if (isPageOwner) {
        if (message.includes("User not found")) {
          this.logger.warn(
            `Public calendar slots: user_not_found for userId=${userId}`,
          );
          throw new NotFoundException("User not found");
        }
        throw new ServiceUnavailableException(message);
      }
      if (message.includes("User not found")) {
        this.logger.warn(
          `Public calendar slots: user_not_found for userId=${userId}`,
        );
        throw new NotFoundException("User not found");
      }
      if (
        message.includes("not connected") ||
        message.includes("Google Calendar not connected")
      ) {
        this.logger.warn(
          `Public calendar slots: not_connected for userId=${userId}`,
        );
        throw new ServiceUnavailableException(
          "Calendar is temporarily unavailable",
        );
      }
      if (
        message.includes("expired") ||
        message.includes("not authorized") ||
        message.includes("reconnect")
      ) {
        this.logger.warn(
          `Public calendar slots: auth_expired for userId=${userId}`,
        );
        throw new ServiceUnavailableException(
          "Calendar is temporarily unavailable",
        );
      }
      throw new ServiceUnavailableException(
        "Calendar is temporarily unavailable",
      );
    }
  }

  @Post(":userId/book")
  async bookSlot(
    @Param("userId") userId: string,
    @Body()
    body: {
      startTime: string;
      guestEmail: string;
      guestName: string;
      duration?: number;
      additionalGuests?: string[];
      agenda?: string;
    },
  ) {
    if (!body.startTime || !body.guestEmail) {
      throw new BadRequestException("Start time and guest email are required");
    }

    const additionalGuests = body.additionalGuests ?? [];

    if (additionalGuests.length > MAX_ADDITIONAL_GUESTS) {
      throw new BadRequestException(
        `Too many additional guests. Maximum is ${MAX_ADDITIONAL_GUESTS}.`,
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of additionalGuests) {
      if (!emailRegex.test(email)) {
        throw new BadRequestException(`Invalid email address: ${email}`);
      }
    }

    if (body.agenda !== undefined && body.agenda.length > MAX_AGENDA_LENGTH) {
      throw new BadRequestException(
        `Agenda must be ${MAX_AGENDA_LENGTH} characters or fewer.`,
      );
    }

    // Strip HTML tags before storing the agenda. [^<>] (not [^>]) keeps the
    // match linear (CWE-1333) and avoids a nested-tag single-pass bypass
    // (CWE-116); the agenda is used as plain text, never rendered as HTML.
    const sanitisedAgenda = body.agenda
      ? body.agenda.replace(/<[^<>]*>/g, "").trim()
      : undefined;

    let hostUserId: string;
    try {
      hostUserId =
        await this.calendarService.resolvePublicBookingHostUserId(userId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("User not found")) {
        throw new NotFoundException("User not found");
      }
      throw err;
    }

    return this.calendarService.bookSlotWithAgenda({
      userId: hostUserId,
      startTime: body.startTime,
      durationMinutes: body.duration || MINUTES.THIRTY,
      guestEmail: body.guestEmail,
      guestName: body.guestName,
      additionalGuests,
      agenda: sanitisedAgenda,
    });
  }
}
