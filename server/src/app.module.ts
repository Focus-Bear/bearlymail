import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
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
          synchronize: configService.get<string>('NODE_ENV') !== 'production',
          ssl: (!isLocal || sslEnabled) ? { rejectUnauthorized: false } : false,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

