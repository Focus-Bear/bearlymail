/**
 * Builds the object graph behind PriorityBatchAnalysisRunner by hand, for the
 * prioritisation Lambda. No NestFactory, no DI container, no module scan or
 * lifecycle hooks: the same service classes the worker uses, wired directly,
 * so the Lambda runs exactly the worker's code. Every constructor call is
 * type-checked, so a service gaining a dependency fails the build here rather
 * than at runtime.
 */
import type { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PgBoss } from "pg-boss";
import type {
  DataSource,
  EntityTarget,
  ObjectLiteral,
  Repository,
} from "typeorm";

import { CloudWatchService } from "../../aws/cloudwatch.service";
import { CategoryKeyAssignmentService } from "../../category-keys/category-key-assignment.service";
import { CategoryRulesService } from "../../category-rules/category-rules.service";
import { ContactTypeClassifierService } from "../../crm/contact-type-classifier.service";
import { CategoryRule } from "../../database/entities/category-rule.entity";
import { Contact } from "../../database/entities/contact.entity";
import { DebugConfig } from "../../database/entities/debug-config.entity";
import { DebugData } from "../../database/entities/debug-data.entity";
import { DeletedAccount } from "../../database/entities/deleted-account.entity";
import { Email } from "../../database/entities/email.entity";
import { EmailThread } from "../../database/entities/email-thread.entity";
import { LocalModelSupervision } from "../../database/entities/local-model-supervision.entity";
import { PriorityRule } from "../../database/entities/priority-rule.entity";
import { PromptExampleEntity } from "../../database/entities/prompt-example.entity";
import { ProtoCategory } from "../../database/entities/proto-category.entity";
import { SchedulingPreference } from "../../database/entities/scheduling-preference.entity";
import { SummarizationRule } from "../../database/entities/summarization-rule.entity";
import { TokenUsage } from "../../database/entities/token-usage.entity";
import { User } from "../../database/entities/user.entity";
import { UserContext } from "../../database/entities/user-context.entity";
import { DebugService } from "../../debug/debug.service";
import { BackgroundSummaryQueueService } from "../../emails/background-summary-queue.service";
import { EmailCrudService } from "../../emails/email-crud.service";
import type { EmailLookup } from "../../emails/email-lookup.types";
import { EmailThreadService } from "../../emails/email-thread.service";
import { IncrementalSummaryHelperService } from "../../emails/incremental-summary-helper.service";
import { LLMPriorityResultService } from "../../emails/llm-priority-result.service";
import { LLMSummaryProcessorService } from "../../emails/llm-summary-processor.service";
import {
  type ApplySerialiser,
  PriorityBatchAnalysisRunner,
} from "../../emails/priority-batch-analysis-runner";
import { KmsEncryptionService } from "../../encryption/kms-encryption.service";
import { UserEncryptionService } from "../../encryption/user-encryption.service";
import { ErrorTrackingService } from "../../error-tracking/error-tracking.service";
import { CategoryRuleSanityService } from "../../llm/category-rule-sanity.service";
import { CategoryShortlistService } from "../../llm/category-shortlist.service";
import { EmbeddingService } from "../../llm/embedding.service";
import { IncrementalAnalysisService } from "../../llm/incremental-analysis.service";
import { LLMService } from "../../llm/llm.service";
import { LLMActionsService } from "../../llm/llm-actions.service";
import { LLMAskService } from "../../llm/llm-ask.service";
import { LLMCategoriesService } from "../../llm/llm-categories.service";
import { LLMCoreService } from "../../llm/llm-core.service";
import { LLMMiscService } from "../../llm/llm-misc.service";
import { LLMReplyService } from "../../llm/llm-reply.service";
import { LLMSearchService } from "../../llm/llm-search.service";
import { LLMSummarizationService } from "../../llm/llm-summarization.service";
import { LLMToneService } from "../../llm/llm-tone.service";
import { PriorityAnalysisService } from "../../llm/priority-analysis.service";
import { TokenUsageService } from "../../llm/token-usage.service";
import { LocalModelInferenceService } from "../../local-model/local-model-inference.service";
import { LocalModelSupervisionService } from "../../local-model/local-model-supervision.service";
import { PriorityCacheService } from "../../priority/priority-cache.service";
import { PriorityRulesService } from "../../priority-rules/priority-rules.service";
import { ProtoCategoriesService } from "../../proto-categories/proto-categories.service";
import { SchedulingPreferencesService } from "../../scheduling-preferences/scheduling-preferences.service";
import { SummarizationService } from "../../summarization/summarization.service";
import { UsersService } from "../../users/users.service";

export interface PriorityBatchRunnerComposition {
  runner: PriorityBatchAnalysisRunner;
  userEncryptionService: UserEncryptionService;
  tokenUsageService: TokenUsageService;
  cloudWatchService: CloudWatchService;
}

type RepositoryFor = <T extends ObjectLiteral>(
  entity: EntityTarget<T>,
) => Repository<T>;

interface CompositionContext {
  dataSource: DataSource;
  repo: RepositoryFor;
  config: ConfigService;
  boss: PgBoss;
}

