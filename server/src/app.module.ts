import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { createTypeOrmConfig } from "./database/typeorm-config.factory";
import { DatabaseModule } from "./database/database.module";
import { QueryPerformanceLogger } from "./database/query-logger";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { EmailsModule } from "./emails/emails.module";
import { PriorityModule } from "./priority/priority.module";
import { SummarizationModule } from "./summarization/summarization.module";
import { SnoozeModule } from "./snooze/snooze.module";
import { NotesModule } from "./notes/notes.module";
import { ContextModule } from "./context/context.module";
import { RepliesModule } from "./replies/replies.module";
import { CalendarModule } from "./calendar/calendar.module";
import { LLMModule } from "./llm/llm.module";
import { QueueModule } from "./queue/queue.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { WaitlistModule } from "./waitlist/waitlist.module";
import { EncryptionModule } from "./encryption/encryption.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { ActionItemsModule } from "./action-items/action-items.module";
import { BatchScheduleModule } from "./batch-schedule/batch-schedule.module";
import { FollowUpsModule } from "./follow-ups/follow-ups.module";
import { ContactsModule } from "./contacts/contacts.module";
import { BlockedSendersModule } from "./blocked-senders/blocked-senders.module";
import { BlockedKeywordsModule } from "./blocked-keywords/blocked-keywords.module";
import { EmailModule } from "./email/email.module";
import { GoogleAccountsModule } from "./google-accounts/google-accounts.module";
import { Office365AccountsModule } from "./office365-accounts/office365-accounts.module";
import { ZohoAccountsModule } from "./zoho-accounts/zoho-accounts.module";
import { GitHubModule } from "./github/github.module";
import { SuggestedActionsModule } from "./suggested-actions/suggested-actions.module";
import { AutoResponderModule } from "./auto-responder/auto-responder.module";
import { DraftsModule } from "./drafts/drafts.module";
import { SchedulingPreferencesModule } from "./scheduling-preferences/scheduling-preferences.module";
import { PusherModule } from "./pusher/pusher.module";
import { ErrorTrackingModule } from "./error-tracking/error-tracking.module";
import { ScheduledEmailsModule } from "./scheduled-emails/scheduled-emails.module";
import { ProtoCategoriesModule } from "./proto-categories/proto-categories.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    ErrorTrackingModule,
    QueueModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createTypeOrmConfig(configService, {
          migrations: [`${__dirname}/database/migrations/**/*{.ts,.js}`],
          logger: new QueryPerformanceLogger(),
          maxQueryExecutionTime: parseInt(
            process.env.SLOW_QUERY_THRESHOLD_MS || "1000",
            10,
          ),
          logging: ["error", "warn"],
        }),
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    EmailsModule,
    PriorityModule,
    SummarizationModule,
    SnoozeModule,
    NotesModule,
    ContextModule,
    RepliesModule,
    CalendarModule,
    LLMModule,
    OnboardingModule,
    WaitlistModule,
    EncryptionModule,
    SubscriptionsModule,
    ActionItemsModule,
    BatchScheduleModule,
    FollowUpsModule,
    ContactsModule,
    BlockedSendersModule,
    BlockedKeywordsModule,
    EmailModule,
    GoogleAccountsModule,
    Office365AccountsModule,
    ZohoAccountsModule,
    GitHubModule,
    SuggestedActionsModule,
    AutoResponderModule,
    DraftsModule,
    SchedulingPreferencesModule,
    PusherModule,
    ScheduledEmailsModule,
    ProtoCategoriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
