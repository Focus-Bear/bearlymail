import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SuggestedActionsController } from "./suggested-actions.controller";
import { SuggestedActionsService } from "./suggested-actions.service";
import { UsersModule } from "../users/users.module";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { GitHubModule } from "../github/github.module";
import { CalendarModule } from "../calendar/calendar.module";
import { ActionItemsModule } from "../action-items/action-items.module";
import { ActionItem } from "../database/entities/action-item.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([ActionItem]),
    UsersModule,
    forwardRef(() => EmailsModule),
    LLMModule,
    GitHubModule,
    CalendarModule,
    ActionItemsModule,
  ],
  controllers: [SuggestedActionsController],
  providers: [SuggestedActionsService],
  exports: [SuggestedActionsService],
})
export class SuggestedActionsModule {}


