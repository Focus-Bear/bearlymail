import { Module } from '@nestjs/common';
import { RepliesController } from './replies.controller';
import { RepliesService } from './replies.service';
import { EmailsModule } from '../emails/emails.module';
import { ContextModule } from '../context/context.module';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [EmailsModule, ContextModule, LLMModule],
  controllers: [RepliesController],
  providers: [RepliesService],
  exports: [RepliesService],
})
export class RepliesModule {}

