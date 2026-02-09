import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SnoozeController } from "./snooze.controller";
import { SnoozeService } from "./snooze.service";
import { SnoozeProcessor } from "./snooze.processor";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailsModule } from "../emails/emails.module";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Email, EmailThread]),
    forwardRef(() => EmailsModule),
    QueueModule,
  ],
  controllers: [SnoozeController],
  providers: [SnoozeService, SnoozeProcessor],
  exports: [SnoozeService],
})
export class SnoozeModule {}
