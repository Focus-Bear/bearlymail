import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AwsModule } from "../aws/aws.module";
import { BatchScheduleModule } from "../batch-schedule/batch-schedule.module";
import { BlockedKeywordsModule } from "../blocked-keywords/blocked-keywords.module";
import { BlockedSendersModule } from "../blocked-senders/blocked-senders.module";
import { ContactsModule } from "../contacts/contacts.module";
import { ContextModule } from "../context/context.module";
import { CrmModule } from "../crm/crm.module";
import { ActionItem } from "../database/entities/action-item.entity";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { CategoryOverride } from "../database/entities/category-override.entity";
import { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import { ScanEmail } from "../database/entities/scan-email.entity";
import { SyncHistoryLog } from "../database/entities/sync-history-log.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { GitHubModule } from "../github/github.module";
import { GoogleAccountsModule } from "../google-accounts/google-accounts.module";
import { LLMModule } from "../llm/llm.module";
import { Office365AccountsModule } from "../office365-accounts/office365-accounts.module";
import { PriorityModule } from "../priority/priority.module";
import { ProtoCategoriesModule } from "../proto-categories/proto-categories.module";
import { QueueModule } from "../queue/queue.module";
import { ScheduledEmailsModule } from "../scheduled-emails/scheduled-emails.module";
import { SuggestedRepliesModule } from "../suggested-replies/suggested-replies.module";
import { SummarizationModule } from "../summarization/summarization.module";
import { UsersModule } from "../users/users.module";
import { ZohoAccountsModule } from "../zoho-accounts/zoho-accounts.module";
import { ArchiveEmailProcessor } from "./archive-email.processor";
import { EmailAdminService } from "./email-admin.service";
import { EmailCrudService } from "./email-crud.service";
import { EmailDebugService } from "./email-debug.service";
import { EmailDebugCategoryService } from "./email-debug-category.service";
import { EmailGmailService } from "./email-gmail.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailReadService } from "./email-read.service";
import { EmailSearchService } from "./email-search.service";
import { EmailSearchRankingService } from "./email-search-ranking.service";
import { EmailStarService } from "./email-star.service";
import { EmailStatusService } from "./email-status.service";
import { EmailSyncProcessor } from "./email-sync.processor";
import { EmailThreadService } from "./email-thread.service";
import { EmailsController } from "./emails.controller";
import { EmailsService } from "./emails.service";
import { LLMProcessor } from "./llm-processor";
import { GmailProvider } from "./providers/gmail.provider";
import { Office365Provider } from "./providers/office365.provider";
import { ZohoProvider } from "./providers/zoho.provider";
import { ScanEmailService } from "./scan-email.service";
import { SyncHistoryService } from "./sync-history.service";

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
      SyncHistoryLog,
      Contact,
    ]),
    PriorityModule,
    forwardRef(() => SummarizationModule),
    UsersModule,
    QueueModule,
    LLMModule,
    ContextModule,
    forwardRef(() => ContactsModule),
    CrmModule,
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
    forwardRef(() => ScheduledEmailsModule),
  ],
  controllers: [EmailsController],
  providers: [
    SyncHistoryService,
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
    EmailAdminService,
    EmailDebugCategoryService,
    EmailSearchRankingService,
  ],
  exports: [
    EmailsService,
    EmailThreadService,
    EmailProviderManager,
    ScanEmailService,
  ],
})
export class EmailsModule {}
