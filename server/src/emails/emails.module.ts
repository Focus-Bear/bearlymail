import { forwardRef, Module } from "@nestjs/common";
import { getRepositoryToken, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AppleMailAccountsModule } from "../apple-mail-accounts/apple-mail-accounts.module";
import { AwsModule } from "../aws/aws.module";
import { BatchScheduleModule } from "../batch-schedule/batch-schedule.module";
import { BlockedKeywordsModule } from "../blocked-keywords/blocked-keywords.module";
import { BlockedSendersModule } from "../blocked-senders/blocked-senders.module";
import { CategoryKeysModule } from "../category-keys/category-keys.module";
import { CategoryRulesModule } from "../category-rules/category-rules.module";
import { ContactsModule } from "../contacts/contacts.module";
import { ContextModule } from "../context/context.module";
import { CrmModule } from "../crm/crm.module";
import { ActionItem } from "../database/entities/action-item.entity";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { CategoryOverride } from "../database/entities/category-override.entity";
import { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { EmailExport } from "../database/entities/email-export.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { FollowUp } from "../database/entities/follow-up.entity";
import { Organization } from "../database/entities/organization.entity";
import { OrganizationMember } from "../database/entities/organization-member.entity";
import { PriorityAnalysisRun } from "../database/entities/priority-analysis-run.entity";
import { ProtoCategory } from "../database/entities/proto-category.entity";
import { ScanEmail } from "../database/entities/scan-email.entity";
import { SyncHistoryLog } from "../database/entities/sync-history-log.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { DebugModule } from "../debug/debug.module";
import { GitHubModule } from "../github/github.module";
import { GoogleAccountsModule } from "../google-accounts/google-accounts.module";
import { LLMModule } from "../llm/llm.module";
import { LocalModelModule } from "../local-model/local-model.module";
import { LocalModelTrainingDataProcessor } from "../local-model/local-model-training-data.processor";
import { LocalModelTrainingDataService } from "../local-model/local-model-training-data.service";
import { Office365AccountsModule } from "../office365-accounts/office365-accounts.module";
import { PriorityModule } from "../priority/priority.module";
import { PriorityRulesModule } from "../priority-rules/priority-rules.module";
import { ProtoCategoriesModule } from "../proto-categories/proto-categories.module";
import { QueueModule } from "../queue/queue.module";
import { ScheduledEmailsModule } from "../scheduled-emails/scheduled-emails.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { SuggestedRepliesModule } from "../suggested-replies/suggested-replies.module";
import { SummarizationModule } from "../summarization/summarization.module";
import { UsersModule } from "../users/users.module";
import { ZohoAccountsModule } from "../zoho-accounts/zoho-accounts.module";
import { ArchiveEmailProcessor } from "./archive-email.processor";
import { BackgroundSummaryQueueService } from "./background-summary-queue.service";
import { CategoryDedupService } from "./category-dedup.service";
import { EmailAdminService } from "./email-admin.service";
import { EmailArchiveService } from "./email-archive.service";
import { EmailAssignmentController } from "./email-assignment.controller";
import { EmailAssignmentService } from "./email-assignment.service";
import { EmailBacklogController } from "./email-backlog.controller";
import { EmailBacklogService } from "./email-backlog.service";
import { EmailCrudService } from "./email-crud.service";
import { EmailDebugController } from "./email-debug.controller";
import { EmailDebugService } from "./email-debug.service";
import { EmailDebugAdminController } from "./email-debug-admin.controller";
import { EmailDebugCategoryService } from "./email-debug-category.service";
import { EmailDebugPhishingService } from "./email-debug-phishing.service";
import { EmailDebugRawColumnsService } from "./email-debug-raw-columns.service";
import { EmailExportProcessor } from "./email-export.processor";
import { EmailExportService } from "./email-export.service";
import { EmailExportJobService } from "./email-export-job.service";
import { EmailExportStorageService } from "./email-export-storage.service";
import { EmailFollowUpService } from "./email-follow-up.service";
import { EmailGmailService } from "./email-gmail.service";
import { EmailInboxService } from "./email-inbox.service";
import { EmailInboxCategoryService } from "./email-inbox-category.service";
import { EmailInboxDecryptService } from "./email-inbox-decrypt.service";
import { EmailInboxTraceService } from "./email-inbox-trace.service";
import { EmailLifecycleService } from "./email-lifecycle.service";
import { EmailMigrationService } from "./email-migration.service";
import { EmailPriorityExplanationService } from "./email-priority-explanation.service";
import { EmailProviderManager } from "./email-provider-manager.service";
import { EmailReadService } from "./email-read.service";
import { EmailSearchService } from "./email-search.service";
import { EmailSearchOpsController } from "./email-search-ops.controller";
import { EmailSearchRankingService } from "./email-search-ranking.service";
import { EmailSendController } from "./email-send.controller";
import {
  EMAIL_DEPS_REPOS,
  EMAIL_DEPS_REPOS_A,
  EMAIL_DEPS_REPOS_B,
  EMAIL_DEPS_SERVICES,
  EMAIL_DEPS_SERVICES_A,
  EMAIL_DEPS_SERVICES_B,
  EmailServiceDeps,
} from "./email-service-dependencies.provider";
import { EmailStarService } from "./email-star.service";
import { EmailStatusService } from "./email-status.service";
import { EmailSyncProcessor } from "./email-sync.processor";
import { EmailThreadService } from "./email-thread.service";
import { EmailsController } from "./emails.controller";
import { EmailsService } from "./emails.service";
import { IncrementalSummaryHelperService } from "./incremental-summary-helper.service";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";
import { LLMPriorityBatchService } from "./llm-priority-batch.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMProcessor } from "./llm-processor";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";
import { LocalModelPromotionService } from "./local-model-promotion.service";
import { PriorityAnalysisFinalizerService } from "./priority-analysis-finalizer.service";
import { PriorityBatchSchedulerService } from "./priority-batch-scheduler.service";
import { PriorityRuleMiningCron } from "./priority-rule-mining.cron";
import { PrioritySqsDispatchService } from "./priority-sqs-dispatch.service";
import { AppleMailProvider } from "./providers/apple-mail.provider";
import { GmailProvider } from "./providers/gmail.provider";
import { GmailSyncService } from "./providers/gmail-sync.service";
import { Office365Provider } from "./providers/office365.provider";
import { ZohoProvider } from "./providers/zoho.provider";
import { ScanEmailService } from "./scan-email.service";
import { SearchEnrichmentService } from "./search-enrichment.service";
import { StuckPriorityDetectionService } from "./stuck-priority-detection.service";
import { SyncHistoryService } from "./sync-history.service";

@Module({
  imports: [
    CategoryKeysModule,
    LocalModelModule,
    TypeOrmModule.forFeature([
      Email,
      EmailExport,
      EmailThread,
      Organization,
      OrganizationMember,
      ScanEmail,
      UserContext,
      ActionItem,
      BatchSchedule,
      CategoryOverride,
      ProtoCategory,
      SyncHistoryLog,
      Contact,
      PriorityAnalysisRun,
      FollowUp,
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
    forwardRef(() => AppleMailAccountsModule),
    forwardRef(() => GitHubModule),
    forwardRef(() => SuggestedRepliesModule),
    ProtoCategoriesModule,
    AwsModule,
    forwardRef(() => ScheduledEmailsModule),
    forwardRef(() => SubscriptionsModule),
    DebugModule,
    CategoryRulesModule,
    PriorityRulesModule,
  ],
  // EmailsController must be LAST: it defines @Get(":id"), which otherwise steals
  // paths like recategorize-progress, backlog-progress, etc. from sibling controllers.
  controllers: [
    EmailDebugAdminController,
    EmailSearchOpsController,
    EmailBacklogController,
    EmailDebugController,
    EmailSendController,
    EmailAssignmentController,
    EmailsController,
  ],
  providers: [
    SyncHistoryService,
    CategoryDedupService,
    EmailBacklogService,
    EmailAssignmentService,
    EmailProviderManager,
    EmailThreadService,
    EmailSearchService,
    EmailStarService,
    EmailDebugService,
    EmailReadService,
    EmailCrudService,
    EmailGmailService,
    EmailStatusService,
    EmailFollowUpService,
    EmailInboxCategoryService,
    EmailInboxDecryptService,
    EmailInboxService,
    EmailInboxTraceService,
    EmailPriorityExplanationService,
    PriorityBatchSchedulerService,
    EmailLifecycleService,
    EmailArchiveService,
    EmailMigrationService,
    // Group 1a: repositories + provider manager (3 items)
    {
      provide: EMAIL_DEPS_REPOS_A,
      useFactory: (
        emailRepository: Repository<Email>,
        emailThreadRepository: Repository<EmailThread>,
        emailProviderManager: EmailProviderManager,
      ) => ({ emailRepository, emailThreadRepository, emailProviderManager }),
      inject: [
        getRepositoryToken(Email),
        getRepositoryToken(EmailThread),
        EmailProviderManager,
      ],
    },
    // Group 1b: thread/search/star/debug/read services (5 items)
    {
      provide: EMAIL_DEPS_REPOS_B,
      useFactory: (
        emailThreadService: EmailThreadService,
        emailSearchService: EmailSearchService,
        emailStarService: EmailStarService,
        emailDebugService: EmailDebugService,
        emailReadService: EmailReadService,
      ) => ({
        emailThreadService,
        emailSearchService,
        emailStarService,
        emailDebugService,
        emailReadService,
      }),
      inject: [
        EmailThreadService,
        EmailSearchService,
        EmailStarService,
        EmailDebugService,
        EmailReadService,
      ],
    },
    // Group 1: merge sub-groups A + B
    {
      provide: EMAIL_DEPS_REPOS,
      useFactory: (
        groupA: ReturnType<typeof Object.assign>,
        groupB: ReturnType<typeof Object.assign>,
      ) => ({ ...groupA, ...groupB }),
      inject: [EMAIL_DEPS_REPOS_A, EMAIL_DEPS_REPOS_B],
    },
    // Group 2a: crud/gmail/status/inbox/priority services (5 items)
    {
      provide: EMAIL_DEPS_SERVICES_A,
      useFactory: (
        emailCrudService: EmailCrudService,
        emailGmailService: EmailGmailService,
        emailStatusService: EmailStatusService,
        emailInboxService: EmailInboxService,
        emailPriorityExplanationService: EmailPriorityExplanationService,
      ) => ({
        emailCrudService,
        emailGmailService,
        emailStatusService,
        emailInboxService,
        emailPriorityExplanationService,
      }),
      inject: [
        EmailCrudService,
        EmailGmailService,
        EmailStatusService,
        EmailInboxService,
        EmailPriorityExplanationService,
      ],
    },
    // Group 2b: lifecycle/archive services (2 items)
    {
      provide: EMAIL_DEPS_SERVICES_B,
      useFactory: (
        emailLifecycleService: EmailLifecycleService,
        emailArchiveService: EmailArchiveService,
      ) => ({ emailLifecycleService, emailArchiveService }),
      inject: [EmailLifecycleService, EmailArchiveService],
    },
    // Group 2: merge sub-groups 2a + 2b
    {
      provide: EMAIL_DEPS_SERVICES,
      useFactory: (
        groupA: ReturnType<typeof Object.assign>,
        groupB: ReturnType<typeof Object.assign>,
      ) => ({ ...groupA, ...groupB }),
      inject: [EMAIL_DEPS_SERVICES_A, EMAIL_DEPS_SERVICES_B],
    },
    EmailServiceDeps,
    EmailsService,
    ScanEmailService,
    GmailProvider,
    GmailSyncService,
    Office365Provider,
    ZohoProvider,
    AppleMailProvider,
    EmailSyncProcessor,
    LLMProcessor,
    BackgroundSummaryQueueService,
    LLMPriorityResultService,
    LLMDeterministicPriorityService,
    LocalModelPromotionService,
    PriorityRuleMiningCron,
    LLMPriorityBatchService,
    IncrementalSummaryHelperService,
    LLMSummaryProcessorService,
    ArchiveEmailProcessor,
    EmailAdminService,
    EmailExportService,
    EmailExportStorageService,
    EmailExportJobService,
    EmailExportProcessor,
    LocalModelTrainingDataService,
    LocalModelTrainingDataProcessor,
    EmailDebugCategoryService,
    EmailDebugRawColumnsService,
    EmailDebugPhishingService,
    EmailSearchRankingService,
    SearchEnrichmentService,
    StuckPriorityDetectionService,
    PrioritySqsDispatchService,
    PriorityAnalysisFinalizerService,
  ],
  exports: [
    EmailsService,
    EmailThreadService,
    EmailProviderManager,
    ScanEmailService,
    EmailBacklogService,
    EmailArchiveService,
  ],
})
export class EmailsModule {}
