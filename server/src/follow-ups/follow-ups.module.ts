import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FollowUpsService } from './follow-ups.service';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUp } from '../database/entities/follow-up.entity';
import { EmailThread } from '../database/entities/email-thread.entity';
import { Email } from '../database/entities/email.entity';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FollowUp, EmailThread, Email]),
    LLMModule,
  ],
  providers: [FollowUpsService],
  controllers: [FollowUpsController],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}




