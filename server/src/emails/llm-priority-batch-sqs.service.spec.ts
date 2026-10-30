/**
 * Unit tests for the Lambda/SQS dispatch path in LLMPriorityBatchService.
 *
 * Focuses on the USE_LAMBDA_PRIORITISATION=true branch: verifies that
 * - the batch is dispatched as an ids-only v2 message (no email content on SQS)
 * - PriorityAnalysisFinalizerService.createRun is called with the right threadIds
 * - a failed dispatch falls back to in-process analysis
 * - the in-process path is used when the flag is false
 */
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { DebugService } from "../debug/debug.service";
import { PriorityAnalysisService } from "../llm/priority-analysis.service";
import { PriorityCacheService } from "../priority/priority-cache.service";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { EmailsService } from "./emails.service";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";
import { LLMPriorityBatchService } from "./llm-priority-batch.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";
import { PriorityAnalysisFinalizerService } from "./priority-analysis-finalizer.service";
import { PRIORITY_BATCH_MESSAGE_VERSION } from "./priority-batch-lambda-message";
import { PrioritySqsDispatchService } from "./priority-sqs-dispatch.service";

function makeEmail(
  id: string,
  threadId: string,
  emailThreadId: string,
): Partial<Email> {
  return {
    id,
    threadId,
    emailThreadId,
    from: "sender@example.com",
    fromName: "Sender",
    subject: "Test email",
    body: "Body text",
    summary: null,
    htmlBody: null,
    sentimentScore: null,
    senderJobTitle: null,
  } as Partial<Email>;
}

