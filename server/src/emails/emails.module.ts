import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';
import { GmailService } from './gmail.service';
import { EmailSyncProcessor } from './email-sync.processor';
import { Email } from '../database/entities/email.entity';
import { PriorityModule } from '../priority/priority.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Email]), 
    PriorityModule, 
    UsersModule,
  ],
  controllers: [EmailsController],
  providers: [EmailsService, GmailService, EmailSyncProcessor],
  exports: [EmailsService, GmailService],
})
export class EmailsModule {}

