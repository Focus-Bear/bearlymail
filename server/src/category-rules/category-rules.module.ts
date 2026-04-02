import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CategoryRule } from "../database/entities/category-rule.entity";
import { CategoryRulesController } from "./category-rules.controller";
import { CategoryRulesService } from "./category-rules.service";

@Module({
  imports: [TypeOrmModule.forFeature([CategoryRule])],
  controllers: [CategoryRulesController],
  providers: [CategoryRulesService],
  exports: [CategoryRulesService],
})
export class CategoryRulesModule {}
