import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SuggestedRepliesController } from "./suggested-replies.controller";
import { SuggestedRepliesService } from "./suggested-replies.service";
import { SuggestedRepliesProcessor } from "./suggested-replies.processor";
import { SuggestedReply } from "../database/entities/suggested-reply.entity";
import { Email } from "../database/entities/email.entity";
import { LLMModule } from "../llm/llm.module";
import { UsersModule } from "../users/users.module";
import { AwsModule } from "../aws/aws.module";

@Module({
  imports: [
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
