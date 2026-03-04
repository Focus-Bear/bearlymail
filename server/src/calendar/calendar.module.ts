import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CalendarBooking } from "../database/entities/calendar-booking.entity";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { SchedulingPreferencesModule } from "../scheduling-preferences/scheduling-preferences.module";
import { UsersModule } from "../users/users.module";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
import { PublicCalendarController } from "./public-calendar.controller";

@Module({
  imports: [
    TypeOrmModule.forFeature([CalendarBooking]),
    UsersModule,
    LLMModule,
    EmailsModule,
    SchedulingPreferencesModule,
  ],
  controllers: [CalendarController, PublicCalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
