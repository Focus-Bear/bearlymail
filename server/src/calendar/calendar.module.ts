import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { CalendarBooking } from "../database/entities/calendar-booking.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailsModule } from "../emails/emails.module";
import { GoogleAccountsModule } from "../google-accounts/google-accounts.module";
import { LLMModule } from "../llm/llm.module";
import { SchedulingPreferencesModule } from "../scheduling-preferences/scheduling-preferences.module";
import { UsersModule } from "../users/users.module";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";
import { CalendarAgendaService } from "./calendar-agenda.service";
import { CalendarIcsService } from "./calendar-ics.service";
import { PublicCalendarController } from "./public-calendar.controller";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([CalendarBooking, EmailThread]),
    UsersModule,
    GoogleAccountsModule,
    LLMModule,
    EmailsModule,
    SchedulingPreferencesModule,
  ],
  controllers: [CalendarController, PublicCalendarController],
  providers: [CalendarService, CalendarAgendaService, CalendarIcsService],
  exports: [CalendarService, CalendarAgendaService, CalendarIcsService],
})
export class CalendarModule {}
