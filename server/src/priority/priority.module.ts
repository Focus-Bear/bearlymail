import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PriorityController } from "./priority.controller";
import { PriorityService } from "./priority.service";
import { PriorityLearningService } from "./priority-learning.service";
import { PriorityLearningProcessor } from "./priority-learning.processor";
import { TriageSuggestionsService } from "./triage-suggestions.service";
import { PriorityCacheService } from "./priority-cache.service";
import { UserContext } from "../database/entities/user-context.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { PriorityOverride } from "../database/entities/priority-override.entity";
import { LLMModule } from "../llm/llm.module";
import { UsersModule } from "../users/users.module";
import { QueueModule } from "../queue/queue.module";
import { EmailsModule } from "../emails/emails.module";
import { AwsModule } from "../aws/aws.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserContext,
      Email,
      EmailThread,
      PriorityOverride,
    ]),
    LLMModule,
    QueueModule,
    forwardRef(() => UsersModule),
    forwardRef(() => EmailsModule),
    AwsModule,
  ],
  controllers: [PriorityController],
  providers: [
    PriorityService,
    PriorityLearningService,
    PriorityLearningProcessor,
    TriageSuggestionsService,
    PriorityCacheService,
  ],
  exports: [
    PriorityService,
    PriorityLearningService,
    TriageSuggestionsService,
    PriorityCacheService,
  ],
})
export class PriorityModule {}
