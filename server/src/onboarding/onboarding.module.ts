import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";
import { ScanAnalysisService } from "./scan-analysis.service";
import { ScanAnalysisProcessor } from "./scan-analysis.processor";
import { ScanEmail } from "../database/entities/scan-email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UsersModule } from "../users/users.module";
import { QueueModule } from "../queue/queue.module";
import { EmailsModule } from "../emails/emails.module";
import { ContextModule } from "../context/context.module";
import { LLMModule } from "../llm/llm.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([ScanEmail, EmailThread]),
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
