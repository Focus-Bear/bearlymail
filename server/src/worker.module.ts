import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

// Queue module for pg-boss
import { QueueModule } from "./queue/queue.module";
import { GitHubModule } from "./github/github.module";
import { Office365AccountsModule } from "./office365-accounts/office365-accounts.module";
import { ZohoAccountsModule } from "./zoho-accounts/zoho-accounts.module";
import { GoogleAccountsModule } from "./google-accounts/google-accounts.module";
import { PriorityModule } from "./priority/priority.module";
import { LLMModule } from "./llm/llm.module";
import { BatchScheduleModule } from "./batch-schedule/batch-schedule.module";
import { AutoResponderModule } from "./auto-responder/auto-responder.module";
import { FollowUpsModule } from "./follow-ups/follow-ups.module";
import { SuggestedRepliesModule } from "./suggested-replies/suggested-replies.module";

// Database entities
import { User } from "./database/entities/user.entity";
import { GoogleAccount } from "./database/entities/google-account.entity";
import { Office365Account } from "./database/entities/office365-account.entity";
import { ZohoAccount } from "./database/entities/zoho-account.entity";
import { Email } from "./database/entities/email.entity";
import { EmailThread } from "./database/entities/email-thread.entity";
import { UserContext } from "./database/entities/user-context.entity";
import { ContextAnalysis } from "./database/entities/context-analysis.entity";
import { ScanEmail } from "./database/entities/scan-email.entity";
import { ActionItem } from "./database/entities/action-item.entity";
import { PrivateNote } from "./database/entities/private-note.entity";
import { SummarizationRule } from "./database/entities/summarization-rule.entity";
import { Waitlist } from "./database/entities/waitlist.entity";
import { BlockedSender } from "./database/entities/blocked-sender.entity";
import { BlockedKeyword } from "./database/entities/blocked-keyword.entity";
import { PriorityOverride } from "./database/entities/priority-override.entity";
import { CategoryOverride } from "./database/entities/category-override.entity";
import { TokenUsage } from "./database/entities/token-usage.entity";
import { SuggestedReply } from "./database/entities/suggested-reply.entity";

// Worker processors
import { EmailSyncProcessor } from "./emails/email-sync.processor";
import { LLMProcessor } from "./emails/llm-processor";
import { PriorityLearningProcessor } from "./priority/priority-learning.processor";
import { ScanAnalysisProcessor } from "./onboarding/scan-analysis.processor";
import { ContextAnalysisProcessor } from "./context/context-analysis.processor";
import { ContextBatchAnalysisProcessor } from "./context/context-batch-analysis.processor";
import { ContextFinalizationProcessor } from "./context/context-finalization.processor";
import { WritingStyleLearningProcessor } from "./context/writing-style-learning.processor";
import { WritingStyleLearningService } from "./context/writing-style-learning.service";
import { ArchiveEmailProcessor } from "./emails/archive-email.processor";
import { SnoozeProcessor } from "./snooze/snooze.processor";

