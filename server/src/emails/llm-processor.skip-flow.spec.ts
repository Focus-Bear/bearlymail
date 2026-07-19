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
 * Integration test for the deterministic skip wiring: when a rule handles the
 * email, the refine job must NOT call the analyze_priority LLM.
 */
describe("LLMProcessor — deterministic skip flow", () => {
  let processor: LLMProcessor;
  const analyzePriority = jest.fn();
  const tryHandle = jest.fn();
  const tryIncrementalAnalysis = jest.fn();
  const checkAiCapacity = jest.fn();
  const threadUpdate = jest.fn();
  const email = { id: "email-1", emailThreadId: "thread-1" } as Email;
  const thread = { id: "thread-1" } as EmailThread;

  beforeEach(async () => {
    jest.clearAllMocks();
    checkAiCapacity.mockResolvedValue({ allowed: true, percentUsed: 0 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMProcessor,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: { work: jest.fn() } },
        { provide: getRepositoryToken(Email), useValue: {} },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: {
            findOne: jest.fn().mockResolvedValue(thread),
            update: threadUpdate,
          },
        },
        {
          provide: EmailsService,
          useValue: { getEmailById: jest.fn().mockResolvedValue(email) },
        },
        { provide: PriorityService, useValue: {} },
        { provide: PriorityCacheService, useValue: {} },
        { provide: PriorityAnalysisService, useValue: { analyzePriority } },
        {
          provide: CloudWatchService,
          useValue: {
            putMetric: jest.fn().mockResolvedValue(undefined),
            putPerformanceBudgetMetric: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ProtoCategoriesService, useValue: {} },
        { provide: LLMPriorityResultService, useValue: {} },
        { provide: LLMDeterministicPriorityService, useValue: { tryHandle } },
        {
          provide: LLMPriorityBatchService,
          useValue: {
            shouldSkipPriorityRecalculation: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: LLMSummaryProcessorService,
          useValue: { tryIncrementalAnalysis },
        },
        { provide: DebugService, useValue: { log: jest.fn() } },
        { provide: CategoryRulesService, useValue: {} },
        {
          provide: PriorityRulesService,
          useValue: { shadowAndMine: jest.fn() },
        },
        {
          provide: UserEncryptionService,
          useValue: {
            withUserKey: (_userId: string, cb: () => unknown) => cb(),
          },
        },
        { provide: SubscriptionsService, useValue: { checkAiCapacity } },
      ],
    }).compile();
    processor = module.get(LLMProcessor);
  });

  const runJob = () =>
    (
      processor as unknown as {
        handleRefinePriorityJob: (job: unknown) => Promise<void>;
      }
    ).handleRefinePriorityJob({
      id: "job-1",
      data: { userId: "user-1", emailId: "email-1" },
    });

  it("skips the LLM when a rule handles the email", async () => {
    tryHandle.mockResolvedValue(true);
    await runJob();
    expect(tryHandle).toHaveBeenCalledWith("user-1", email, thread, "job-1");
    expect(analyzePriority).not.toHaveBeenCalled();
    // Skip returns before the incremental/full path is reached.
    expect(tryIncrementalAnalysis).not.toHaveBeenCalled();
  });

  it("proceeds past the skip when no rule handles the email", async () => {
    tryHandle.mockResolvedValue(false);
    tryIncrementalAnalysis.mockResolvedValue({ handled: true });
    await runJob();
    expect(tryHandle).toHaveBeenCalled();
    // Falls through to the normal pipeline (incremental analysis runs).
    expect(tryIncrementalAnalysis).toHaveBeenCalled();
  });

  it("skips the whole refinement and clears isProcessingPriority when AI capacity is exhausted", async () => {
    checkAiCapacity.mockResolvedValue({ allowed: false, percentUsed: 120 });
    await runJob();
    expect(checkAiCapacity).toHaveBeenCalledWith("user-1");
    expect(analyzePriority).not.toHaveBeenCalled();
    expect(tryHandle).not.toHaveBeenCalled();
    expect(tryIncrementalAnalysis).not.toHaveBeenCalled();
    // Clears the flag so the UI doesn't show a stuck "Calculating..." state.
    expect(threadUpdate).toHaveBeenCalledWith(
      { id: "thread-1" },
      { isProcessingPriority: false },
    );
  });
});
