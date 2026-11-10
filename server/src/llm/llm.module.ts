import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { LocalModelSupervision } from "../database/entities/local-model-supervision.entity";
import { PromptExampleEntity } from "../database/entities/prompt-example.entity";
import { TokenUsage } from "../database/entities/token-usage.entity";
import { User } from "../database/entities/user.entity";
import { DebugModule } from "../debug/debug.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { UsersModule } from "../users/users.module";
import { CategoryRuleSanityService } from "./category-rule-sanity.service";
import { CategoryShortlistService } from "./category-shortlist.service";
import { EmbeddingService } from "./embedding.service";
import { IncrementalAnalysisService } from "./incremental-analysis.service";
import { LLMController } from "./llm.controller";
import { LLMService } from "./llm.service";
import { LLMActionsService } from "./llm-actions.service";
import { LLMAskService } from "./llm-ask.service";
import { LLMCategoriesService } from "./llm-categories.service";
import { LLMCoreService } from "./llm-core.service";
import { LLMMiscService } from "./llm-misc.service";
import { LLMReplyService } from "./llm-reply.service";
import { LLMSearchService } from "./llm-search.service";
import { LLMSummarizationService } from "./llm-summarization.service";
import { LLMToneService } from "./llm-tone.service";
import { LocalModelUsageController } from "./local-model-usage.controller";
import { LocalModelUsageService } from "./local-model-usage.service";
import { PriorityAnalysisService } from "./priority-analysis.service";
import { TokenUsageController } from "./token-usage.controller";
import { TokenUsageService } from "./token-usage.service";
import { UserAiKeysController } from "./user-ai-keys.controller";
import { UserAiKeysService } from "./user-ai-keys.service";

@Module({
  imports: [
    SubscriptionsModule,
    ConfigModule,
    TypeOrmModule.forFeature([
      TokenUsage,
      PromptExampleEntity,
      Email,
      EmailThread,
      LocalModelSupervision,
      User,
    ]),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
    DebugModule,
  ],
  controllers: [
    LLMController,
    TokenUsageController,
    LocalModelUsageController,
    UserAiKeysController,
  ],
  providers: [
    LocalModelUsageService,
    LLMService,
    LLMCoreService,
    LLMActionsService,
    LLMAskService,
    LLMCategoriesService,
    LLMMiscService,
    LLMReplyService,
    LLMSearchService,
    LLMSummarizationService,
    LLMToneService,
    CategoryShortlistService,
    CategoryRuleSanityService,
    EmbeddingService,
    PriorityAnalysisService,
    IncrementalAnalysisService,
    TokenUsageService,
    UserAiKeysService,
  ],
  exports: [
    LLMService,
    LLMCoreService,
    LLMActionsService,
    LLMAskService,
    LLMCategoriesService,
    LLMMiscService,
    LLMReplyService,
    LLMSearchService,
    LLMSummarizationService,
    LLMToneService,
    CategoryShortlistService,
    CategoryRuleSanityService,
    EmbeddingService,
    PriorityAnalysisService,
    IncrementalAnalysisService,
    TokenUsageService,
    UserAiKeysService,
  ],
})
export class LLMModule {}
