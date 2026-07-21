import type { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import type { CategoryRulesService } from "../category-rules/category-rules.service";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { categoriseFromSummary } from "../llm/llm-categorise-summary";
import type { LLMCoreService } from "../llm/llm-core.service";
import { persistLlmCategoryWithPrecedence } from "./category-column-updates.helper";
import {
  recategoriseFromSummary,
  threadNeedsLocalModelRecategorisation,
} from "./incremental-recategorise.helper";

// Mock external helper modules
jest.mock("./category-column-updates.helper", () => ({
  persistLlmCategoryWithPrecedence: jest.fn(),
}));

jest.mock("../llm/llm-categorise-summary", () => ({
  categoriseFromSummary: jest.fn(),
}));

describe("recategoriseFromSummary", () => {
  let mockCategoryRulesService: jest.Mocked<CategoryRulesService>;
  let mockEmailThreadRepository: jest.Mocked<Repository<EmailThread>>;
  let mockLlmCoreService: jest.Mocked<LLMCoreService>;
  let logger: jest.Mocked<Logger>;

  let getThreadSummary: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCategoryRulesService = {
      peekMatchingRuleWithTrace: jest.fn(),
    } as unknown as jest.Mocked<CategoryRulesService>;

    mockEmailThreadRepository = {} as unknown as jest.Mocked<
      Repository<EmailThread>
    >;

    mockLlmCoreService = {
      generateText: jest.fn(),
    } as unknown as jest.Mocked<LLMCoreService>;

    getThreadSummary = jest.fn();

    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;
  });

  const email = {
    emailThreadId: "thread-1",
    subject: "QA Failure in App",
    fromName: "Bao Ngoc",
  } as unknown as Email;

  const thread = {
    id: "thread-1",
    categoryId: "old-cat-id",
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
    emailThreadRepository: mockEmailThreadRepository,
    getThreadSummary,
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
    expect(persistLlmCategoryWithPrecedence).not.toHaveBeenCalled();
  });

  it("persists category from deterministic rule if match is found", async () => {
    mockCategoryRulesService.peekMatchingRuleWithTrace.mockResolvedValue({
      match: { categoryId: "cat-1", categoryName: "QA failed" },
      snapshot: { ruleId: "rule-abc" } as any,
    });

    await recategoriseFromSummary(deps(), args());

    expect(
      mockCategoryRulesService.peekMatchingRuleWithTrace,
    ).toHaveBeenCalledWith("user-1", expect.any(Object));
    expect(persistLlmCategoryWithPrecedence).toHaveBeenCalledWith(
      mockEmailThreadRepository,
      logger,
      expect.objectContaining({
        emailThreadId: "thread-1",
        workerId: "worker-1",
        categoryId: "cat-1",
        finalCategory: "QA failed",
        resolvedCategoryExplanation: expect.stringContaining(
          "deterministic rule matched",
        ),
      }),
    );
    expect(categoriseFromSummary).not.toHaveBeenCalled();
  });

  it("falls back to summary-based LLM categorization if no deterministic rule matches", async () => {
    mockCategoryRulesService.peekMatchingRuleWithTrace.mockResolvedValue({
      match: null,
      snapshot: undefined,
    });
    getThreadSummary.mockResolvedValue("Thread contains a verified bug fix.");
    (categoriseFromSummary as jest.Mock).mockResolvedValue({
      categoryNumber: 2,
      categoryName: "QA passed",
      categoryConfidence: "HIGH",
      reasoning: "Summary says it is verified",
    });

    await recategoriseFromSummary(deps(), args());

    expect(getThreadSummary).toHaveBeenCalledWith("thread-1");
    expect(categoriseFromSummary).toHaveBeenCalledWith(
      expect.any(Function),
      logger,
      {
        subject: "QA Failure in App",
        senderName: "Bao Ngoc",
        summary: "Thread contains a verified bug fix.",
        categories: [{ name: "QA failed" }, { name: "QA passed" }],
        userId: "user-1",
      },
    );

    // Verify generateText is wired up correctly inside the wrapper callback
    const generateTextCallback = (categoriseFromSummary as jest.Mock).mock
      .calls[0][0];
    mockLlmCoreService.generateText.mockResolvedValue("mock-response");
    await generateTextCallback({
      prompt: "p",
      systemPrompt: "s",
      temperature: 0.3,
      maxTokens: 100,
    });
    expect(mockLlmCoreService.generateText).toHaveBeenCalledWith(
      {
        prompt: "p",
        systemPrompt: "s",
        temperature: 0.3,
        maxTokens: 100,
        operation: "categorise_summary",
      },
      undefined,
      "user-1",
    );

    expect(persistLlmCategoryWithPrecedence).toHaveBeenCalledWith(
      mockEmailThreadRepository,
      logger,
      expect.objectContaining({
        emailThreadId: "thread-1",
        categoryId: "cat-2",
        finalCategory: "QA passed",
        resolvedCategoryExplanation: "Summary says it is verified",
      }),
    );
  });

  it("does not update anything if getThreadSummary returns null", async () => {
    mockCategoryRulesService.peekMatchingRuleWithTrace.mockResolvedValue({
      match: null,
      snapshot: undefined,
    });
    getThreadSummary.mockResolvedValue(null);

    await recategoriseFromSummary(deps(), args());

    expect(categoriseFromSummary).not.toHaveBeenCalled();
    expect(persistLlmCategoryWithPrecedence).not.toHaveBeenCalled();
  });

  it("does not update anything if userContexts has no email category keys", async () => {
    mockCategoryRulesService.peekMatchingRuleWithTrace.mockResolvedValue({
      match: null,
      snapshot: undefined,
    });
    getThreadSummary.mockResolvedValue("Thread contains a verified bug fix.");

    const argsWithNoCategories = {
      ...args(),
      userContexts: userContexts.filter(
        (ctx) => ctx.contextKey !== ContextKey.EMAIL_CATEGORY,
      ),
    };

    await recategoriseFromSummary(deps(), argsWithNoCategories);

    expect(categoriseFromSummary).not.toHaveBeenCalled();
    expect(persistLlmCategoryWithPrecedence).not.toHaveBeenCalled();
  });

  it("does not clobber if LLM returns Other or failure (null)", async () => {
    mockCategoryRulesService.peekMatchingRuleWithTrace.mockResolvedValue({
      match: null,
      snapshot: undefined,
    });
    getThreadSummary.mockResolvedValue("Thread contains a verified bug fix.");

    // Test Other
    (categoriseFromSummary as jest.Mock).mockResolvedValue({
      categoryNumber: 0,
      categoryName: "Other",
      categoryConfidence: "LOW",
      reasoning: "Unrelated",
    });
    await recategoriseFromSummary(deps(), args());
    expect(persistLlmCategoryWithPrecedence).not.toHaveBeenCalled();

    // Test null / failure
    (categoriseFromSummary as jest.Mock).mockResolvedValue(null);
    await recategoriseFromSummary(deps(), args());
    expect(persistLlmCategoryWithPrecedence).not.toHaveBeenCalled();
  });

  it("does not update if LLM category name cannot be resolved to a contextId", async () => {
    mockCategoryRulesService.peekMatchingRuleWithTrace.mockResolvedValue({
      match: null,
      snapshot: undefined,
    });
    getThreadSummary.mockResolvedValue("Thread contains a verified bug fix.");
    (categoriseFromSummary as jest.Mock).mockResolvedValue({
      categoryNumber: 3,
      categoryName: "A brand new category that does not exist in user context",
      categoryConfidence: "HIGH",
      reasoning: "New category",
    });

    await recategoriseFromSummary(deps(), args());
    expect(persistLlmCategoryWithPrecedence).not.toHaveBeenCalled();
  });

  it("does not update if resolved categoryId is the same as the current thread categoryId", async () => {
    mockCategoryRulesService.peekMatchingRuleWithTrace.mockResolvedValue({
      match: null,
      snapshot: undefined,
    });
    getThreadSummary.mockResolvedValue("Thread contains a verified bug fix.");
    (categoriseFromSummary as jest.Mock).mockResolvedValue({
      categoryNumber: 1,
      categoryName: "QA failed",
      categoryConfidence: "HIGH",
      reasoning: "Already QA failed",
    });

    const argsWithMatchingCategory = {
      ...args(),
      thread: { ...thread, categoryId: "cat-1" } as unknown as EmailThread,
    };

    await recategoriseFromSummary(deps(), argsWithMatchingCategory);
    expect(persistLlmCategoryWithPrecedence).not.toHaveBeenCalled();
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
