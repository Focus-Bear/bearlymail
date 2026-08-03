/**
 * Unit tests for the batch priority path's category-rule enqueue behaviour
 * (LLMPriorityBatchService.applyBatchResults).
 *
 * The batch path handles most synced emails. Previously it applied existing
 * category rules but never generated new ones, so rule creation was never even
 * attempted for the dominant path. These tests pin the new behaviour: after a
 * genuinely-analysed email is scored, if no deterministic rule matched and the
 * LLM was HIGH-confident about its category, a low-priority
 * `generate-category-rule` job is enqueued with the right payload — and NOT
 * enqueued when a rule already matched or confidence is below HIGH.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import type { CategoryRuleMatch } from "../category-rules/category-rules.types";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
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
import { JobPriority } from "../queue/job-priorities";
import { EmailsService } from "./emails.service";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";
import { LLMPriorityBatchService } from "./llm-priority-batch.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";
import { PriorityAnalysisFinalizerService } from "./priority-analysis-finalizer.service";
import { PrioritySqsDispatchService } from "./priority-sqs-dispatch.service";

const USER_ID = "user-uuid-1";
const WORKER_ID = "worker-1";

function makeEmail(id: string): Email {
  return {
    id,
    threadId: `provider-thread-${id}`,
    emailThreadId: `eth-${id}`,
    from: "sender@example.com",
    fromName: "Sender",
    subject: "Test email",
    body: "Body text",
    summary: null,
    htmlBody: null,
    sentimentScore: null,
    senderJobTitle: null,
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

describe("LLMPriorityBatchService — category-rule enqueue (batch path)", () => {
  let service: LLMPriorityBatchService;
  let mockBoss: jest.Mocked<PgBoss>;
  let mockCategoryRules: { findMatchingRuleWithTrace: jest.Mock };
  let ruleMatch: CategoryRuleMatch | null;

  const RULE_TRACE_SNAPSHOT = {
    evaluatedAt: "2026-06-15T00:00:00.000Z",
    ruleStepRan: true,
    rulesConsideredCount: 0,
    winningRuleId: null,
    winningRuleCategoryName: null,
    matchedButNotWinningRuleIds: [],
  };

  beforeEach(async () => {
    ruleMatch = null;

    mockBoss = {
      send: jest.fn().mockResolvedValue("job-id"),
    } as unknown as jest.Mocked<PgBoss>;

    mockCategoryRules = {
      findMatchingRuleWithTrace: jest.fn().mockImplementation(() =>
        Promise.resolve({
          match: ruleMatch,
          snapshot: RULE_TRACE_SNAPSHOT,
        }),
      ),
    };

    const mockPriorityResult = {
      applyPriorityResult: jest.fn().mockResolvedValue(75),
    } as unknown as jest.Mocked<LLMPriorityResultService>;

    const mockEmailRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Repository<Email>>;
    const mockThreadRepository = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<EmailThread>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMPriorityBatchService,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: mockBoss },
        { provide: getRepositoryToken(Email), useValue: mockEmailRepository },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockThreadRepository,
        },
        {
          provide: EmailsService,
          useValue: { getEmailById: jest.fn() },
        },
        {
          provide: PriorityAnalysisService,
          useValue: { analyzePriorityBatch: jest.fn() },
        },
        {
          provide: PriorityCacheService,
          useValue: {
            getUserContexts: jest.fn().mockResolvedValue([]),
            getUserTimezone: jest.fn().mockResolvedValue("UTC"),
          },
        },
        { provide: LLMPriorityResultService, useValue: mockPriorityResult },
        {
          provide: LLMSummaryProcessorService,
          useValue: { tryIncrementalAnalysis: jest.fn() },
        },
        {
          provide: ProtoCategoriesService,
          useValue: { findActiveByUser: jest.fn().mockResolvedValue([]) },
        },
        { provide: DebugService, useValue: { logBatch: jest.fn() } },
        {
          provide: PrioritySqsDispatchService,
          useValue: { enqueueAllBatchesViaSqs: jest.fn() },
        },
        {
          provide: PriorityAnalysisFinalizerService,
          useValue: { createRun: jest.fn() },
        },
        {
          provide: LLMDeterministicPriorityService,
          useValue: { tryHandle: jest.fn(), loadPreload: jest.fn() },
        },
        {
          provide: PriorityRulesService,
          useValue: { shadowAndMine: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: CategoryRulesService, useValue: mockCategoryRules },
      ],
    }).compile();

    service = module.get<LLMPriorityBatchService>(LLMPriorityBatchService);
  });

  afterEach(() => jest.restoreAllMocks());

  function categoryRuleJobCalls() {
    return mockBoss.send.mock.calls.filter(
      (call) => call[0] === JOB_NAMES.GENERATE_CATEGORY_RULE,
    );
  }

  it("enqueues one generate-category-rule job for a HIGH-confidence, no-rule email", async () => {
    const email = makeEmail("email-1");
    const results = new Map<string, BatchPriorityResult>([
      [email.id, makeResult({ category: "Sales", categoryConfidence: "HIGH" })],
    ]);

    await service.applyBatchResults(WORKER_ID, USER_ID, [email], results, []);

    const calls = categoryRuleJobCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({
      userId: USER_ID,
      emailId: email.id,
      categoryName: "Sales",
    });
    // Very-low priority so the background authoring never starves live refine.
    expect(calls[0][2]).toEqual(
      expect.objectContaining({ priority: JobPriority.VERY_LOW }),
    );
  });

  it("does NOT enqueue when a deterministic rule already matched", async () => {
    ruleMatch = {
      ruleId: "rule-123",
      categoryName: "Newsletters",
    } as unknown as CategoryRuleMatch;
    const email = makeEmail("email-2");
    const results = new Map<string, BatchPriorityResult>([
      [
        email.id,
        makeResult({ category: "Newsletters", categoryConfidence: "HIGH" }),
      ],
    ]);

    await service.applyBatchResults(WORKER_ID, USER_ID, [email], results, []);

    expect(categoryRuleJobCalls()).toHaveLength(0);
  });

  it("does NOT enqueue when LLM category confidence is below HIGH", async () => {
    const email = makeEmail("email-3");
    const results = new Map<string, BatchPriorityResult>([
      [email.id, makeResult({ categoryConfidence: "MEDIUM" })],
    ]);

    await service.applyBatchResults(WORKER_ID, USER_ID, [email], results, []);

    expect(categoryRuleJobCalls()).toHaveLength(0);
  });

  it("does NOT enqueue for triage-preserved results (skipped before scoring)", async () => {
    const email = makeEmail("email-4");
    const results = new Map<string, BatchPriorityResult>([
      [
        email.id,
        makeResult({ categoryConfidence: "HIGH", triagePreserved: true }),
      ],
    ]);

    await service.applyBatchResults(WORKER_ID, USER_ID, [email], results, []);

    expect(categoryRuleJobCalls()).toHaveLength(0);
  });
});
