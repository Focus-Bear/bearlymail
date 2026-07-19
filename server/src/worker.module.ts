import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AppleMailAccountsModule } from "./apple-mail-accounts/apple-mail-accounts.module";
import { AuditModule } from "./audit/audit.module";
import { AutoResponderModule } from "./auto-responder/auto-responder.module";
import { BatchScheduleModule } from "./batch-schedule/batch-schedule.module";
import { BlockedKeywordsModule } from "./blocked-keywords/blocked-keywords.module";
import { BlockedSendersModule } from "./blocked-senders/blocked-senders.module";
import { CategoryRuleIdBackfillModule } from "./category-rules/category-rule-id-backfill.module";
import { ContactsModule } from "./contacts/contacts.module";
import { ContextModule } from "./context/context.module";
import { createTypeOrmConfig } from "./database/typeorm-config.factory";
import { EmailsModule } from "./emails/emails.module";
import { EncryptionModule } from "./encryption/encryption.module";
import { ErrorTrackingModule } from "./error-tracking/error-tracking.module";
import { FollowUpsModule } from "./follow-ups/follow-ups.module";
import { GitHubModule } from "./github/github.module";
import { GoogleAccountsModule } from "./google-accounts/google-accounts.module";
import { LLMModule } from "./llm/llm.module";
import { MaintenanceModule } from "./maintenance/maintenance.module";
import { MCPModule } from "./mcp/mcp.module";
import { NotesModule } from "./notes/notes.module";
import { Office365AccountsModule } from "./office365-accounts/office365-accounts.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { PriorityModule } from "./priority/priority.module";
import { ProtoCategoriesModule } from "./proto-categories/proto-categories.module";
import { PusherModule } from "./pusher/pusher.module";
// Feature modules — each module owns its own entities, services, and processors.
// Importing them here gives the worker access to everything they provide,
// so we never need to manually list individual services or entities.
import { QueueModule } from "./queue/queue.module";
import { ScheduledEmailsModule } from "./scheduled-emails/scheduled-emails.module";
import { SnoozeModule } from "./snooze/snooze.module";
import { SuggestedRepliesModule } from "./suggested-replies/suggested-replies.module";
import { SummarizationModule } from "./summarization/summarization.module";
import { UsersModule } from "./users/users.module";
import { WorkflowsModule } from "./workflows/workflows.module";
import { ZohoAccountsModule } from "./zoho-accounts/zoho-accounts.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: createTypeOrmConfig,
      inject: [ConfigService],
    }),

    // Infrastructure modules
    QueueModule,
    EncryptionModule,
    ErrorTrackingModule,
    AuditModule,

    // Feature modules — processors inside these modules register themselves
    // with pg-boss on init, so the worker picks up jobs automatically.
    UsersModule,
    EmailsModule,
    PriorityModule,
    SummarizationModule,
    LLMModule,
    ContextModule,
    OnboardingModule,
    SnoozeModule,
    BatchScheduleModule,
    AutoResponderModule,
    FollowUpsModule,
    SuggestedRepliesModule,
    ProtoCategoriesModule,
    GitHubModule,
    GoogleAccountsModule,
    Office365AccountsModule,
    ZohoAccountsModule,
    AppleMailAccountsModule,
    BlockedSendersModule,
    BlockedKeywordsModule,
    NotesModule,
    PusherModule,
    CategoryRuleIdBackfillModule,
    ContactsModule,
    ScheduledEmailsModule,
    WorkflowsModule,
    MCPModule,
    MaintenanceModule,
  ],
})
export class WorkerModule {}
