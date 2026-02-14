import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
} from "@nestjs/common";
import { CalendarService } from "./calendar.service";
import { MINUTES } from "../constants/time-constants";

@Controller("public/calendar")
export class PublicCalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get(":userId/slots")
  async getPublicSlots(@Param("userId") userId: string) {
    return this.calendarService.getAvailableSlotsWithTimezone(userId);
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
