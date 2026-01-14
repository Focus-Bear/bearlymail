import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LLMService } from "./llm.service";
import { LLMController } from "./llm.controller";
import { LLMCoreService } from "./llm-core.service";
import { PriorityAnalysisService } from "./priority-analysis.service";
import { TokenUsageService } from "./token-usage.service";
import { TokenUsageController } from "./token-usage.controller";
import { TokenUsage } from "../database/entities/token-usage.entity";
import { UsersModule } from "../users/users.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TokenUsage]),
    forwardRef(() => UsersModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [LLMController, TokenUsageController],
  providers: [
    LLMService,
    LLMCoreService,
    PriorityAnalysisService,
    TokenUsageService,
  ],
  exports: [LLMService, PriorityAnalysisService, TokenUsageService],
})
export class LLMModule {}
