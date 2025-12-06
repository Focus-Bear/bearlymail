import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriorityController } from './priority.controller';
import { PriorityService } from './priority.service';
import { PriorityLearningService } from './priority-learning.service';
import { PriorityLearningProcessor } from './priority-learning.processor';
import { TriageSuggestionsService } from './triage-suggestions.service';
import { UserContext } from '../database/entities/user-context.entity';
import { Email } from '../database/entities/email.entity';
import { LLMModule } from '../llm/llm.module';
import { UsersModule } from '../users/users.module';
import { QueueModule } from '../queue/queue.module';
import { EmailsModule } from '../emails/emails.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserContext, Email]),
    LLMModule,
    QueueModule,
    forwardRef(() => UsersModule),
    forwardRef(() => EmailsModule),
  ],
  controllers: [PriorityController],
  providers: [PriorityService, PriorityLearningService, PriorityLearningProcessor, TriageSuggestionsService],
  exports: [PriorityService, PriorityLearningService, TriageSuggestionsService],
})
export class PriorityModule {}
