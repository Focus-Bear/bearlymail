import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { SummarizationRule } from "../database/entities/summarization-rule.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { SchedulingPreferencesModule } from "../scheduling-preferences/scheduling-preferences.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { UsersModule } from "../users/users.module";
import { SummarizationController } from "./summarization.controller";
import { SummarizationService } from "./summarization.service";

@Module({
  imports: [
    SubscriptionsModule,
    TypeOrmModule.forFeature([
      SummarizationRule,
      UserContext,
      Email,
      EmailThread,
    ]),
    forwardRef(() => EmailsModule),
    LLMModule,
    SchedulingPreferencesModule,
    UsersModule,
  ],
  controllers: [SummarizationController],
  providers: [SummarizationService],
  exports: [SummarizationService],
})
export class SummarizationModule {}
