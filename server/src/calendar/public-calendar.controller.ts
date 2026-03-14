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

import { DAYS, MINUTES } from "../constants/time-constants";
import { CalendarService } from "./calendar.service";

const DEFAULT_SLOTS_LIMIT = 50;
const MAX_SLOTS_LIMIT = 100;

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
  ) {
    const days = daysAhead ? parseInt(daysAhead, 10) : DAYS.MONTH;
    const slotOffset = offset ? parseInt(offset, 10) : 0;
    const slotLimit = limit
      ? Math.min(parseInt(limit, 10), MAX_SLOTS_LIMIT)
      : DEFAULT_SLOTS_LIMIT;
    try {
      return await this.calendarService.getAvailableSlotsWithTimezone(
        userId,
        days,
        slotOffset,
        slotLimit,
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
    },
  ) {
    if (!body.startTime || !body.guestEmail) {
      throw new BadRequestException("Start time and guest email are required");
    }

    return this.calendarService.createEvent(
      userId,
      body.startTime,
      body.duration || MINUTES.THIRTY,
      body.guestEmail,
      body.guestName,
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
