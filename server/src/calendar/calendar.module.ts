import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { PublicCalendarController } from './public-calendar.controller';
import { CalendarService } from './calendar.service';
import { UsersModule } from '../users/users.module';
import { LLMModule } from '../llm/llm.module';
import { EmailsModule } from '../emails/emails.module';

@Module({
  imports: [UsersModule, LLMModule, EmailsModule],
  controllers: [CalendarController, PublicCalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}

