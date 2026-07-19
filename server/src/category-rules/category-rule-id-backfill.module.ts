import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CategoryRule } from "../database/entities/category-rule.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { UsersModule } from "../users/users.module";
import { CategoryRuleIdBackfillController } from "./category-rule-id-backfill.controller";
import { CategoryRuleIdBackfillProcessor } from "./category-rule-id-backfill.processor";
import { CategoryRuleIdBackfillService } from "./category-rule-id-backfill.service";

/**
 * Self-contained module for the admin-triggered category-rule `categoryId`
 * backfill. Deliberately separate from `CategoryRulesModule` (which pulls in
 * LLMModule and the full rule-matching service) so the worker can register the
 * backfill processor without dragging that weight in.
 *
 * Imported by both AppModule (serves the admin controller) and WorkerModule
 * (registers the PgBoss worker via the processor's onModuleInit).
 * `UserEncryptionService` and `PG_BOSS` come from the global Encryption/Queue
 * modules; `UsersModule` is imported for `AdminGuard`'s `UsersService`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CategoryRule, UserContext]), UsersModule],
  controllers: [CategoryRuleIdBackfillController],
  providers: [CategoryRuleIdBackfillService, CategoryRuleIdBackfillProcessor],
})
export class CategoryRuleIdBackfillModule {}
