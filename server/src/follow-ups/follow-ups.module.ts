import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FollowUpsService } from "./follow-ups.service";
import { FollowUpsController } from "./follow-ups.controller";
import { FollowUpsProcessor } from "./follow-ups.processor";
import { FollowUp } from "../database/entities/follow-up.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { Email } from "../database/entities/email.entity";
import { LLMModule } from "../llm/llm.module";
import { UsersModule } from "../users/users.module";
import { ContextModule } from "../context/context.module";
import { EmailsModule } from "../emails/emails.module";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [
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
