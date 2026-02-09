import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ContextController } from "./context.controller";
import { ContextService } from "./context.service";
import { ContextCrudService } from "./context-crud.service";
import { ContextCategoryService } from "./context-category.service";
import { ContextAnalysisProgressService } from "./context-analysis-progress.service";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";
import { ContextGmailDataService } from "./context-gmail-data.service";
import { ContextQaExtractionService } from "./context-qa-extraction.service";
import { ContextAnalysisProcessor } from "./context-analysis.processor";
import { ContextBatchAnalysisProcessor } from "./context-batch-analysis.processor";
import { ContextFinalizationProcessor } from "./context-finalization.processor";
import { WritingStyleLearningService } from "./writing-style-learning.service";
import { WritingStyleLearningProcessor } from "./writing-style-learning.processor";
import { UserContext } from "../database/entities/user-context.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { LLMModule } from "../llm/llm.module";
import { UsersModule } from "../users/users.module";
import { QueueModule } from "../queue/queue.module";
import { forwardRef } from "@nestjs/common";
import { EmailsModule } from "../emails/emails.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserContext,
      Email,
      EmailThread,
      ContextAnalysis,
    ]),
    LLMModule,
    UsersModule,
    QueueModule,
    forwardRef(() => EmailsModule),
  ],
  controllers: [ContextController],
  providers: [
    ContextService,
    ContextCrudService,
    ContextCategoryService,
    ContextAnalysisProgressService,
    ContextPiiRedactionService,
    ContextGmailDataService,
    ContextQaExtractionService,
    ContextAnalysisProcessor,
    ContextBatchAnalysisProcessor,
    ContextFinalizationProcessor,
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
