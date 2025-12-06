import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { QueryPerformanceLogger } from './database/query-logger';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EmailsModule } from './emails/emails.module';
import { PriorityModule } from './priority/priority.module';
import { SummarizationModule } from './summarization/summarization.module';
import { SnoozeModule } from './snooze/snooze.module';
import { NotesModule } from './notes/notes.module';
import { ContextModule } from './context/context.module';
import { RepliesModule } from './replies/replies.module';
import { CalendarModule } from './calendar/calendar.module';
import { LLMModule } from './llm/llm.module';
import { QueueModule } from './queue/queue.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { EncryptionModule } from './encryption/encryption.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ActionItemsModule } from './action-items/action-items.module';
import { BatchScheduleModule } from './batch-schedule/batch-schedule.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { ContactsModule } from './contacts/contacts.module';
import { BlockedSendersModule } from './blocked-senders/blocked-senders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    QueueModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbHost = configService.get<string>('DB_HOST');
        const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';
        const sslEnabled = configService.get<string>('DB_SSL') === 'true';
        
        return {
          type: 'postgres',
          host: dbHost || 'localhost',
          port: parseInt(configService.get<string>('DB_PORT') || '5432'),
          username: configService.get<string>('DB_USERNAME') || 'postgres',
          password: configService.get<string>('DB_PASSWORD') || 'postgres',
          database: configService.get<string>('DB_NAME') || 'adhd_email_client',
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/database/migrations/**/*{.ts,.js}'],
          synchronize: false, // NEVER use synchronize - always use migrations
          ssl: (!isLocal || sslEnabled) ? { rejectUnauthorized: false } : false,
          logger: new QueryPerformanceLogger(),
          maxQueryExecutionTime: parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '1000', 10), // Log queries slower than threshold
          logging: ['error', 'warn'], // Only log errors and slow queries (not all queries)
        };
      },
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
      ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

