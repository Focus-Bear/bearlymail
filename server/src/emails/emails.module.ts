import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmailsController } from "./emails.controller";
import { EmailsService } from "./emails.service";
import { EmailThreadService } from "./email-thread.service";
import { ScanEmailService } from "./scan-email.service";
import { EmailSearchService } from "./email-search.service";
import { EmailStarService } from "./email-star.service";
import { EmailDebugService } from "./email-debug.service";
import { EmailReadService } from "./email-read.service";
import { EmailCrudService } from "./email-crud.service";
import { EmailGmailService } from "./email-gmail.service";
import { EmailStatusService } from "./email-status.service";
import { GmailProvider } from "./providers/gmail.provider";
import { Office365Provider } from "./providers/office365.provider";
import { ZohoProvider } from "./providers/zoho.provider";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailSyncProcessor } from "./email-sync.processor";
import { LLMProcessor } from "./llm-processor";
import { ArchiveEmailProcessor } from "./archive-email.processor";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ScanEmail } from "../database/entities/scan-email.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { ActionItem } from "../database/entities/action-item.entity";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { CategoryOverride } from "../database/entities/category-override.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import { PriorityModule } from "../priority/priority.module";
import { SummarizationModule } from "../summarization/summarization.module";
import { UsersModule } from "../users/users.module";
import { QueueModule } from "../queue/queue.module";
import { LLMModule } from "../llm/llm.module";
import { ContextModule } from "../context/context.module";
import { ContactsModule } from "../contacts/contacts.module";
import { BlockedSendersModule } from "../blocked-senders/blocked-senders.module";
import { BlockedKeywordsModule } from "../blocked-keywords/blocked-keywords.module";
import { BatchScheduleModule } from "../batch-schedule/batch-schedule.module";
import { GoogleAccountsModule } from "../google-accounts/google-accounts.module";
import { Office365AccountsModule } from "../office365-accounts/office365-accounts.module";
import { ZohoAccountsModule } from "../zoho-accounts/zoho-accounts.module";
import { GitHubModule } from "../github/github.module";
import { SuggestedRepliesModule } from "../suggested-replies/suggested-replies.module";
import { ProtoCategoriesModule } from "../proto-categories/proto-categories.module";
import { AwsModule } from "../aws/aws.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Email,
      EmailThread,
      ScanEmail,
      UserContext,
      ActionItem,
      BatchSchedule,
      CategoryOverride,
      ProtoCategory,
    ]),
    PriorityModule,
    forwardRef(() => SummarizationModule),
    UsersModule,
    QueueModule,
    LLMModule,
    ContextModule,
    forwardRef(() => ContactsModule),
    BlockedSendersModule,
    BlockedKeywordsModule,
    BatchScheduleModule,
    forwardRef(() => GoogleAccountsModule),
    forwardRef(() => Office365AccountsModule),
    forwardRef(() => ZohoAccountsModule),
    forwardRef(() => GitHubModule),
    forwardRef(() => SuggestedRepliesModule),
    ProtoCategoriesModule,
    AwsModule,
  ],
  controllers: [EmailsController],
  providers: [
    EmailProviderManager,
    // Put EmailProviderManager before EmailsService to avoid circular dependency
    EmailThreadService,
    EmailSearchService,
    EmailStarService,
    EmailDebugService,
    EmailReadService,
    EmailCrudService,
    EmailGmailService,
    EmailStatusService,
    EmailsService,
    ScanEmailService,
    GmailProvider,
    Office365Provider,
    ZohoProvider,
    EmailSyncProcessor,
    LLMProcessor,
    ArchiveEmailProcessor,
  ],
  exports: [
    EmailsService,
    EmailThreadService,
    EmailProviderManager,
    ScanEmailService,
  ],
})
export class EmailsModule {}
