import { Module, forwardRef } from "@nestjs/common";
import { RepliesController } from "./replies.controller";
import { RepliesService } from "./replies.service";
import { EmailsModule } from "../emails/emails.module";
import { ContextModule } from "../context/context.module";
import { LLMModule } from "../llm/llm.module";
import { UsersModule } from "../users/users.module";
import { SnoozeModule } from "../snooze/snooze.module";
import { FollowUpsModule } from "../follow-ups/follow-ups.module";

@Module({
  imports: [
    EmailsModule,
    forwardRef(() => ContextModule),
    LLMModule,
    UsersModule,
    SnoozeModule,
    forwardRef(() => FollowUpsModule),
  ],
  controllers: [RepliesController],
  providers: [RepliesService],
  exports: [RepliesService],
})
export class RepliesModule {}
