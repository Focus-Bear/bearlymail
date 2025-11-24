import { Controller, Get, Post, Param, Body, BadRequestException } from '@nestjs/common';
import { CalendarService } from './calendar.service';

@Controller('public/calendar')
export class PublicCalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get(':userId/slots')
  async getPublicSlots(@Param('userId') userId: string) {
    return this.calendarService.getAvailableTimeSlots(parseInt(userId));
  }

  @Post(':userId/book')
  async bookSlot(
    @Param('userId') userId: string,
    @Body() body: { startTime: string; guestEmail: string; guestName: string; duration?: number },
  ) {
    if (!body.startTime || !body.guestEmail) {
      throw new BadRequestException('Start time and guest email are required');
    }

    return this.calendarService.createEvent(
      parseInt(userId),
      body.startTime,
      body.duration || 30,
      body.guestEmail,
      body.guestName,
    );
  }
}

