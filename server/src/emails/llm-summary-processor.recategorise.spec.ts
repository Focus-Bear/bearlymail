import { Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { RULE_CATEGORY_SOURCE } from "./category-precedence.helper";

// Stub the reused live category pipeline so this unit test asserts the
// demote/restore orchestration around it, not its internals (covered elsewhere).
jest.mock("./incremental-recategorise.helper", () => ({
  recategoriseFromSummary: jest.fn().mockResolvedValue(undefined),
  threadNeedsLocalModelRecategorisation: jest.fn().mockReturnValue(false),
}));

import { recategoriseFromSummary } from "./incremental-recategorise.helper";
import { LLMSummaryProcessorService } from "./llm-summary-processor.service";

const recategoriseFromSummaryMock = recategoriseFromSummary as jest.Mock;

const USER_ID = "74116b93-e8ca-4eab-b200-792788d1b7c5";
const FUTURE = new Date(Date.now() + 60_000);

interface ThreadRow {
  id: string;
  categoryId: string | null;
  categorySource: string | null;
  lastSummarizedAt?: Date;
}

function buildService(readBack: ThreadRow) {
  const updates: Array<{ where: unknown; set: Record<string, unknown> }> = [];
  const emailThreadRepository = {
    update: jest.fn((where: unknown, set: Record<string, unknown>) => {
      updates.push({ where, set });
      return Promise.resolve({ affected: 1 });
    }),
    findOne: jest.fn((opts: { select?: { lastSummarizedAt?: boolean } }) => {
      // ensureThreadSummaryFresh reads {id, lastSummarizedAt}; keep it fresh so
      // it early-returns without hitting the summariser.
      if (opts.select?.lastSummarizedAt) {
        return Promise.resolve({ id: readBack.id, lastSummarizedAt: FUTURE });
      }
      return Promise.resolve(readBack);
    }),
  };
  const priorityCacheService = {
    getUserContexts: jest.fn().mockResolvedValue([]),
  };
  const categoryRulesService = {
    peekMatchingRuleWithTrace: jest
      .fn()
      .mockResolvedValue({ match: null, snapshot: {} }),
  };
  const incrementalSummaryHelper = { getThreadSummary: jest.fn() };
  const empty = {} as unknown;

  const service = new LLMSummaryProcessorService(
    empty as Repository<Email>,
    emailThreadRepository as unknown as Repository<EmailThread>,
    empty as Repository<never>,
    empty as never,
    empty as never,
    empty as never,
    priorityCacheService as never,
    empty as never,
    empty as never,
    empty as never,
    incrementalSummaryHelper as never,
    categoryRulesService as unknown as CategoryRulesService,
    empty as never,
  );

  return { service, emailThreadRepository, categoryRulesService, updates };
}

function makeThread(): EmailThread {
  return {
    id: "t1",
    userId: USER_ID,
    categoryId: "issues-id",
    categorySource: RULE_CATEGORY_SOURCE,
  } as unknown as EmailThread;
}

function makeEmail(): Email {
  return {
    id: "e1",
    emailThreadId: "t1",
    threadId: "provider-t1",
    subject: "PR run failed",
    summary: "existing summary",
    receivedAt: new Date(Date.now() - 60_000),
  } as unknown as Email;
}

describe("LLMSummaryProcessorService.recategoriseRuleLabelledThread", () => {
  beforeEach(() => recategoriseFromSummaryMock.mockClear());

  it("demotes the stale rule source, runs the live pipeline, and reports the change", async () => {
    const { service, updates } = buildService({
      id: "t1",
      categoryId: "pr-id",
      categorySource: "priority",
    });

    const outcome = await service.recategoriseRuleLabelledThread({
      thread: makeThread(),
      email: makeEmail(),
      userId: USER_ID,
      workerId: "job-1",
    });

    // Source demoted to null BEFORE the live pipeline ran (so the precedence
    // guard lets a fresh LLM decision through).
    expect(updates[0].set).toEqual({ categorySource: null });
    expect(recategoriseFromSummaryMock).toHaveBeenCalledTimes(1);
    expect(outcome.changed).toBe(true);
    expect(outcome.oldCategoryId).toBe("issues-id");
    expect(outcome.newCategoryId).toBe("pr-id");
    expect(outcome.newCategorySource).toBe("priority");
    expect(outcome.ruleStillMatched).toBe(false);
  });

  it("restores the original rule source when the pipeline throws (retryable)", async () => {
    recategoriseFromSummaryMock.mockRejectedValueOnce(new Error("LLM down"));
    const { service, updates } = buildService({
      id: "t1",
      categoryId: "issues-id",
      categorySource: RULE_CATEGORY_SOURCE,
    });

    await expect(
      service.recategoriseRuleLabelledThread({
        thread: makeThread(),
        email: makeEmail(),
        userId: USER_ID,
        workerId: "job-1",
      }),
    ).rejects.toThrow("LLM down");

    // First update demotes to null; the catch restores the original 'rule'.
    expect(updates[0].set).toEqual({ categorySource: null });
    expect(updates[updates.length - 1].set).toEqual({
      categorySource: RULE_CATEGORY_SOURCE,
    });
  });
});
