/**
 * LLMPriorityBatchService.applyBatchResults must clear `isProcessingPriority`
 * for every thread whose result it does not write (triage-preserved, fallback,
 * missing, or a failed write). Previously those threads stayed locked until
 * the 15-minute stuck-priority cron, which stalled onboarding's "N of 50"
 * categorisation progress for new users.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { DebugService } from "../debug/debug.service";
import {
  BatchPriorityResult,
  PriorityAnalysisService,
} from "../llm/priority-analysis.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { EmailsService } from "./emails.service";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";
import { LLMPriorityBatchService } from "./llm-priority-batch.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";
import { PriorityAnalysisFinalizerService } from "./priority-analysis-finalizer.service";
import { PrioritySqsDispatchService } from "./priority-sqs-dispatch.service";
import { StaleRuleCategoryService } from "./stale-rule-category.service";

const USER_ID = "user-uuid-1";
const WORKER_ID = "worker-1";
const FINAL_SCORE = 75;
const UNLOCK = { isProcessingPriority: false };

function makeEmail(id: string): Email {
  return {
    id,
    threadId: `provider-thread-${id}`,
    emailThreadId: `eth-${id}`,
    from: "sender@example.com",
    subject: "Test email",
    body: "Body text",
  } as unknown as Email;
}

function makeResult(
  overrides: Partial<BatchPriorityResult> = {},
): BatchPriorityResult {
  return {
    urgencyScore: 50,
    urgencyExplanation: "u",
    sentimentScore: undefined,
    goalAlignmentScore: 40,
    goalAlignmentExplanation: "g",
    category: "Newsletters",
    categoryExplanation: "c",
    reasoning: "r",
    shortlistedCategoryNames: null,
    isFallback: false,
    ...overrides,
  };
}

describe("LLMPriorityBatchService — unlocks threads it does not write", () => {
  let service: LLMPriorityBatchService;
  let threadUpdate: jest.Mock;
  let applyPriorityResult: jest.Mock;

  beforeEach(async () => {
    threadUpdate = jest.fn().mockResolvedValue({ affected: 1 });
    applyPriorityResult = jest.fn().mockResolvedValue(FINAL_SCORE);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMPriorityBatchService,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: { send: jest.fn() } },
        { provide: getRepositoryToken(Email), useValue: {} },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: {
            update: threadUpdate,
          } as unknown as Repository<EmailThread>,
        },
        { provide: EmailsService, useValue: {} },
        { provide: PriorityAnalysisService, useValue: {} },
        { provide: PriorityCacheService, useValue: {} },
        {
          provide: LLMPriorityResultService,
          useValue: { applyPriorityResult },
        },
        { provide: LLMSummaryProcessorService, useValue: {} },
        { provide: ProtoCategoriesService, useValue: {} },
        { provide: DebugService, useValue: {} },
        { provide: PrioritySqsDispatchService, useValue: {} },
        { provide: PriorityAnalysisFinalizerService, useValue: {} },
        { provide: LLMDeterministicPriorityService, useValue: {} },
        {
          provide: PriorityRulesService,
          useValue: { shadowAndMine: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: CategoryRulesService,
          useValue: {
            findMatchingRuleWithTrace: jest
              .fn()
              .mockResolvedValue({ match: null, snapshot: undefined }),
          },
        },
        {
          provide: StaleRuleCategoryService,
          useValue: { release: jest.fn().mockResolvedValue(false) },
        },
      ],
    }).compile();

    service = module.get<LLMPriorityBatchService>(LLMPriorityBatchService);
  });

  it("unlocks all triage-preserved threads in a single query", async () => {
    const preservedA = makeEmail("a");
    const preservedB = makeEmail("b");
    const results = new Map<string, BatchPriorityResult>([
      [preservedA.id, makeResult({ triagePreserved: true })],
      [preservedB.id, makeResult({ triagePreserved: true })],
    ]);

    await service.applyBatchResults(
      WORKER_ID,
      USER_ID,
      [preservedA, preservedB],
      results,
      [],
    );

    expect(applyPriorityResult).not.toHaveBeenCalled();
    expect(threadUpdate).toHaveBeenCalledTimes(1);
    expect(threadUpdate).toHaveBeenCalledWith(
      { id: In([preservedA.emailThreadId, preservedB.emailThreadId]) },
      UNLOCK,
    );
  });

  it("unlocks fallback, missing and failed-write threads but not written ones", async () => {
    const written = makeEmail("written");
    const fallback = makeEmail("fallback");
    const missing = makeEmail("missing");
    const failed = makeEmail("failed");
    applyPriorityResult.mockImplementation((email: Email) =>
      email.id === failed.id
        ? Promise.reject(new Error("db write failed"))
        : Promise.resolve(FINAL_SCORE),
    );
    const results = new Map<string, BatchPriorityResult>([
      [written.id, makeResult()],
      [fallback.id, makeResult({ isFallback: true })],
      [failed.id, makeResult()],
    ]);

    await service.applyBatchResults(
      WORKER_ID,
      USER_ID,
      [written, fallback, missing, failed],
      results,
      [],
    );

    expect(threadUpdate).toHaveBeenCalledTimes(1);
    expect(threadUpdate).toHaveBeenCalledWith(
      {
        id: In([
          fallback.emailThreadId,
          missing.emailThreadId,
          failed.emailThreadId,
        ]),
      },
      UNLOCK,
    );
  });

  it("issues no unlock query when every result is written", async () => {
    const email = makeEmail("ok");
    const results = new Map([[email.id, makeResult()]]);

    await service.applyBatchResults(WORKER_ID, USER_ID, [email], results, []);

    expect(applyPriorityResult).toHaveBeenCalledTimes(1);
    expect(threadUpdate).not.toHaveBeenCalled();
  });
});