// Services needed by processors
import { EmailsService } from "./emails/emails.service";
import { EmailThreadService } from "./emails/email-thread.service";
import { EmailProviderManager } from "./emails/email-provider-manager.service";
import { GmailProvider } from "./emails/providers/gmail.provider";
import { Office365Provider } from "./emails/providers/office365.provider";
import { ZohoProvider } from "./emails/providers/zoho.provider";
import { ScanEmailService } from "./emails/scan-email.service";
import { EmailSearchService } from "./emails/email-search.service";
import { EmailStarService } from "./emails/email-star.service";
import { EmailDebugService } from "./emails/email-debug.service";
import { EmailReadService } from "./emails/email-read.service";
import { EmailCrudService } from "./emails/email-crud.service";
import { EmailGmailService } from "./emails/email-gmail.service";
import { EmailStatusService } from "./emails/email-status.service";
import { UsersService } from "./users/users.service";
import { PriorityService } from "./priority/priority.service";
import { PriorityLearningService } from "./priority/priority-learning.service";
import { SummarizationService } from "./summarization/summarization.service";
import { LLMService } from "./llm/llm.service";
import { ScanAnalysisService } from "./onboarding/scan-analysis.service";
import { ContextService } from "./context/context.service";
import { ContextPiiRedactionService } from "./context/context-pii-redaction.service";
import { ContextGmailDataService } from "./context/context-gmail-data.service";
import { ContextQaExtractionService } from "./context/context-qa-extraction.service";
import { ContextCrudService } from "./context/context-crud.service";
import { ContextCategoryService } from "./context/context-category.service";
import { ContextAnalysisProgressService } from "./context/context-analysis-progress.service";
import { EncryptionService } from "./encryption/encryption.service";
import { BlockedSendersService } from "./blocked-senders/blocked-senders.service";
import { BlockedKeywordsService } from "./blocked-keywords/blocked-keywords.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbHost = configService.get<string>("DB_HOST");
        const isLocal = dbHost === "localhost" || dbHost === "127.0.0.1";
        const sslEnabled = configService.get<string>("DB_SSL") === "true";
        const useSsl =
          !isLocal || sslEnabled ? { rejectUnauthorized: false } : false;

        return {
          type: "postgres",
          host: configService.get("DB_HOST"),
          port: +configService.get<number>("DB_PORT"),
          username: configService.get("DB_USERNAME"),
          password: configService.get("DB_PASSWORD"),
          database: configService.get("DB_NAME"),
          entities: [
            GoogleAccount,
            Office365Account,
            ZohoAccount,
            // Load account entities first to avoid relationship resolution issues
            User,
            Email,
            EmailThread,
            UserContext,
            ContextAnalysis,
            ScanEmail,
            ActionItem,
            PrivateNote,
            SummarizationRule,
            Waitlist,
            BlockedSender,
            BlockedKeyword,
            PriorityOverride,
            CategoryOverride,
            TokenUsage,
            SuggestedReply,
          ],
          synchronize: false,
          ssl: useSsl,
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      GoogleAccount,
      Office365Account,
      ZohoAccount,
      User,
      Email,
      EmailThread,
      UserContext,
      ContextAnalysis,
      ScanEmail,
      ActionItem,
      PrivateNote,
      SummarizationRule,
      BlockedSender,
      BlockedKeyword,
      PriorityOverride,
      CategoryOverride,
      SuggestedReply,
    ]),
    QueueModule,
    GitHubModule,
    Office365AccountsModule,
    ZohoAccountsModule,
    GoogleAccountsModule,
    PriorityModule,
    LLMModule,
    BatchScheduleModule,
    AutoResponderModule,
    FollowUpsModule,
    SuggestedRepliesModule,
  ],
  providers: [
    // Core services
    EncryptionService,
    UsersService,
    EmailThreadService,
    EmailSearchService,
    EmailStarService,
    EmailDebugService,
    EmailReadService,
    EmailCrudService,
    EmailGmailService,
    EmailStatusService,
    EmailsService,
    EmailProviderManager,
    GmailProvider,
    Office365Provider,
    ZohoProvider,
    ScanEmailService,
    PriorityService,
    PriorityLearningService,
    SummarizationService,
    LLMService,
    ScanAnalysisService,
    ContextService,
    ContextPiiRedactionService,
    ContextGmailDataService,
    ContextQaExtractionService,
    ContextCrudService,
    ContextCategoryService,
    ContextAnalysisProgressService,
    BlockedSendersService,
    BlockedKeywordsService,

    // Worker processors (these register themselves with pg-boss on init)
    EmailSyncProcessor,
    LLMProcessor,
    PriorityLearningProcessor,
    ScanAnalysisProcessor,
    ContextAnalysisProcessor,
    ContextBatchAnalysisProcessor,
    ContextFinalizationProcessor,
    WritingStyleLearningService,
    WritingStyleLearningProcessor,
    ArchiveEmailProcessor,
    SnoozeProcessor,
  ],
})
export class WorkerModule {}
