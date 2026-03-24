import { Module } from "@nestjs/common";
import { forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AwsModule } from "../aws/aws.module";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { User } from "../database/entities/user.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { QueueModule } from "../queue/queue.module";
import { UsersModule } from "../users/users.module";
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
import { ContextFinalizationProcessor } from "./context-finalization.processor";
import { ContextGmailDataService } from "./context-gmail-data.service";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";
import { ContextQaExtractionService } from "./context-qa-extraction.service";
import { WritingStyleLearningProcessor } from "./writing-style-learning.processor";
import { WritingStyleLearningService } from "./writing-style-learning.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserContext,
      Email,
      EmailThread,
      ContextAnalysis,
      User,
    ]),
    LLMModule,
    UsersModule,
    QueueModule,
    forwardRef(() => EmailsModule),
    AwsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [ContextController],
  providers: [
    ContextService,
    ContextAnalysisHelpersService,
    ContextAnalysisQueryService,
    ContextAnalysisOrchestratorService,
    ContextAnalysisFinalizerService,
    ContextBatchPayloadService,
    ContextCrudService,
    ContextCategoryService,
    ContextCompressionService,
    ContextAnalysisProgressService,
    ContextPiiRedactionService,
    ContextGmailDataService,
    ContextQaExtractionService,
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
    ContextAnalysisProgressService,
    WritingStyleLearningService,
  ],
})
export class ContextModule {}
