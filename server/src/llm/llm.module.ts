import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LLMService } from "./llm.service";
import { LLMController } from "./llm.controller";
import { LLMCoreService } from "./llm-core.service";
import { PriorityAnalysisService } from "./priority-analysis.service";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [ConfigModule, forwardRef(() => UsersModule)],
  controllers: [LLMController],
  providers: [LLMService, LLMCoreService, PriorityAnalysisService],
  exports: [LLMService, PriorityAnalysisService],
})
export class LLMModule {}
