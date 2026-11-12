import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AwsModule } from "../aws/aws.module";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailsModule } from "../emails/emails.module";
import { QueueModule } from "../queue/queue.module";
import { UsersModule } from "../users/users.module";
import { SnoozeController } from "./snooze.controller";
import { SnoozeProcessor } from "./snooze.processor";
import { SnoozeService } from "./snooze.service";
import { SnoozeReleaseService } from "./snooze-release.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Email, EmailThread]),
    forwardRef(() => EmailsModule),
    QueueModule,
    AwsModule,
    UsersModule,
  ],
  controllers: [SnoozeController],
  providers: [SnoozeService, SnoozeProcessor, SnoozeReleaseService],
  exports: [SnoozeService],
})
export class SnoozeModule {}
