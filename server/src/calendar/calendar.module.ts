import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CalendarController } from "./calendar.controller";
import { PublicCalendarController } from "./public-calendar.controller";
import { CalendarService } from "./calendar.service";
import { UsersModule } from "../users/users.module";
import { LLMModule } from "../llm/llm.module";
import { EmailsModule } from "../emails/emails.module";
import { SchedulingPreferencesModule } from "../scheduling-preferences/scheduling-preferences.module";
import { CalendarBooking } from "../database/entities/calendar-booking.entity";

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
