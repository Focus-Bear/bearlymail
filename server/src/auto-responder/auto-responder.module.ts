import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AutoResponderController } from "./auto-responder.controller";
import { AutoResponderService } from "./auto-responder.service";
import { AutoResponderProcessor } from "./auto-responder.processor";
import { EmailClassifierService } from "./email-classifier.service";
import { QueueStatsService } from "./queue-stats.service";
import { AutoResponderTemplateService } from "./auto-responder-template.service";
import { AutoResponderSuppressionService } from "./auto-responder-suppression.service";
import { AutoResponderQaService } from "./auto-responder-qa.service";
import { AutoResponderAnalyticsService } from "./auto-responder-analytics.service";
import { AutoResponderPreviewService } from "./auto-responder-preview.service";
import { User } from "../database/entities/user.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import { AutoResponseSuppression } from "../database/entities/auto-response-suppression.entity";
import { LLMModule } from "../llm/llm.module";
import { EmailsModule } from "../emails/emails.module";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Email,
      EmailThread,
      UserContext,
      AutoResponseLog,
      AutoResponseSuppression,
    ]),
    forwardRef(() => LLMModule),
    forwardRef(() => EmailsModule),
    QueueModule,
  ],
  controllers: [AutoResponderController],
  providers: [
    AutoResponderService,
    AutoResponderProcessor,
    EmailClassifierService,
    QueueStatsService,
    AutoResponderTemplateService,
    AutoResponderSuppressionService,
    AutoResponderQaService,
    AutoResponderAnalyticsService,
    AutoResponderPreviewService,
  ],
  exports: [
    AutoResponderService,
    AutoResponderProcessor,
    EmailClassifierService,
    QueueStatsService,
    AutoResponderSuppressionService,
    AutoResponderQaService,
    AutoResponderAnalyticsService,
    AutoResponderPreviewService,
  ],
})
export class AutoResponderModule {}
