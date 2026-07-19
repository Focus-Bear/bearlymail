import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AwsModule } from "../aws/aws.module";
import { Email } from "../database/entities/email.entity";
import { SuggestedReply } from "../database/entities/suggested-reply.entity";
import { LLMModule } from "../llm/llm.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { UsersModule } from "../users/users.module";
import { SuggestedRepliesController } from "./suggested-replies.controller";
import { SuggestedRepliesProcessor } from "./suggested-replies.processor";
import { SuggestedRepliesService } from "./suggested-replies.service";

@Module({
  imports: [
    SubscriptionsModule,
    TypeOrmModule.forFeature([SuggestedReply, Email]),
    forwardRef(() => LLMModule),
    forwardRef(() => UsersModule),
    AwsModule,
  ],
  controllers: [SuggestedRepliesController],
  providers: [SuggestedRepliesService, SuggestedRepliesProcessor],
  exports: [SuggestedRepliesService],
})
export class SuggestedRepliesModule {}
