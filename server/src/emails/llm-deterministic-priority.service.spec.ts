import type { CategoryRuleTraceSnapshot } from "../category-rules/category-rules.types";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";

describe("LLMDeterministicPriorityService.applyDeterministicPriority", () => {
  const snapshot: CategoryRuleTraceSnapshot = {
    evaluatedAt: "2026-06-15T00:00:00.000Z",
    ruleStepRan: true,
    rulesConsideredCount: 2,
    winningRuleId: "rule-1",
    winningRuleCategoryName: "CI",
    matchedButNotWinningRuleIds: [],
  };

  const maybeQueueBackgroundSummary = jest.fn().mockResolvedValue(undefined);

  function buildService(threadUpdate: jest.Mock) {
    const emailThreadRepository = { update: threadUpdate } as never;
    const githubCategoryOverrideService = {
      resolveOverrideCategoryId: jest.fn().mockResolvedValue(null),
    } as never;
    const usersService = {
      findOne: jest.fn().mockResolvedValue({ githubUsername: null }),
    } as never;
    const priorityRulesService = {} as never;
    const categoryRulesService = {} as never;
    const cloudWatchService = {} as never;
    const backgroundSummaryQueueService = {
      maybeQueueBackgroundSummary,
    } as never;
    return new LLMDeterministicPriorityService(
      emailThreadRepository,
      githubCategoryOverrideService,
      usersService,
      priorityRulesService,
      categoryRulesService,
      cloudWatchService,
      backgroundSummaryQueueService,
    );
  }

  beforeEach(() => maybeQueueBackgroundSummary.mockClear());

  it("gates the background summary on the rule's representative score", async () => {
    const service = buildService(jest.fn().mockResolvedValue({}));

    await service.applyDeterministicPriority({
      email: { id: "e1", emailThreadId: "t1" } as never,
      thread: { starCount: 0, isBatched: true, githubMetadata: null } as never,
      representativeScore: 10,
      categoryMatch: { categoryName: "CI", categoryId: "cat-1" },
      userId: "user-1",
      workerId: "w1",
    });

    expect(maybeQueueBackgroundSummary).toHaveBeenCalledWith({
      userId: "user-1",
      emailId: "e1",
      threadId: "t1",
      priorityScore: 10,
    });
  });

  it("persists the categoryRuleTrace snapshot on the thread", async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = buildService(update);

    await service.applyDeterministicPriority({
      email: { id: "e1", emailThreadId: "t1" } as never,
      thread: { starCount: 0, isBatched: true, githubMetadata: null } as never,
      // Low score so emergency delivery is a no-op (single thread update).
      representativeScore: 10,
      categoryMatch: { categoryName: "CI", categoryId: "cat-1" },
      categoryRuleTrace: snapshot,
      userId: "user-1",
      workerId: "w1",
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      { id: "t1" },
      expect.objectContaining({
        categorySource: "priority",
        categoryRuleTrace: snapshot,
      }),
    );
  });

  it("omits categoryRuleTrace from the update when none is provided", async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = buildService(update);

    await service.applyDeterministicPriority({
      email: { id: "e1", emailThreadId: "t1" } as never,
      thread: { starCount: 0, isBatched: true, githubMetadata: null } as never,
      representativeScore: 10,
      categoryMatch: { categoryName: "CI", categoryId: "cat-1" },
      userId: "user-1",
      workerId: "w1",
    });

    const updatePayload = update.mock.calls[0][1];
    expect(updatePayload).not.toHaveProperty("categoryRuleTrace");
  });
});
