import { Module } from '@nestjs/common';
import { SummarizationController } from './summarization.controller';
import { SummarizationService } from './summarization.service';
import { EmailsModule } from '../emails/emails.module';
import { LLMModule } from '../llm/llm.module';

@Module({
  imports: [EmailsModule, LLMModule],
  controllers: [SummarizationController],
  providers: [SummarizationService],
  exports: [SummarizationService],
})
export class SummarizationModule {}

