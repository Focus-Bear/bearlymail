import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SuggestedActionsController } from "./suggested-actions.controller";
import { SuggestedActionsService } from "./suggested-actions.service";
import { UsersModule } from "../users/users.module";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { GitHubModule } from "../github/github.module";
import { CalendarModule } from "../calendar/calendar.module";
import { Email } from "../database/entities/email.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([Email]),
    UsersModule,
    forwardRef(() => EmailsModule),
    LLMModule,
    GitHubModule,
    CalendarModule,
  ],
  controllers: [SuggestedActionsController],
  providers: [SuggestedActionsService],
  exports: [SuggestedActionsService],
})
export class SuggestedActionsModule {}


