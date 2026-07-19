import type { CategoryRuleTraceSnapshot } from "../category-rules/category-rules.types";
import { LLMDeterministicPriorityService } from "./llm-deterministic-priority.service";

/**
 * Chainable mock for the update query builder used by
 * updateThreadCategoryWithPrecedence. Captures the `.set()` payload so tests
 * can assert on the guarded category write.
 */
function makeUpdateQueryBuilderMock() {
  const builder = {
    update: jest.fn(),
    set: jest.fn(),
    andWhere: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  builder.update.mockReturnValue(builder);
  builder.set.mockReturnValue(builder);
  builder.andWhere.mockReturnValue(builder);
  return builder;
}

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

  function buildService(
    threadUpdate: jest.Mock,
    queryBuilder = makeUpdateQueryBuilderMock(),
  ) {
    const emailThreadRepository = {
      update: threadUpdate,
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as never;
    const priorityRulesService = {} as never;
    const categoryRulesService = {} as never;
    const cloudWatchService = {} as never;
    const backgroundSummaryQueueService = {
      maybeQueueBackgroundSummary,
    } as never;
    return new LLMDeterministicPriorityService(
      emailThreadRepository,
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
    const queryBuilder = makeUpdateQueryBuilderMock();
    const service = buildService(update, queryBuilder);

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
        prioritySource: "rule",
        priorityScore: 10,
        isProcessingPriority: false,
      }),
    );
    expect(queryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        categorySource: "rule",
        categoryRuleTrace: snapshot,
      }),
    );
    expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
  });

  it("omits categoryRuleTrace from the update when none is provided", async () => {
    const update = jest.fn().mockResolvedValue({});
    const queryBuilder = makeUpdateQueryBuilderMock();
    const service = buildService(update, queryBuilder);

    await service.applyDeterministicPriority({
      email: { id: "e1", emailThreadId: "t1" } as never,
      thread: { starCount: 0, isBatched: true, githubMetadata: null } as never,
      representativeScore: 10,
      categoryMatch: { categoryName: "CI", categoryId: "cat-1" },
      userId: "user-1",
      workerId: "w1",
    });

    const setPayload = queryBuilder.set.mock.calls[0][0];
    expect(setPayload).not.toHaveProperty("categoryRuleTrace");
    const updatePayload = update.mock.calls[0][1];
    expect(updatePayload).not.toHaveProperty("categoryRuleTrace");
  });
});
