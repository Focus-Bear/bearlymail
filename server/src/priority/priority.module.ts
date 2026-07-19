import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AwsModule } from "../aws/aws.module";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { PriorityOverride } from "../database/entities/priority-override.entity";
import { User } from "../database/entities/user.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { QueueModule } from "../queue/queue.module";
import { UsersModule } from "../users/users.module";
import { PriorityController } from "./priority.controller";
import { PriorityService } from "./priority.service";
import { PriorityCacheService } from "./priority-cache.service";
import { PriorityLearningProcessor } from "./priority-learning.processor";
import { PriorityLearningService } from "./priority-learning.service";
import { TriageSuggestionsService } from "./triage-suggestions.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserContext,
      Email,
      EmailThread,
      PriorityOverride,
      User,
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
