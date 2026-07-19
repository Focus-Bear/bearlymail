import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ContextModule } from "../context/context.module";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { FollowUp } from "../database/entities/follow-up.entity";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { QueueModule } from "../queue/queue.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { UsersModule } from "../users/users.module";
import { FollowUpsController } from "./follow-ups.controller";
import { FollowUpsProcessor } from "./follow-ups.processor";
import { FollowUpsService } from "./follow-ups.service";

@Module({
  imports: [
    SubscriptionsModule,
    TypeOrmModule.forFeature([FollowUp, EmailThread, Email]),
    LLMModule,
    UsersModule,
    ContextModule,
    forwardRef(() => EmailsModule),
    QueueModule,
  ],
  providers: [FollowUpsService, FollowUpsProcessor],
  controllers: [FollowUpsController],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
