import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Queue module for pg-boss
import { QueueModule } from './queue/queue.module';

// Database entities
import { User } from './database/entities/user.entity';
import { Email } from './database/entities/email.entity';
import { EmailThread } from './database/entities/email-thread.entity';
import { UserContext } from './database/entities/user-context.entity';
import { ScanEmail } from './database/entities/scan-email.entity';
import { ActionItem } from './database/entities/action-item.entity';
import { PrivateNote } from './database/entities/private-note.entity';
import { SummarizationRule } from './database/entities/summarization-rule.entity';
import { Waitlist } from './database/entities/waitlist.entity';
import { BlockedSender } from './database/entities/blocked-sender.entity';

// Worker processors
import { EmailSyncProcessor } from './emails/email-sync.processor';
import { LLMProcessor } from './emails/llm-processor';
import { PriorityLearningProcessor } from './priority/priority-learning.processor';
import { ScanAnalysisProcessor } from './onboarding/scan-analysis.processor';
import { ContextAnalysisProcessor } from './context/context-analysis.processor';

// Services needed by processors
import { EmailsService } from './emails/emails.service';
import { EmailProviderManager } from './emails/email-provider-manager.service';
import { GmailProvider } from './emails/providers/gmail.provider';
import { ScanEmailService } from './emails/scan-email.service';
import { UsersService } from './users/users.service';
import { PriorityService } from './priority/priority.service';
import { PriorityLearningService } from './priority/priority-learning.service';
import { SummarizationService } from './summarization/summarization.service';
import { LLMService } from './llm/llm.service';
import { ScanAnalysisService } from './onboarding/scan-analysis.service';
import { ContextService } from './context/context.service';
import { EncryptionService } from './encryption/encryption.service';
import { BlockedSendersService } from './blocked-senders/blocked-senders.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbHost = configService.get<string>('DB_HOST');
        const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';
        const sslEnabled = configService.get<string>('DB_SSL') === 'true';
        const useSsl = (!isLocal || sslEnabled) ? { rejectUnauthorized: false } : false;

        return {
          type: 'postgres',
          host: configService.get('DB_HOST'),
          port: +configService.get<number>('DB_PORT'),
          username: configService.get('DB_USERNAME'),
          password: configService.get('DB_PASSWORD'),
          database: configService.get('DB_NAME'),
          entities: [
            User,
            Email,
            EmailThread,
            UserContext,
            ScanEmail,
            ActionItem,
            PrivateNote,
            SummarizationRule,
            Waitlist,
            BlockedSender,
          ],
          synchronize: false,
          ssl: useSsl,
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      User,
      Email,
      EmailThread,
      UserContext,
      ScanEmail,
      ActionItem,
      PrivateNote,
      SummarizationRule,
      BlockedSender,
    ]),
    QueueModule,
  ],
  providers: [
    // Core services
    EncryptionService,
    UsersService,
    EmailsService,
    EmailProviderManager,
    GmailProvider,
    ScanEmailService,
    PriorityService,
    PriorityLearningService,
    SummarizationService,
    LLMService,
    ScanAnalysisService,
    ContextService,
    BlockedSendersService,
    
    // Worker processors (these register themselves with pg-boss on init)
    EmailSyncProcessor,
    LLMProcessor,
    PriorityLearningProcessor,
    ScanAnalysisProcessor,
    ContextAnalysisProcessor,
  ],
})
export class WorkerModule {}

