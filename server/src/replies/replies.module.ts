import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RepliesController } from "./replies.controller";
import { RepliesService } from "./replies.service";
import { EmailsModule } from "../emails/emails.module";
import { ContextModule } from "../context/context.module";
import { LLMModule } from "../llm/llm.module";
import { UsersModule } from "../users/users.module";
import { SnoozeModule } from "../snooze/snooze.module";
import { FollowUpsModule } from "../follow-ups/follow-ups.module";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ScheduledEmailsModule } from "../scheduled-emails/scheduled-emails.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Email, EmailThread]),
    EmailsModule,
    forwardRef(() => ContextModule),
    LLMModule,
    UsersModule,
    SnoozeModule,
    forwardRef(() => FollowUpsModule),
    forwardRef(() => ScheduledEmailsModule),
  ],
  controllers: [RepliesController],
  providers: [RepliesService],
  exports: [RepliesService],
})
export class RepliesModule {}
