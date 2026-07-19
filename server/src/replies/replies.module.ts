import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ContextModule } from "../context/context.module";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailsModule } from "../emails/emails.module";
import { FollowUpsModule } from "../follow-ups/follow-ups.module";
import { LLMModule } from "../llm/llm.module";
import { ScheduledEmailsModule } from "../scheduled-emails/scheduled-emails.module";
import { SnoozeModule } from "../snooze/snooze.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { UsersModule } from "../users/users.module";
import { RepliesController } from "./replies.controller";
import { RepliesService } from "./replies.service";

@Module({
  imports: [
    SubscriptionsModule,
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