function buildLlmLayer({ repo, config }: CompositionContext) {
  const usersService = new UsersService(repo(User), repo(DeletedAccount));
  const debugService = new DebugService(repo(DebugData), repo(DebugConfig));
  const tokenUsageService = new TokenUsageService(
    repo(TokenUsage),
    repo(PromptExampleEntity),
    repo(User),
    debugService,
  );
  const llmCoreService = new LLMCoreService(
    config,
    usersService,
    tokenUsageService,
  );
  const llmCategoriesService = new LLMCategoriesService(llmCoreService);
  const llmService = new LLMService(
    llmCoreService,
    new LLMActionsService(llmCoreService),
    new LLMAskService(llmCoreService),
    llmCategoriesService,
    new LLMMiscService(llmCoreService),
    new LLMReplyService(llmCoreService),
    new LLMSearchService(llmCoreService),
    new LLMSummarizationService(llmCoreService),
    new LLMToneService(llmCoreService),
  );
  return {
    usersService,
    debugService,
    tokenUsageService,
    llmCoreService,
    llmCategoriesService,
    llmService,
    errorTrackingService: new ErrorTrackingService(),
    categoryShortlistService: new CategoryShortlistService(
      new EmbeddingService(config, tokenUsageService),
    ),
    cloudWatchService: new CloudWatchService(config),
    userEncryptionService: new UserEncryptionService(
      repo(User),
      new KmsEncryptionService(),
    ),
  };
}

type LlmLayer = ReturnType<typeof buildLlmLayer>;

function buildCategoryLayer(context: CompositionContext, llm: LlmLayer) {
  const { dataSource, repo, config } = context;
  return {
    protoCategoriesService: new ProtoCategoriesService(
      repo(ProtoCategory),
      repo(EmailThread),
      repo(UserContext),
      dataSource,
      new CategoryKeyAssignmentService(repo(UserContext)),
      llm.llmCoreService,
      config,
    ),
    categoryRulesService: new CategoryRulesService(
      repo(CategoryRule),
      repo(Email),
      repo(EmailThread),
      repo(UserContext),
      llm.llmCategoriesService,
      llm.tokenUsageService,
      new CategoryRuleSanityService(llm.llmCoreService, config),
    ),
  };
}

type CategoryLayer = ReturnType<typeof buildCategoryLayer>;

/** The summary pipeline's only email reads; avoids building EmailsService. */
function buildEmailLookup({ repo }: CompositionContext): EmailLookup {
  const emailCrudService = new EmailCrudService(repo(Email));
  const emailThreadService = new EmailThreadService(
    repo(EmailThread),
    repo(Email),
  );
  return {
    getEmailById: (userId, emailId) =>
      emailCrudService.getEmailById(userId, emailId),
    getThreadEmails: (userId, threadId, lookupOptions) =>
      emailThreadService.getThreadEmails(userId, threadId, lookupOptions),
  };
}

function buildSummaryProcessor(
  context: CompositionContext,
  llm: LlmLayer,
  categories: CategoryLayer,
  priorityCacheService: PriorityCacheService,
): LLMSummaryProcessorService {
  const { repo } = context;
  const emailLookup = buildEmailLookup(context);
  const incrementalAnalysisService = new IncrementalAnalysisService(
    llm.llmCoreService,
  );
  const summarizationService = new SummarizationService(
    emailLookup,
    llm.llmService,
    repo(SummarizationRule),
    repo(Email),
    repo(EmailThread),
    llm.errorTrackingService,
    llm.usersService,
    new SchedulingPreferencesService(repo(SchedulingPreference)),
  );
  return new LLMSummaryProcessorService(
    repo(Email),
    repo(EmailThread),
    repo(Contact),
    emailLookup,
    summarizationService,
    incrementalAnalysisService,
    priorityCacheService,
    new ContactTypeClassifierService(repo(Contact), llm.llmService),
    llm.cloudWatchService,
    llm.userEncryptionService,
    new IncrementalSummaryHelperService(
      repo(Email),
      repo(EmailThread),
      repo(Contact),
      emailLookup,
      incrementalAnalysisService,
    ),
    categories.categoryRulesService,
    llm.llmCoreService,
    llm.categoryShortlistService,
    categories.protoCategoriesService,
  );
}

export function composePriorityBatchRunner(options: {
  dataSource: DataSource;
  boss: PgBoss;
  logger: Logger;
  serialiseApply: ApplySerialiser;
}): PriorityBatchRunnerComposition {
  const { dataSource, boss, logger, serialiseApply } = options;
  const config = new ConfigService();
  const repo: RepositoryFor = (entity) => dataSource.getRepository(entity);
  const context: CompositionContext = { dataSource, repo, config, boss };

  const llm = buildLlmLayer(context);
  const categories = buildCategoryLayer(context, llm);
  const priorityCacheService = new PriorityCacheService(
    repo(UserContext),
    repo(Email),
    repo(User),
  );

  const runner = new PriorityBatchAnalysisRunner({
    boss,
    emailRepository: repo(Email),
    emailThreadRepository: repo(EmailThread),
    protoCategoriesService: categories.protoCategoriesService,
    priorityAnalysisService: new PriorityAnalysisService(
      llm.llmCoreService,
      llm.errorTrackingService,
      llm.categoryShortlistService,
      config,
    ),
    priorityCacheService,
    priorityResultService: new LLMPriorityResultService(
      repo(Email),
      repo(EmailThread),
      categories.protoCategoriesService,
      llm.usersService,
      new BackgroundSummaryQueueService(
        boss,
        repo(Email),
        llm.userEncryptionService,
      ),
    ),
    summaryProcessorService: buildSummaryProcessor(
      context,
      llm,
      categories,
      priorityCacheService,
    ),
    debugService: llm.debugService,
    priorityRulesService: new PriorityRulesService(
      repo(PriorityRule),
      repo(Email),
      llm.cloudWatchService,
    ),
    categoryRulesService: categories.categoryRulesService,
    localModelInferenceService: new LocalModelInferenceService(
      config,
      repo(EmailThread),
      new LocalModelSupervisionService(repo(LocalModelSupervision), config),
    ),
    logger,
    serialiseApply,
  });
  return {
    runner,
    userEncryptionService: llm.userEncryptionService,
    tokenUsageService: llm.tokenUsageService,
    cloudWatchService: llm.cloudWatchService,
  };
}
