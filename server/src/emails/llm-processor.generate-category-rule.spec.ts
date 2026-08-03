import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { CategoryRulesService } from "../category-rules/category-rules.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { DebugService } from "../debug/debug.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { PriorityAnalysisService } from "../llm/priority-analysis.service";
import { PriorityService } from "../priority/priority.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { EmailsService } from "./emails.service";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";
import { LLMPriorityBatchService } from "./llm-priority-batch.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMProcessor } from "./llm-processor";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";

/**
 * Unit tests for the `generate-category-rule` job handler enqueued by the batch
 * priority path. It must load the email under the user's key, author a rule via
 * generateCompositeRuleFromEmail, and swallow (log) any error so the worker
 * never crashes.
 */
describe("LLMProcessor — handleGenerateCategoryRuleJob", () => {
  let processor: LLMProcessor;
  const getEmailById = jest.fn();
  const generateCompositeRuleFromEmail = jest.fn();
  const email = {
    id: "email-1",
    emailThreadId: "thread-1",
    from: "sender@example.com",
    subject: "Hi",
    body: "Body",
    htmlBody: null,
  } as unknown as Email;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMProcessor,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: { work: jest.fn() } },
        { provide: getRepositoryToken(Email), useValue: {} },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: { findOne: jest.fn(), update: jest.fn() },
        },
        { provide: EmailsService, useValue: { getEmailById } },
        { provide: PriorityService, useValue: {} },
        { provide: PriorityCacheService, useValue: {} },
        { provide: PriorityAnalysisService, useValue: {} },
        {
          provide: CloudWatchService,
          useValue: {
            putMetric: jest.fn().mockResolvedValue(undefined),
            putPerformanceBudgetMetric: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ProtoCategoriesService, useValue: {} },
        { provide: LLMPriorityResultService, useValue: {} },
        { provide: LLMDeterministicPriorityService, useValue: {} },
        { provide: LLMPriorityBatchService, useValue: {} },
        { provide: LLMSummaryProcessorService, useValue: {} },
        { provide: DebugService, useValue: { log: jest.fn() } },
        {
          provide: CategoryRulesService,
          useValue: { generateCompositeRuleFromEmail },
        },
        { provide: PriorityRulesService, useValue: {} },
        {
          provide: UserEncryptionService,
          useValue: {
            withUserKey: (_userId: string, cb: () => unknown) => cb(),
          },
        },
        { provide: SubscriptionsService, useValue: {} },
      ],
    }).compile();
    processor = module.get(LLMProcessor);
  });

  const runJob = (data: {
    userId: string;
    emailId: string;
    categoryName: string;
  }) =>
    (
      processor as unknown as {
        handleGenerateCategoryRuleJob: (job: unknown) => Promise<void>;
      }
    ).handleGenerateCategoryRuleJob({ id: "job-1", data });

  it("loads the email and authors a composite rule for the given category", async () => {
    getEmailById.mockResolvedValue(email);
    generateCompositeRuleFromEmail.mockResolvedValue({ id: "rule-1" });

    await runJob({
      userId: "user-1",
      emailId: "email-1",
      categoryName: "Sales",
    });

    expect(getEmailById).toHaveBeenCalledWith("user-1", "email-1");
    expect(generateCompositeRuleFromEmail).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ from: "sender@example.com", subject: "Hi" }),
      "Sales",
    );
  });

  it("skips rule authoring when the email is missing", async () => {
    getEmailById.mockResolvedValue(null);

    await runJob({
      userId: "user-1",
      emailId: "missing",
      categoryName: "Sales",
    });

    expect(generateCompositeRuleFromEmail).not.toHaveBeenCalled();
  });

  it("swallows errors from rule generation so the worker never crashes", async () => {
    getEmailById.mockResolvedValue(email);
    generateCompositeRuleFromEmail.mockRejectedValue(new Error("boom"));

    await expect(
      runJob({ userId: "user-1", emailId: "email-1", categoryName: "Sales" }),
    ).resolves.toBeUndefined();
  });
});
