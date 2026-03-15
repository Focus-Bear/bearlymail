import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserThrottlerGuard } from "./auth/user-throttler.guard";
import { ActionItemsModule } from "./action-items/action-items.module";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { AutoResponderModule } from "./auto-responder/auto-responder.module";
import { BatchScheduleModule } from "./batch-schedule/batch-schedule.module";
import { BlockedKeywordsModule } from "./blocked-keywords/blocked-keywords.module";
import { BlockedSendersModule } from "./blocked-senders/blocked-senders.module";
import { CalendarModule } from "./calendar/calendar.module";
import { validate } from "./config/env.validation";
import { ContactsModule } from "./contacts/contacts.module";
import { ContextModule } from "./context/context.module";
import { CrmModule } from "./crm/crm.module";
import { DatabaseModule } from "./database/database.module";
import { QueryPerformanceLogger } from "./database/query-logger";
import { createTypeOrmConfig } from "./database/typeorm-config.factory";
import { DraftsModule } from "./drafts/drafts.module";
import { EmailModule } from "./email/email.module";
import { EmailsModule } from "./emails/emails.module";
import { EncryptionModule } from "./encryption/encryption.module";
import { ErrorTrackingModule } from "./error-tracking/error-tracking.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { FollowUpsModule } from "./follow-ups/follow-ups.module";
import { GitHubModule } from "./github/github.module";
import { GoogleAccountsModule } from "./google-accounts/google-accounts.module";
import { LLMModule } from "./llm/llm.module";
import { NotesModule } from "./notes/notes.module";
import { Office365AccountsModule } from "./office365-accounts/office365-accounts.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { PriorityModule } from "./priority/priority.module";
import { ProtoCategoriesModule } from "./proto-categories/proto-categories.module";
import { PusherModule } from "./pusher/pusher.module";
import { QueueModule } from "./queue/queue.module";
import { RepliesModule } from "./replies/replies.module";
import { ScheduledEmailsModule } from "./scheduled-emails/scheduled-emails.module";
import { SchedulingPreferencesModule } from "./scheduling-preferences/scheduling-preferences.module";
import { SnoozeModule } from "./snooze/snooze.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { SuggestedActionsModule } from "./suggested-actions/suggested-actions.module";
import { SummarizationModule } from "./summarization/summarization.module";
import { UsersModule } from "./users/users.module";
import { WaitlistModule } from "./waitlist/waitlist.module";
import { ZohoAccountsModule } from "./zoho-accounts/zoho-accounts.module";

const ONE_HOUR_MS = 3_600_000;
const ONE_MINUTE_MS = 60_000;
const DEFAULT_FEEDBACK_LIMIT = 10;
const DEFAULT_GENERAL_LIMIT = 60;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      validate,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          name: "feedback",
          ttl: configService.get<number>(
            "FEEDBACK_THROTTLE_TTL_MS",
            ONE_HOUR_MS,
          ),
          limit: configService.get<number>(
            "FEEDBACK_THROTTLE_LIMIT",
            DEFAULT_FEEDBACK_LIMIT,
          ),
        },
        {
          name: "default",
          ttl: configService.get<number>(
            "DEFAULT_THROTTLE_TTL_MS",
            ONE_MINUTE_MS,
          ),
          limit: configService.get<number>(
            "DEFAULT_THROTTLE_LIMIT",
            DEFAULT_GENERAL_LIMIT,
          ),
        },
      ],
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
    FeedbackModule,
    FollowUpsModule,
    ContactsModule,
    CrmModule,
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
  providers: [AppService, { provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
