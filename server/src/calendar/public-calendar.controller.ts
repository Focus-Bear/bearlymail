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
}
