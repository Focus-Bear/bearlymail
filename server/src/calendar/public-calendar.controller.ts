import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";

import { MAX_ADDITIONAL_GUESTS } from "../constants/booking-constants";
import { DAYS, MINUTES } from "../constants/time-constants";
import { CalendarService } from "./calendar.service";

const DEFAULT_SLOTS_LIMIT = 8;
const MAX_SLOTS_LIMIT = 50;

@Controller("public/calendar")
export class PublicCalendarController {
  private readonly logger = new Logger(PublicCalendarController.name);

  constructor(private readonly calendarService: CalendarService) {}

  @Get(":userId/slots")
  async getPublicSlots(
    @Param("userId") userId: string,
    @Query("daysAhead") daysAhead?: string,
    @Query("offset") offset?: string,
    @Query("limit") limit?: string,
    @Query("afterDate") afterDate?: string,
  ) {
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

    return this.calendarService.createEvent(
      userId,
      body.startTime,
      body.duration || MINUTES.THIRTY,
      body.guestEmail,
      body.guestName,
      undefined,
      undefined,
      additionalGuests,
    );
  }

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
}