describe("LLMPriorityBatchService — SQS dispatch path", () => {
  let service: LLMPriorityBatchService;
  let mockSqsDispatch: jest.Mocked<PrioritySqsDispatchService>;
  let mockFinalizer: jest.Mocked<PriorityAnalysisFinalizerService>;
  let mockPriorityAnalysis: jest.Mocked<PriorityAnalysisService>;
  let mockEmailsService: jest.Mocked<EmailsService>;
  let mockEmailRepository: jest.Mocked<Repository<Email>>;
  let mockThreadRepository: jest.Mocked<Repository<EmailThread>>;
  let mockTracker: jest.Mocked<JobPerformanceTracker>;
  let mockSummaryProcessor: {
    tryIncrementalAnalysis: jest.Mock;
    ensureThreadSummaryFresh: jest.Mock;
  };

  const USER_ID = "user-uuid-1";
  const EMAIL_THREAD_ID_1 = "eth-1";
  const EMAIL_THREAD_ID_2 = "eth-2";
  const EMAIL_1 = makeEmail("email-1", "provider-thread-1", EMAIL_THREAD_ID_1);
  const EMAIL_2 = makeEmail("email-2", "provider-thread-2", EMAIL_THREAD_ID_2);

  beforeEach(async () => {
    mockSqsDispatch = {
      dispatchBatch: jest.fn().mockResolvedValue("sqs-message-id"),
    } as unknown as jest.Mocked<PrioritySqsDispatchService>;

    mockFinalizer = {
      createRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PriorityAnalysisFinalizerService>;

    mockPriorityAnalysis = {
      analyzePriorityBatch: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<PriorityAnalysisService>;

    mockEmailsService = {
      getEmailById: jest.fn().mockImplementation((_, emailId: string) => {
        if (emailId === "email-1") return Promise.resolve(EMAIL_1);
        if (emailId === "email-2") return Promise.resolve(EMAIL_2);
        return Promise.resolve(null);
      }),
      getThreadEmails: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EmailsService>;

    mockEmailRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<Repository<Email>>;

    mockThreadRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: EMAIL_THREAD_ID_1,
          priorityRetryCount: 0,
          priorityExplanation: null,
          urgencyScore: null,
        },
        {
          id: EMAIL_THREAD_ID_2,
          priorityRetryCount: 0,
          priorityExplanation: null,
          urgencyScore: null,
        },
      ]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      increment: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<Repository<EmailThread>>;

    mockTracker = {
      startPhase: jest.fn(),
      endPhase: jest.fn(),
      finish: jest.fn(),
      setMetadata: jest.fn(),
    } as unknown as jest.Mocked<JobPerformanceTracker>;

    const mockBoss = {
      send: jest.fn().mockResolvedValue("job-id"),
    } as unknown as jest.Mocked<PgBoss>;

    const mockDebug = {
      logBatch: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DebugService>;

    mockSummaryProcessor = {
      tryIncrementalAnalysis: jest.fn().mockResolvedValue({ handled: false }),
      ensureThreadSummaryFresh: jest.fn().mockResolvedValue(undefined),
    };

    const mockPriorityCache = {
      getUserContexts: jest.fn().mockResolvedValue([]),
      getUserTimezone: jest.fn().mockResolvedValue("UTC"),
    } as unknown as jest.Mocked<PriorityCacheService>;

    const mockProtoCategories = {
      findActiveByUser: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ProtoCategoriesService>;

    const mockPriorityResult = {
      applyPriorityResult: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<LLMPriorityResultService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMPriorityBatchService,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: mockBoss },
        { provide: getRepositoryToken(Email), useValue: mockEmailRepository },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: mockThreadRepository,
        },
        { provide: EmailsService, useValue: mockEmailsService },
        { provide: PriorityAnalysisService, useValue: mockPriorityAnalysis },
        { provide: PriorityCacheService, useValue: mockPriorityCache },
        { provide: LLMPriorityResultService, useValue: mockPriorityResult },
        { provide: LLMSummaryProcessorService, useValue: mockSummaryProcessor },
        { provide: ProtoCategoriesService, useValue: mockProtoCategories },
        { provide: DebugService, useValue: mockDebug },
        { provide: PrioritySqsDispatchService, useValue: mockSqsDispatch },
        {
          provide: PriorityAnalysisFinalizerService,
          useValue: mockFinalizer,
        },
        {
          provide: LLMDeterministicPriorityService,
          useValue: {
            tryHandle: jest.fn().mockResolvedValue(false),
            loadPreload: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PriorityRulesService,
          useValue: { shadowAndMine: jest.fn() },
        },
        {
          provide: CategoryRulesService,
          useValue: {
            findMatchingRuleWithTrace: jest.fn().mockResolvedValue({
              match: null,
              snapshot: {
                evaluatedAt: "2026-06-15T00:00:00.000Z",
                ruleStepRan: true,
                rulesConsideredCount: 0,
                winningRuleId: null,
                winningRuleCategoryName: null,
                matchedButNotWinningRuleIds: [],
              },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LLMPriorityBatchService>(LLMPriorityBatchService);
  });

  afterEach(() => {
    delete process.env.USE_LAMBDA_PRIORITISATION;
    jest.restoreAllMocks();
  });

  describe("runBatchRefinement with USE_LAMBDA_PRIORITISATION=true", () => {
    beforeEach(() => {
      process.env.USE_LAMBDA_PRIORITISATION = "true";
    });

    it("dispatches one ids-only message for the whole batch", async () => {
      jest
        .spyOn(service, "shouldSkipPriorityRecalculation")
        .mockResolvedValue(false);

      await service.runBatchRefinement(
        USER_ID,
        ["email-1", "email-2"],
        "worker-1",
        mockTracker,
      );

      expect(mockSqsDispatch.dispatchBatch).toHaveBeenCalledTimes(1);
      const [message] = mockSqsDispatch.dispatchBatch.mock.calls[0];
      expect(message).toEqual({
        version: PRIORITY_BATCH_MESSAGE_VERSION,
        userId: USER_ID,
        analysisId: expect.any(String),
        emailIds: ["email-1", "email-2"],
      });
      expect(mockFinalizer.createRun).toHaveBeenCalledWith(
        expect.objectContaining({ analysisId: message.analysisId }),
      );
    });

    it("falls back to in-process analysis when the dispatch fails", async () => {
      jest
        .spyOn(service, "shouldSkipPriorityRecalculation")
        .mockResolvedValue(false);
      mockSqsDispatch.dispatchBatch.mockResolvedValue(null);

      await service.runBatchRefinement(
        USER_ID,
        ["email-1"],
        "worker-1",
        mockTracker,
      );

      expect(mockPriorityAnalysis.analyzePriorityBatch).toHaveBeenCalled();
    });

    it("creates a run record with both thread IDs", async () => {
      jest
        .spyOn(service, "shouldSkipPriorityRecalculation")
        .mockResolvedValue(false);

      await service.runBatchRefinement(
        USER_ID,
        ["email-1", "email-2"],
        "worker-1",
        mockTracker,
      );

      expect(mockFinalizer.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          totalBatches: 1,
          threadIds: expect.arrayContaining([
            EMAIL_THREAD_ID_1,
            EMAIL_THREAD_ID_2,
          ]),
        }),
      );
    });

    it("does NOT call the in-process LLM analysis when Lambda path is active", async () => {
      jest
        .spyOn(service, "shouldSkipPriorityRecalculation")
        .mockResolvedValue(false);

      await service.runBatchRefinement(
        USER_ID,
        ["email-1"],
        "worker-1",
        mockTracker,
      );

      expect(mockPriorityAnalysis.analyzePriorityBatch).not.toHaveBeenCalled();
    });
  });

  describe("runBatchRefinement with USE_LAMBDA_PRIORITISATION=false (default)", () => {
    it("falls through to in-process LLM analysis and does NOT call SQS dispatch", async () => {
      jest
        .spyOn(service, "shouldSkipPriorityRecalculation")
        .mockResolvedValue(false);

      await service.runBatchRefinement(
        USER_ID,
        ["email-1"],
        "worker-1",
        mockTracker,
      );

      expect(mockSqsDispatch.dispatchBatch).not.toHaveBeenCalled();
      expect(mockFinalizer.createRun).not.toHaveBeenCalled();
      expect(mockPriorityAnalysis.analyzePriorityBatch).toHaveBeenCalled();
    });

    it("refreshes each thread's summary once, from its newest email, and shares it with siblings", async () => {
      const EMAIL_3 = {
        ...makeEmail("email-3", "provider-thread-1", EMAIL_THREAD_ID_1),
        receivedAt: new Date("2026-10-02T00:00:00Z"),
      };
      const emailsById = new Map<string, Partial<Email>>([
        [
          "email-1",
          { ...EMAIL_1, receivedAt: new Date("2026-10-01T00:00:00Z") },
        ],
        ["email-2", EMAIL_2],
        ["email-3", EMAIL_3],
      ]);
      mockEmailsService.getEmailById.mockImplementation(
        async (_userId: string, emailId: string) =>
          (emailsById.get(emailId) ?? null) as Email,
      );
      jest
        .spyOn(service, "shouldSkipPriorityRecalculation")
        .mockResolvedValue(false);
      mockSummaryProcessor.ensureThreadSummaryFresh.mockImplementation(
        async (email: Email) => {
          email.summary = `fresh summary of ${email.emailThreadId}`;
        },
      );

      await service.runBatchRefinement(
        USER_ID,
        ["email-1", "email-2", "email-3"],
        "worker-1",
        mockTracker,
      );

      const refreshedIds =
        mockSummaryProcessor.ensureThreadSummaryFresh.mock.calls
          .map(([email]: [Email]) => email.id)
          .sort();
      expect(refreshedIds).toEqual(["email-2", "email-3"]);
      const [payloads] =
        mockPriorityAnalysis.analyzePriorityBatch.mock.calls[0];
      const summaryOf = (emailId: string) =>
        payloads.find((payload) => payload.emailKey === emailId)?.body;
      expect(summaryOf("email-1")).toBe(
        `fresh summary of ${EMAIL_THREAD_ID_1}`,
      );
      expect(summaryOf("email-3")).toBe(
        `fresh summary of ${EMAIL_THREAD_ID_1}`,
      );
    });
  });

  describe("runBatchRefinement — early return when all emails handled incrementally", () => {
    it("dispatches nothing when all emails are handled by incremental analysis", async () => {
      process.env.USE_LAMBDA_PRIORITISATION = "true";
      jest
        .spyOn(service, "shouldSkipPriorityRecalculation")
        .mockResolvedValue(false);
      mockSummaryProcessor.tryIncrementalAnalysis.mockResolvedValue({
        handled: true,
      });

      await service.runBatchRefinement(
        USER_ID,
        ["email-1"],
        "worker-1",
        mockTracker,
      );

      expect(mockSqsDispatch.dispatchBatch).not.toHaveBeenCalled();
      expect(mockFinalizer.createRun).not.toHaveBeenCalled();
    });
  });
});
