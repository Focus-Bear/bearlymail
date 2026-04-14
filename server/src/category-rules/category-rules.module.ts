import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CategoryRule } from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { LLMModule } from "../llm/llm.module";
import { CategoryRulesController } from "./category-rules.controller";
import { CategoryRulesService } from "./category-rules.service";

@Module({
  imports: [TypeOrmModule.forFeature([CategoryRule, Email]), LLMModule],
  controllers: [CategoryRulesController],
  providers: [CategoryRulesService],
  exports: [CategoryRulesService],
})
export class CategoryRulesModule {}
