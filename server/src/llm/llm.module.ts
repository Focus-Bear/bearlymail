import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { Email } from "../database/entities/email.entity";
import { PromptExampleEntity } from "../database/entities/prompt-example.entity";
import { TokenUsage } from "../database/entities/token-usage.entity";
import { UsersModule } from "../users/users.module";
import { CategoryShortlistService } from "./category-shortlist.service";
import { IncrementalAnalysisService } from "./incremental-analysis.service";
import { LLMController } from "./llm.controller";
import { LLMService } from "./llm.service";
import { LLMActionsService } from "./llm-actions.service";
import { LLMCategoriesService } from "./llm-categories.service";
import { LLMCoreService } from "./llm-core.service";
import { LLMMiscService } from "./llm-misc.service";
import { LLMPatternsService } from "./llm-patterns.service";
import { LLMReplyService } from "./llm-reply.service";
import { LLMSearchService } from "./llm-search.service";
import { LLMSummarizationService } from "./llm-summarization.service";
import { LLMToneService } from "./llm-tone.service";
import { PriorityAnalysisService } from "./priority-analysis.service";
import { TokenUsageController } from "./token-usage.controller";
import { TokenUsageService } from "./token-usage.service";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TokenUsage, PromptExampleEntity, Email]),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [LLMController, TokenUsageController],
  providers: [
    LLMService,
    LLMCoreService,
    LLMActionsService,
    LLMCategoriesService,
    LLMMiscService,
    LLMPatternsService,
    LLMReplyService,
    LLMSearchService,
    LLMSummarizationService,
    LLMToneService,
    CategoryShortlistService,
    PriorityAnalysisService,
    IncrementalAnalysisService,
    TokenUsageService,
  ],
  exports: [
    LLMService,
    LLMCoreService,
    LLMActionsService,
    LLMCategoriesService,
    LLMMiscService,
    LLMPatternsService,
    LLMReplyService,
    LLMSearchService,
    LLMSummarizationService,
    LLMToneService,
    CategoryShortlistService,
    PriorityAnalysisService,
    IncrementalAnalysisService,
    TokenUsageService,
  ],
})
export class LLMModule {}
