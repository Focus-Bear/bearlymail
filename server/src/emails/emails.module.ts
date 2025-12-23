import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmailsController } from "./emails.controller";
import { EmailsService } from "./emails.service";
import { ScanEmailService } from "./scan-email.service";
import { GmailProvider } from "./providers/gmail.provider";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailSyncProcessor } from "./email-sync.processor";
import { LLMProcessor } from "./llm-processor";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ScanEmail } from "../database/entities/scan-email.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { PriorityModule } from "../priority/priority.module";
import { SummarizationModule } from "../summarization/summarization.module";
import { UsersModule } from "../users/users.module";
import { QueueModule } from "../queue/queue.module";
import { LLMModule } from "../llm/llm.module";
import { ContextModule } from "../context/context.module";
import { ContactsModule } from "../contacts/contacts.module";
import { BlockedSendersModule } from "../blocked-senders/blocked-senders.module";
import { BatchScheduleModule } from "../batch-schedule/batch-schedule.module";
import { GoogleAccountsModule } from "../google-accounts/google-accounts.module";
import { GitHubModule } from "../github/github.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Email, EmailThread, ScanEmail, UserContext]),
    PriorityModule,
    forwardRef(() => SummarizationModule),
    UsersModule,
    QueueModule,
    LLMModule,
    ContextModule,
    forwardRef(() => ContactsModule),
    BlockedSendersModule,
    BatchScheduleModule,
    forwardRef(() => GoogleAccountsModule),
    forwardRef(() => GitHubModule),
  ],
  controllers: [EmailsController],
  providers: [
    EmailProviderManager, // Put EmailProviderManager before EmailsService to avoid circular dependency
    EmailsService,
    ScanEmailService,
    GmailProvider,
    EmailSyncProcessor,
    LLMProcessor,
  ],
  exports: [EmailsService, EmailProviderManager, ScanEmailService],
})
export class EmailsModule {}
