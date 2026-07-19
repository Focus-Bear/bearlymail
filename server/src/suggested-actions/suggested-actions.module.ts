import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ActionItemsModule } from "../action-items/action-items.module";
import { CalendarModule } from "../calendar/calendar.module";
import { ActionItem } from "../database/entities/action-item.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailsModule } from "../emails/emails.module";
import { GitHubModule } from "../github/github.module";
import { LLMModule } from "../llm/llm.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { UsersModule } from "../users/users.module";
import { SuggestedActionsController } from "./suggested-actions.controller";
import { SuggestedActionsService } from "./suggested-actions.service";

@Module({
  imports: [
    SubscriptionsModule,
    TypeOrmModule.forFeature([ActionItem, EmailThread, UserContext]),
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
