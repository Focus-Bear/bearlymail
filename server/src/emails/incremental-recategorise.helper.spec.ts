import type { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import type { CategoryRulesService } from "../category-rules/category-rules.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import type { ProtoCategory } from "../database/entities/proto-category.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { categoriseWithEscalation } from "../llm/llm-categorise-summary";
import type { LLMCoreService } from "../llm/llm-core.service";
import {
  persistCategoryDecisionTraceOnly,
  persistLlmCategoryWithPrecedence,
} from "./category-column-updates.helper";
import type { CategoryDecisionTrace } from "./category-decision-trace.types";
import {
  recategoriseFromSummary,
  threadNeedsLocalModelRecategorisation,
} from "./incremental-recategorise.helper";

jest.mock("./category-column-updates.helper", () => ({
  persistLlmCategoryWithPrecedence: jest.fn(),
  persistCategoryDecisionTraceOnly: jest.fn(),
}));

// The categoriser itself (chooseEmailCategory → shortlist → categoriseWithEscalation)
// runs for real; only the LLM call at the bottom is stubbed, so these tests
// assert what the model is actually shown.
jest.mock("../llm/llm-categorise-summary", () => ({
  ...jest.requireActual("../llm/llm-categorise-summary"),
  categoriseWithEscalation: jest.fn(),
}));

const categoriseMock = categoriseWithEscalation as jest.Mock;
const persistCategoryMock = persistLlmCategoryWithPrecedence as jest.Mock;
const persistTraceOnlyMock = persistCategoryDecisionTraceOnly as jest.Mock;

const NEW_EMAIL_ID = "email-new";
const NEW_EMAIL_RECEIVED_AT = new Date("2026-09-04T13:11:00.000Z");
const THREAD_SUMMARY =
  "Thread about a habit-editing bug; QA reported a failure last week.";
const NEW_BODY =
  "Test Environment / Device: MacBook Air M1\nQA Status: Pass — 6/6 scenarios passed.";

function llmPick(categoryName: string, reasoning = "because") {
  return {
    categoryNumber: 1,
    categoryName,
    categoryConfidence: "HIGH",
    reasoning,
  };
}

function lastTraceOnlyTrace(): CategoryDecisionTrace {
  const [, , payload] = persistTraceOnlyMock.mock.calls.at(-1)!;
  return payload.decisionTrace;
}

describe("recategoriseFromSummary", () => {
  let mockCategoryRulesService: jest.Mocked<CategoryRulesService>;
  let mockEmailThreadRepository: jest.Mocked<Repository<EmailThread>>;
  let mockLlmCoreService: jest.Mocked<LLMCoreService>;
  let logger: jest.Mocked<Logger>;
  let getThreadSummary: jest.Mock;
  let getProtoCategories: jest.Mock;
  let isShortlistEnabled: jest.Mock;
  let getShortlistWithMeta: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCategoryRulesService = {
      peekMatchingRuleWithTrace: jest.fn(),
    } as unknown as jest.Mocked<CategoryRulesService>;
    mockCategoryRulesService.peekMatchingRuleWithTrace.mockResolvedValue({
      match: null,
      snapshot: undefined,
    });

    mockEmailThreadRepository = {} as unknown as jest.Mocked<
      Repository<EmailThread>
    >;

    mockLlmCoreService = {
      generateText: jest.fn(),
    } as unknown as jest.Mocked<LLMCoreService>;

    getThreadSummary = jest.fn().mockResolvedValue(THREAD_SUMMARY);
    getProtoCategories = jest.fn().mockResolvedValue([]);
    isShortlistEnabled = jest.fn().mockReturnValue(false);
    getShortlistWithMeta = jest.fn();

    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;
  });

  const email = {
    id: NEW_EMAIL_ID,
    emailThreadId: "thread-1",
    from: "notifications@github.com",
    fromName: "Bao Ngoc",
    subject: "Re: Habit editing bug",
    body: NEW_BODY,
    receivedAt: NEW_EMAIL_RECEIVED_AT,
  } as unknown as Email;

  /** Already categorised as "QA failed" by an earlier automated run. */
  const thread = {
    id: "thread-1",
    categoryId: "cat-1",
    categorySource: "priority",
  } as unknown as EmailThread;

  const userContexts: UserContext[] = [
    {
      contextId: "cat-1",
      contextKey: ContextKey.EMAIL_CATEGORY,
      contextValue: "QA failed - Issues that failed QA",
    } as UserContext,
    {
      contextId: "cat-2",
      contextKey: ContextKey.EMAIL_CATEGORY,
      contextValue: "QA passed - Issues that passed QA",
    } as UserContext,
  ];

  const deps = () => ({
    categoryRulesService: mockCategoryRulesService,
    categoryShortlistService: { isShortlistEnabled, getShortlistWithMeta },
    emailThreadRepository: mockEmailThreadRepository,
    getThreadSummary,
    getProtoCategories,
    llmCoreService: mockLlmCoreService,
    logger,
  });

  const args = () => ({
    thread,
    email,
    userId: "user-1",
    workerId: "worker-1",
    userContexts,
  });

  it("returns early if email has no thread id", async () => {
    const emailWithNoThread = {
      ...email,
      emailThreadId: undefined,
    } as unknown as Email;
    await recategoriseFromSummary(deps(), {
      ...args(),
      email: emailWithNoThread,
    });

    expect(
      mockCategoryRulesService.peekMatchingRuleWithTrace,
    ).not.toHaveBeenCalled();
    expect(persistCategoryMock).not.toHaveBeenCalled();
    expect(persistTraceOnlyMock).not.toHaveBeenCalled();
  });

  describe("deterministic rule short-circuit", () => {
    it("persists the rule's category with a rule-step trace stamped with the NEW email, without consulting the LLM", async () => {
      mockCategoryRulesService.peekMatchingRuleWithTrace.mockResolvedValue({
        match: { categoryId: "cat-1", categoryName: "QA failed" },
        snapshot: { ruleId: "rule-abc" } as never,
      });

      await recategoriseFromSummary(deps(), args());

      expect(
        mockCategoryRulesService.peekMatchingRuleWithTrace,
      ).toHaveBeenCalledWith("user-1", expect.any(Object));
      expect(persistCategoryMock).toHaveBeenCalledWith(
        mockEmailThreadRepository,
        logger,
        expect.objectContaining({
          emailThreadId: "thread-1",
          workerId: "worker-1",
          ruleCategoryId: "cat-1",
          categoryId: "cat-1",
          finalCategory: "QA failed",
          resolvedCategoryExplanation: expect.stringContaining(
            "deterministic rule matched",
          ),
        }),
      );
      const trace: CategoryDecisionTrace =
        persistCategoryMock.mock.calls[0][2].decisionTrace;
      expect(trace.writtenBy).toBe("incremental");
      expect(trace.trigger).toBe("new-email");
      expect(trace.source).toBe("rule");
      expect(trace.analyzedEmail).toEqual({
        emailId: NEW_EMAIL_ID,
        receivedAt: NEW_EMAIL_RECEIVED_AT.toISOString(),
        contentSource: "email-metadata",
      });
      expect(trace.steps).toEqual([
        expect.objectContaining({
          step: "deterministic-rule",
          outcome: "applied",
          categoryId: "cat-1",
        }),
      ]);
      expect(categoriseMock).not.toHaveBeenCalled();
      expect(getThreadSummary).not.toHaveBeenCalled();
    });
  });

  describe("LLM categoriser input (parity with the new-email priority path)", () => {
    it("shows the model category descriptions, proto categories and the sender address", async () => {
      getProtoCategories.mockResolvedValue([
        {
          id: "11111111-2222-3333-4444-555555555555",
          name: "Release notes",
          description: "Automated release announcements",
        },
      ] as ProtoCategory[]);
      categoriseMock.mockResolvedValue(llmPick("QA passed"));

      await recategoriseFromSummary(deps(), args());

      expect(getProtoCategories).toHaveBeenCalledWith("user-1");
      expect(categoriseMock).toHaveBeenCalledTimes(1);
      const params = categoriseMock.mock.calls[0][2];
      expect(params.subject).toBe("Re: Habit editing bug");
      expect(params.senderName).toBe("Bao Ngoc");
      expect(params.senderEmail).toBe("notifications@github.com");
      expect(params.userId).toBe("user-1");
      expect(params.categories).toEqual([
        { name: "QA failed", description: "Issues that failed QA" },
        { name: "QA passed", description: "Issues that passed QA" },
        {
          name: "Release notes",
          description: "Automated release announcements",
          categoryKey: "p_11111111222233334444555555555555",
        },
      ]);
    });

    it("feeds BOTH the refreshed thread summary AND the new email's cleaned body to the model", async () => {
      categoriseMock.mockResolvedValue(llmPick("QA passed"));

      await recategoriseFromSummary(deps(), args());

      const { summary } = categoriseMock.mock.calls[0][2];
      expect(summary).toContain("Thread summary:");
      expect(summary).toContain(THREAD_SUMMARY);
      expect(summary).toContain("Latest message");
      expect(summary).toContain("Test Environment / Device: MacBook Air M1");
      expect(summary).toContain("QA Status: Pass");
    });

    it("runs the embedding shortlist over the combined input and passes the shortlisted candidates to the model", async () => {
      isShortlistEnabled.mockReturnValue(true);
      getShortlistWithMeta.mockResolvedValue({
        effective: [
          { name: "QA passed", description: "Issues that passed QA" },
        ],
        candidates: [{ name: "QA passed", score: 0.9, pinned: false }],
      });
      categoriseMock.mockResolvedValue(llmPick("QA passed"));

      await recategoriseFromSummary(deps(), args());

      expect(isShortlistEnabled).toHaveBeenCalledWith(2);
      const [shortlistEmail, allCategories] =
        getShortlistWithMeta.mock.calls[0];
      expect(shortlistEmail).toEqual({
        from: "notifications@github.com",
        fromName: "Bao Ngoc",
        subject: "Re: Habit editing bug",
        summary: expect.stringContaining(THREAD_SUMMARY),
      });
      expect(shortlistEmail.summary).toContain("QA Status: Pass");
      expect(allCategories).toHaveLength(2);
      expect(categoriseMock.mock.calls[0][2].categories).toEqual([
        { name: "QA passed", description: "Issues that passed QA" },
      ]);
    });

    it("falls back to the summary alone when the new email has no usable body", async () => {
      categoriseMock.mockResolvedValue(llmPick("QA passed"));

      await recategoriseFromSummary(deps(), {
        ...args(),
        email: { ...email, body: "" } as unknown as Email,
      });

      expect(categoriseMock.mock.calls[0][2].summary).toBe(THREAD_SUMMARY);
    });
  });

  describe("outcomes on a thread that already has a category", () => {
    it("applies a DIFFERENT real category through the precedence guard with a trace stamped with the NEW email", async () => {
      categoriseMock.mockResolvedValue(
        llmPick("QA passed", "The QA verdict is Pass"),
      );

      await recategoriseFromSummary(deps(), args());

      expect(persistCategoryMock).toHaveBeenCalledTimes(1);
      const payload = persistCategoryMock.mock.calls[0][2];
      expect(payload).toEqual(
        expect.objectContaining({
          categoryId: "cat-2",
          finalCategory: "QA passed",
          ruleCategoryId: null,
          resolvedCategoryExplanation: "The QA verdict is Pass",
        }),
      );
      const trace: CategoryDecisionTrace = payload.decisionTrace;
      expect(trace.writtenBy).toBe("incremental");
      expect(trace.analyzedEmail).toEqual({
        emailId: NEW_EMAIL_ID,
        receivedAt: NEW_EMAIL_RECEIVED_AT.toISOString(),
        contentSource: "thread-summary-and-body",
      });
      expect(trace.steps).toEqual([
        expect.objectContaining({
          step: "llm",
          outcome: "applied",
          categoryId: "cat-2",
        }),
      ]);
      expect(persistTraceOnlyMock).not.toHaveBeenCalled();
    });

    it("writes a trace-only 'unchanged' record when the model picks the category the thread already has", async () => {
      categoriseMock.mockResolvedValue(
        llmPick("QA failed", "Still describes the failing scenario"),
      );

      await recategoriseFromSummary(deps(), args());

      expect(persistCategoryMock).not.toHaveBeenCalled();
      expect(persistTraceOnlyMock).toHaveBeenCalledWith(
        mockEmailThreadRepository,
        logger,
        expect.objectContaining({
          emailThreadId: "thread-1",
          workerId: "worker-1",
        }),
      );
      const trace = lastTraceOnlyTrace();
      expect(trace.writtenBy).toBe("incremental");
      expect(trace.finalCategory).toBe("QA failed");
      expect(trace.finalCategoryId).toBe("cat-1");
      expect(trace.analyzedEmail?.emailId).toBe(NEW_EMAIL_ID);
      expect(trace.analyzedEmail?.contentSource).toBe(
        "thread-summary-and-body",
      );
      expect(trace.steps).toEqual([
        expect.objectContaining({
          step: "llm",
          outcome: "applied",
          category: "QA failed",
          categoryId: "cat-1",
          detail: expect.stringContaining("unchanged"),
        }),
      ]);
      expect(trace.steps[0].detail).toContain(
        "Still describes the failing scenario",
      );
    });

    it("keeps the existing category (never demotes to Other) and records a 'suppressed' trace when the model says Other", async () => {
      categoriseMock.mockResolvedValue({
        categoryNumber: 0,
        categoryName: "Other",
        categoryConfidence: "LOW",
        reasoning: "Unrelated",
      });

      await recategoriseFromSummary(deps(), args());

      expect(persistCategoryMock).not.toHaveBeenCalled();
      const trace = lastTraceOnlyTrace();
      expect(trace.finalCategory).toBe("QA failed");
      expect(trace.finalCategoryId).toBe("cat-1");
      expect(trace.analyzedEmail?.emailId).toBe(NEW_EMAIL_ID);
      expect(trace.steps).toEqual([
        expect.objectContaining({
          step: "llm",
          outcome: "suppressed",
          category: "Other",
          categoryId: null,
          detail: expect.stringContaining('existing category "QA failed" kept'),
        }),
      ]);
    });

    it("keeps the existing category and records a 'skipped' trace when every categoriser call fails", async () => {
      categoriseMock.mockResolvedValue(null);

      await recategoriseFromSummary(deps(), args());

      expect(persistCategoryMock).not.toHaveBeenCalled();
      const trace = lastTraceOnlyTrace();
      expect(trace.finalCategoryId).toBe("cat-1");
      expect(trace.steps).toEqual([
        expect.objectContaining({
          step: "llm",
          outcome: "skipped",
          category: null,
          detail: expect.stringContaining("unavailable"),
        }),
      ]);
    });

    it("keeps the existing category and names the pick when the model returns something that is not a user category", async () => {
      categoriseMock.mockResolvedValue(
        llmPick("A brand new category that does not exist in user context"),
      );

      await recategoriseFromSummary(deps(), args());

      expect(persistCategoryMock).not.toHaveBeenCalled();
      const trace = lastTraceOnlyTrace();
      expect(trace.finalCategoryId).toBe("cat-1");
      expect(trace.steps[0]).toEqual(
        expect.objectContaining({
          outcome: "suppressed",
          category: "A brand new category that does not exist in user context",
          categoryId: null,
        }),
      );
    });

    it.each(["user", "rule"])(
      "skips the LLM entirely when the stored categorySource (%s) outranks automated writes",
      async (categorySource) => {
        await recategoriseFromSummary(deps(), {
          ...args(),
          thread: { ...thread, categorySource } as unknown as EmailThread,
        });

        expect(getThreadSummary).not.toHaveBeenCalled();
        expect(categoriseMock).not.toHaveBeenCalled();
        expect(persistCategoryMock).not.toHaveBeenCalled();
        expect(persistTraceOnlyMock).not.toHaveBeenCalled();
      },
    );

    it("does nothing when there is no thread summary to evaluate", async () => {
      getThreadSummary.mockResolvedValue(null);

      await recategoriseFromSummary(deps(), args());

      expect(categoriseMock).not.toHaveBeenCalled();
      expect(persistCategoryMock).not.toHaveBeenCalled();
      expect(persistTraceOnlyMock).not.toHaveBeenCalled();
    });

    it("does nothing when the user has no email categories", async () => {
      await recategoriseFromSummary(deps(), {
        ...args(),
        userContexts: userContexts.filter(
          (ctx) => ctx.contextKey !== ContextKey.EMAIL_CATEGORY,
        ),
      });

      expect(categoriseMock).not.toHaveBeenCalled();
      expect(persistCategoryMock).not.toHaveBeenCalled();
      expect(persistTraceOnlyMock).not.toHaveBeenCalled();
    });
  });

  // A thread the local model parked in provisional "Other" (categorySource
  // 'local', categoryId null) must not stay "awaiting re-categorisation"
  // forever. The LLM pass either resolves a real category OR settles it as a
  // definitive AI-decided "Other".
  describe("local-model provisional Other (categorySource 'local', categoryId null)", () => {
    const localOtherThread = {
      id: "thread-1",
      categoryId: null,
      categorySource: "local",
    } as unknown as EmailThread;

    const localOtherArgs = () => ({ ...args(), thread: localOtherThread });

    it("settles as a definitive 'Other' when the LLM returns Other", async () => {
      categoriseMock.mockResolvedValue({
        categoryNumber: 0,
        categoryName: "Other",
        categoryConfidence: "LOW",
        reasoning: null,
      });

      await recategoriseFromSummary(deps(), localOtherArgs());

      expect(persistCategoryMock).toHaveBeenCalledTimes(1);
      const [, , payload] = persistCategoryMock.mock.calls[0];
      // categoryId null + finalCategory "Other" makes the precedence helper
      // clear categorySource, so threadNeedsLocalModelRecategorisation becomes
      // false and the "awaiting" state ends.
      expect(payload.categoryId).toBeNull();
      expect(payload.finalCategory).toBe("Other");
      expect(payload.decisionTrace.finalCategoryId).toBeNull();
      expect(payload.decisionTrace.analyzedEmail.emailId).toBe(NEW_EMAIL_ID);
      expect(persistTraceOnlyMock).not.toHaveBeenCalled();
    });

    it("settles as 'Other' when the LLM category name resolves to no user category", async () => {
      categoriseMock.mockResolvedValue(
        llmPick("Some category the user does not have"),
      );

      await recategoriseFromSummary(deps(), localOtherArgs());

      expect(persistCategoryMock).toHaveBeenCalledTimes(1);
      const [, , payload] = persistCategoryMock.mock.calls[0];
      expect(payload.categoryId).toBeNull();
      expect(payload.finalCategory).toBe("Other");
    });

    it("settles as 'Other' when every categoriser call fails", async () => {
      categoriseMock.mockResolvedValue(null);

      await recategoriseFromSummary(deps(), localOtherArgs());

      expect(persistCategoryMock).toHaveBeenCalledTimes(1);
      const [, , payload] = persistCategoryMock.mock.calls[0];
      expect(payload.categoryId).toBeNull();
      expect(payload.finalCategory).toBe("Other");
    });

    it("settles as 'Other' even when the user has no categories defined", async () => {
      await recategoriseFromSummary(deps(), {
        ...localOtherArgs(),
        userContexts: [] as UserContext[],
      });

      expect(categoriseMock).not.toHaveBeenCalled();
      expect(persistCategoryMock).toHaveBeenCalledTimes(1);
      const [, , payload] = persistCategoryMock.mock.calls[0];
      expect(payload.categoryId).toBeNull();
      expect(payload.finalCategory).toBe("Other");
    });

    it("applies a real category when the LLM resolves one (rescue path)", async () => {
      categoriseMock.mockResolvedValue(
        llmPick("QA failed", "Summary describes a QA failure"),
      );

      await recategoriseFromSummary(deps(), localOtherArgs());

      expect(persistCategoryMock).toHaveBeenCalledTimes(1);
      const [, , payload] = persistCategoryMock.mock.calls[0];
      expect(payload.categoryId).toBe("cat-1");
      expect(payload.finalCategory).toBe("QA failed");
    });

    it("leaves the thread untouched when there is no summary yet (retries later)", async () => {
      getThreadSummary.mockResolvedValue(null);

      await recategoriseFromSummary(deps(), localOtherArgs());

      expect(categoriseMock).not.toHaveBeenCalled();
      expect(persistCategoryMock).not.toHaveBeenCalled();
    });
  });
});

describe("threadNeedsLocalModelRecategorisation", () => {
  const base = {
    categorySource: "local" as string | null,
    categoryId: null as string | null,
  };

  it("is true for a local 'Other' thread whose category head was unconfident", () => {
    expect(threadNeedsLocalModelRecategorisation(base)).toBe(true);
  });

  it("is true when the category head was confident but matched no user category", () => {
    // A confident local 'Other' now defers to the summary LLM instead of
    // parking permanently.
    expect(threadNeedsLocalModelRecategorisation(base)).toBe(true);
  });

  it("is false once a real category has been resolved", () => {
    expect(
      threadNeedsLocalModelRecategorisation({ ...base, categoryId: "cat-1" }),
    ).toBe(false);
  });

  it("is false when the category is no longer local-sourced (user/rule/LLM pinned)", () => {
    expect(
      threadNeedsLocalModelRecategorisation({
        ...base,
        categorySource: "rule",
      }),
    ).toBe(false);
  });

  it("is false (not throwing) for a null or undefined thread", () => {
    expect(threadNeedsLocalModelRecategorisation(null)).toBe(false);
    expect(threadNeedsLocalModelRecategorisation(undefined)).toBe(false);
  });
});
