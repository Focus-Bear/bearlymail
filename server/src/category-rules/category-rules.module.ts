import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CategoryRule } from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { LLMModule } from "../llm/llm.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { CategoryRulesController } from "./category-rules.controller";
import { CategoryRulesService } from "./category-rules.service";

@Module({
  imports: [
    SubscriptionsModule,
    TypeOrmModule.forFeature([CategoryRule, Email, EmailThread, UserContext]),
    LLMModule,
  ],
  controllers: [CategoryRulesController],
  providers: [CategoryRulesService],
  exports: [CategoryRulesService],
})
export class CategoryRulesModule {}
