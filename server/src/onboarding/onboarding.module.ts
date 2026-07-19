import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ContextModule } from "../context/context.module";
import { ContextAnalysis } from "../database/entities/context-analysis.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ScanEmail } from "../database/entities/scan-email.entity";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { QueueModule } from "../queue/queue.module";
import { UsersModule } from "../users/users.module";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";
import { ScanAnalysisProcessor } from "./scan-analysis.processor";
import { ScanAnalysisService } from "./scan-analysis.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ScanEmail, EmailThread, ContextAnalysis]),
    UsersModule,
    QueueModule,
    EmailsModule,
    ContextModule,
    LLMModule,
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService, ScanAnalysisService, ScanAnalysisProcessor],
  exports: [OnboardingService, ScanAnalysisService],
})
export class OnboardingModule {}
