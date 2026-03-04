import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import { AutoResponseSuppression } from "../database/entities/auto-response-suppression.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { User } from "../database/entities/user.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { QueueModule } from "../queue/queue.module";
import { AutoResponderController } from "./auto-responder.controller";
import { AutoResponderProcessor } from "./auto-responder.processor";
import { AutoResponderService } from "./auto-responder.service";
import { AutoResponderAnalyticsService } from "./auto-responder-analytics.service";
import { AutoResponderContextService } from "./auto-responder-context.service";
import { AutoResponderPreviewService } from "./auto-responder-preview.service";
import { AutoResponderQaService } from "./auto-responder-qa.service";
import { AutoResponderSuppressionService } from "./auto-responder-suppression.service";
import { AutoResponderTemplateService } from "./auto-responder-template.service";
import { EmailClassifierService } from "./email-classifier.service";
import { QueueStatsService } from "./queue-stats.service";

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
    AutoResponderContextService,
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
    AutoResponderContextService,
    EmailClassifierService,
    QueueStatsService,
    AutoResponderSuppressionService,
    AutoResponderQaService,
    AutoResponderAnalyticsService,
    AutoResponderPreviewService,
  ],
})
export class AutoResponderModule {}
