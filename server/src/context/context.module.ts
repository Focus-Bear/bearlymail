import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ContextController } from "./context.controller";
import { ContextService } from "./context.service";
import { UserContext } from "../database/entities/user-context.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { LLMModule } from "../llm/llm.module";
import { UsersModule } from "../users/users.module";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([UserContext, Email, EmailThread, ContextAnalysis]),
    LLMModule,
    UsersModule,
    QueueModule,
  ],
  controllers: [ContextController],
  providers: [ContextService],
  exports: [ContextService],
})
export class ContextModule {}
