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
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";

import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { PUBLIC_BOOKING_THROTTLE } from "../constants/booking-constants";
import { DAYS } from "../constants/time-constants";
import { CalendarService } from "./calendar.service";
import { parsePublicBookingRequest } from "./public-booking-request";

interface PublicCalendarRequest extends Request {
  user?: { userId: string; email?: string };
}

/**
 * What an anonymous visitor gets back after booking or moving a meeting: the
 * times and the meeting link, not the host's full calendar event.
 */
function toPublicBookingResult(event: {
  start?: { dateTime?: string | null } | null;
  end?: { dateTime?: string | null } | null;
  meetLink?: string | null;
}): { start: string | null; end: string | null; meetLink: string | null } {
  return {
    start: event.start?.dateTime ?? null,
    end: event.end?.dateTime ?? null,
    meetLink: event.meetLink ?? null,
  };
}

const DEFAULT_SLOTS_LIMIT = 8;
const MAX_SLOTS_LIMIT = 50;

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
  @Throttle(PUBLIC_BOOKING_THROTTLE)
  async rescheduleBooking(
    @Param("bookingToken") bookingToken: string,
    @Body() body: { newStartTime: string },
  ) {
    if (!body?.newStartTime || typeof body.newStartTime !== "string") {
      throw new BadRequestException("New start time is required");
    }

    const event = await this.calendarService.rescheduleBooking(
      bookingToken,
      body.newStartTime,
    );
    return toPublicBookingResult(event);
  }

  @Post("booking/:bookingToken/cancel")
  @Throttle(PUBLIC_BOOKING_THROTTLE)
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
  @Throttle(PUBLIC_BOOKING_THROTTLE)
  async bookSlot(@Param("userId") userId: string, @Body() body: unknown) {
    const { startTime, guestEmail, guestName, additionalGuests, agenda } =
      parsePublicBookingRequest(body);

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

    // The requested time must be one the host is free for, and the length is
    // the host's slot length — neither is taken from the request as-is.
    const { start, durationMinutes } =
      await this.calendarService.resolveBookableSlot(hostUserId, startTime);

    const event = await this.calendarService.bookSlotWithAgenda({
      userId: hostUserId,
      startTime: start.toISOString(),
      durationMinutes,
      guestEmail,
      guestName,
      additionalGuests,
      agenda,
    });
    return toPublicBookingResult(event);
  }
}
