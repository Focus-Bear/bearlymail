import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { CategoryRulesService } from "../category-rules/category-rules.service";
import { PRIORITY_SCORES } from "../constants/priority-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { PriorityRulesService } from "../priority-rules/priority-rules.service";
import { BackgroundSummaryQueueService } from "./background-summary-queue.service";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";

describe("LLMDeterministicPriorityService - applyDeterministicPriority", () => {
  let service: LLMDeterministicPriorityService;
  let emailThreadRepository: jest.Mocked<Repository<EmailThread>>;
  let priorityRules: {
    peekMatchingRule: jest.Mock;
    recordHit: jest.Mock;
    loadEnabledRules?: jest.Mock;
  };
  let categoryRules: {
    peekMatchingRule: jest.Mock;
    peekMatchingRuleWithTrace: jest.Mock;
    loadRuleEvaluationSet?: jest.Mock;
  };
  let backgroundSummaryQueue: { maybeQueueBackgroundSummary: jest.Mock };
  let queryBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    andWhere: jest.Mock;
    execute: jest.Mock;
  };

  const email = { id: "email-1", emailThreadId: "thread-1" } as Email;
  const thread = {
    id: "thread-1",
    starCount: 0,
    isBatched: true,
  } as EmailThread;

  beforeEach(async () => {
    // Chainable UpdateQueryBuilder mock for the precedence-guarded category
    // write; `.set()` captures the category columns for assertions.
    queryBuilder = {
      update: jest.fn(),
      set: jest.fn(),
      andWhere: jest.fn(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    queryBuilder.update.mockReturnValue(queryBuilder);
    queryBuilder.set.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    emailThreadRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as jest.Mocked<Repository<EmailThread>>;
    priorityRules = {
      peekMatchingRule: jest.fn(),
      recordHit: jest.fn(),
    };
    categoryRules = {
      peekMatchingRule: jest.fn(),
      peekMatchingRuleWithTrace: jest.fn(),
    };
    backgroundSummaryQueue = {
      maybeQueueBackgroundSummary: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMDeterministicPriorityService,
        {
          provide: getRepositoryToken(EmailThread),
          useValue: emailThreadRepository,
        },
        { provide: PriorityRulesService, useValue: priorityRules },
        { provide: CategoryRulesService, useValue: categoryRules },
        { provide: CloudWatchService, useValue: { putMetric: jest.fn() } },
        {
          provide: BackgroundSummaryQueueService,
          useValue: backgroundSummaryQueue,
        },
      ],
    }).compile();
    service = module.get(LLMDeterministicPriorityService);
  });

  const apply = (
    representativeScore: number,
    categoryId: string | null = "cat-1",
  ) =>
    service.applyDeterministicPriority({
      email,
      thread,
      representativeScore,
      categoryMatch: { categoryName: "Newsletters", categoryId },
      userId: "user-1",
      workerId: "w1",
    });

  it("writes the rule score, tags prioritySource='rule', and sets the category", async () => {
    // LOW_THRESHOLD (25) is below HIGH, so emergency delivery does not fire.
    await apply(PRIORITY_SCORES.LOW_THRESHOLD);
    expect(emailThreadRepository.update).toHaveBeenCalledTimes(1);
    expect(emailThreadRepository.update).toHaveBeenCalledWith(
      { id: "thread-1" },
      expect.objectContaining({
        priorityScore: PRIORITY_SCORES.LOW_THRESHOLD,
        prioritySource: "rule",
        isProcessingPriority: false,
      }),
    );
    // Category columns go through the precedence-guarded builder update.
    expect(queryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: "cat-1",
        categorySource: "rule",
      }),
    );
    expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
  });

  it("fires emergency delivery when the band score is high", async () => {
    // HIGH (80) ≥ HIGH_THRESHOLD (75): first update writes priority (the
    // category goes via the guarded builder), second un-batches for
    // emergency delivery.
    await apply(PRIORITY_SCORES.HIGH);
    expect(emailThreadRepository.update).toHaveBeenCalledTimes(2);
    expect(emailThreadRepository.update).toHaveBeenLastCalledWith(
      { id: "thread-1", userId: "user-1" },
      expect.objectContaining({ isBatched: false, wasDeliveredEarly: true }),
    );
  });

  describe("tryHandle", () => {
    const priorityMatch = {
      ruleId: "p1",
      band: "low",
      representativeScore: 35,
    };
    const categoryMatch = {
      categoryName: "Newsletters",
      categoryId: "c1",
      ruleId: "r1",
      ruleType: null,
      ruleKind: "composite",
    };
    const categorySnapshot = {
      evaluatedAt: "2026-06-15T00:00:00.000Z",
      ruleStepRan: true,
      rulesConsideredCount: 1,
      winningRuleId: "r1",
      winningRuleCategoryName: "Newsletters",
      matchedButNotWinningRuleIds: [],
    };
    let randomSpy: jest.SpyInstance;
    const envBefore = process.env.PRIORITY_RULE_SKIP_ENABLED;

    beforeEach(() => {
      // Unset = default ON; 0.99 roll is above the sample rate (not sampled).
      delete process.env.PRIORITY_RULE_SKIP_ENABLED;
      randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.99);
    });
    afterEach(() => {
      randomSpy.mockRestore();
      process.env.PRIORITY_RULE_SKIP_ENABLED = envBefore;
    });

    const run = () => service.tryHandle("user-1", email, thread, "w1");

    it("skips + applies when both rules match and not sampled", async () => {
      priorityRules.peekMatchingRule.mockResolvedValue(priorityMatch);
      categoryRules.peekMatchingRuleWithTrace.mockResolvedValue({
        match: categoryMatch,
        snapshot: categorySnapshot,
      });
      expect(await run()).toBe(true);
      expect(emailThreadRepository.update).toHaveBeenCalledWith(
        { id: "thread-1" },
        expect.objectContaining({
          priorityScore: 35,
          prioritySource: "rule",
        }),
      );
      expect(queryBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: "c1",
          categorySource: "rule",
          categoryRuleTrace: categorySnapshot,
        }),
      );
      expect(priorityRules.recordHit).toHaveBeenCalledWith("p1");
    });

    it("does not skip when there is no priority rule", async () => {
      priorityRules.peekMatchingRule.mockResolvedValue(null);
      expect(await run()).toBe(false);
      expect(categoryRules.peekMatchingRuleWithTrace).not.toHaveBeenCalled();
      expect(emailThreadRepository.update).not.toHaveBeenCalled();
    });

    it("does not skip when there is no category rule", async () => {
      priorityRules.peekMatchingRule.mockResolvedValue(priorityMatch);
      categoryRules.peekMatchingRuleWithTrace.mockResolvedValue({
        match: null,
        snapshot: { ...categorySnapshot, winningRuleId: null },
      });
      expect(await run()).toBe(false);
      expect(emailThreadRepository.update).not.toHaveBeenCalled();
    });

    it("falls through to the LLM when shadow-sampled", async () => {
      // A 0.0 roll lands inside the shadow-sample fraction.
      randomSpy.mockReturnValue(0.0);
      priorityRules.peekMatchingRule.mockResolvedValue(priorityMatch);
      categoryRules.peekMatchingRuleWithTrace.mockResolvedValue({
        match: categoryMatch,
        snapshot: categorySnapshot,
      });
      expect(await run()).toBe(false);
      expect(emailThreadRepository.update).not.toHaveBeenCalled();
    });

    it("threads preloaded rule sets through to both matchers", async () => {
      priorityRules.peekMatchingRule.mockResolvedValue(priorityMatch);
      categoryRules.peekMatchingRuleWithTrace.mockResolvedValue({
        match: categoryMatch,
        snapshot: categorySnapshot,
      });
      const preloaded = {
        priorityRules: [{ id: "p1" }],
        categoryRules: {
          rules: [],
          validCategoryIds: new Set<string>(),
          categoryIdByName: new Map<string, string>(),
        },
      };
      expect(
        await service.tryHandle(
          "user-1",
          email,
          thread,
          "w1",
          preloaded as never,
        ),
      ).toBe(true);
      // Both matchers receive the preloaded sets so a batch evaluates in
      // memory instead of re-fetching rules per email.
      expect(priorityRules.peekMatchingRule).toHaveBeenCalledWith(
        "user-1",
        expect.anything(),
        preloaded.priorityRules,
      );
      expect(categoryRules.peekMatchingRuleWithTrace).toHaveBeenCalledWith(
        "user-1",
        expect.anything(),
        preloaded.categoryRules,
      );
    });

    it("loadPreload returns undefined when the skip flag is off", async () => {
      process.env.PRIORITY_RULE_SKIP_ENABLED = "false";
      expect(await service.loadPreload("user-1")).toBeUndefined();
    });

    it("loadPreload fetches both rule sets once when enabled", async () => {
      priorityRules.loadEnabledRules = jest
        .fn()
        .mockResolvedValue([{ id: "p1" }]);
      categoryRules.loadRuleEvaluationSet = jest.fn().mockResolvedValue({
        rules: [],
        validCategoryIds: new Set(),
        categoryIdByName: new Map(),
      });
      const preload = await service.loadPreload("user-1");
      expect(preload?.priorityRules).toEqual([{ id: "p1" }]);
      expect(categoryRules.loadRuleEvaluationSet).toHaveBeenCalledWith(
        "user-1",
      );
    });

    it("does not skip when the kill switch is set", async () => {
      process.env.PRIORITY_RULE_SKIP_ENABLED = "false";
      priorityRules.peekMatchingRule.mockResolvedValue(priorityMatch);
      categoryRules.peekMatchingRuleWithTrace.mockResolvedValue({
        match: categoryMatch,
        snapshot: categorySnapshot,
      });
      expect(await run()).toBe(false);
      expect(priorityRules.peekMatchingRule).not.toHaveBeenCalled();
    });
  });
});
