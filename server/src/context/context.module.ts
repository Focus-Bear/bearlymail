import { Module } from "@nestjs/common";
import { forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AwsModule } from "../aws/aws.module";
import { CategoryKeysModule } from "../category-keys/category-keys.module";
import { CategoryConsolidationRun } from "../database/entities/category-consolidation-run.entity";
import { CategoryFamily } from "../database/entities/category-family.entity";
import { CategoryRule } from "../database/entities/category-rule.entity";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { User } from "../database/entities/user.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { QueueModule } from "../queue/queue.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { UsersModule } from "../users/users.module";
import { CategoryConsolidationProcessor } from "./category-consolidation.processor";
import { CategoryConsolidationService } from "./category-consolidation.service";
import { CategoryConsolidationRunService } from "./category-consolidation-run.service";
import { CategoryFamilyController } from "./category-family.controller";
import { CategoryFamilyService } from "./category-family.service";
import { ContextController } from "./context.controller";
import { ContextService } from "./context.service";
import { ContextAnalysisProcessor } from "./context-analysis.processor";
import { ContextAnalysisCleanupService } from "./context-analysis-cleanup.service";
import { ContextAnalysisFinalizerService } from "./context-analysis-finalizer.service";
import { ContextAnalysisHelpersService } from "./context-analysis-helpers.service";
import { ContextAnalysisOrchestratorService } from "./context-analysis-orchestrator.service";
import { ContextAnalysisProgressService } from "./context-analysis-progress.service";
import { ContextAnalysisQueryService } from "./context-analysis-query.service";
import { ContextBatchAnalysisProcessor } from "./context-batch-analysis.processor";
import { ContextBatchPayloadService } from "./context-batch-payload.service";
import { ContextCategoryService } from "./context-category.service";
import { ContextCompressionService } from "./context-compression.service";
import { ContextCrudService } from "./context-crud.service";
import { ContextEnqueueService } from "./context-enqueue.service";
import { ContextFinalizationProcessor } from "./context-finalization.processor";
import { ContextGmailDataService } from "./context-gmail-data.service";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";
import { ContextQaExtractionService } from "./context-qa-extraction.service";
import { ContextSqsDispatchService } from "./context-sqs-dispatch.service";
import { LearnQaProcessor } from "./learn-qa.processor";
import { WritingStyleLearningProcessor } from "./writing-style-learning.processor";
import { WritingStyleLearningService } from "./writing-style-learning.service";

@Module({
  imports: [
    SubscriptionsModule,
    CategoryKeysModule,
    TypeOrmModule.forFeature([
      UserContext,
      Email,
      EmailThread,
      ContextAnalysis,
      CategoryConsolidationRun,
      CategoryFamily,
      CategoryRule,
      User,
    ]),
    LLMModule,
    UsersModule,
    QueueModule,
    forwardRef(() => EmailsModule),
    AwsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [ContextController, CategoryFamilyController],
  providers: [
    ContextService,
    CategoryFamilyService,
    CategoryConsolidationService,
    CategoryConsolidationRunService,
    CategoryConsolidationProcessor,
    ContextAnalysisHelpersService,
    ContextAnalysisQueryService,
    ContextAnalysisOrchestratorService,
    ContextAnalysisFinalizerService,
    ContextSqsDispatchService,
    ContextEnqueueService,
    ContextBatchPayloadService,
    ContextCrudService,
    ContextCategoryService,
    ContextCompressionService,
    ContextAnalysisProgressService,
    ContextPiiRedactionService,
    ContextGmailDataService,
    ContextQaExtractionService,
    LearnQaProcessor,
    ContextAnalysisProcessor,
    ContextBatchAnalysisProcessor,
    ContextFinalizationProcessor,
    ContextAnalysisCleanupService,
    WritingStyleLearningService,
    WritingStyleLearningProcessor,
  ],
  exports: [
    ContextService,
    ContextCrudService,
    ContextCategoryService,
    CategoryFamilyService,
    ContextAnalysisProgressService,
    WritingStyleLearningService,
  ],
})
export class ContextModule {}
