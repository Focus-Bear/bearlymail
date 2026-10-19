import type { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import { JEV_DECISION_PROVIDER } from "../constants/ai-decision-provider.constants";
import type { EmailThread } from "../database/entities/email-thread.entity";
import { LLMProvider } from "../llm/llm.types";
import {
  buildCategoryColumnUpdates,
  persistCategoryDecisionTraceOnly,
  persistLlmCategoryWithPrecedence,
} from "./category-column-updates.helper";
import type { CategoryDecisionTrace } from "./category-decision-trace.types";
import { updateThreadCategoryWithPrecedence } from "./category-precedence.helper";

jest.mock("./category-precedence.helper", () => ({
  ...jest.requireActual("./category-precedence.helper"),
  updateThreadCategoryWithPrecedence: jest.fn(),
}));

const updateMock = updateThreadCategoryWithPrecedence as jest.Mock;

describe("persistCategoryDecisionTraceOnly", () => {
  const repository = {} as Repository<EmailThread>;
  const logger = { log: jest.fn() } as unknown as Logger;
  const decisionTrace = {
    decidedAt: "2026-09-04T13:11:00.000Z",
    source: "priority",
    finalCategory: "QA failed",
    finalCategoryId: "cat-1",
    steps: [],
  } as CategoryDecisionTrace;

  beforeEach(() => jest.clearAllMocks());

  it("writes ONLY the decision trace, as an automated (priority) writer through the precedence guard", async () => {
    updateMock.mockResolvedValue(1);

    await persistCategoryDecisionTraceOnly(repository, logger, {
      emailThreadId: "thread-1",
      workerId: "worker-1",
      decisionTrace,
    });

    expect(updateMock).toHaveBeenCalledWith(repository, {
      where: { id: "thread-1" },
      source: "priority",
      set: { categoryDecisionTrace: decisionTrace },
    });
    expect(logger.log).not.toHaveBeenCalled();
  });

  it("logs (and keeps the stored trace) when a user/rule-pinned category blocks the write", async () => {
    updateMock.mockResolvedValue(0);

    await persistCategoryDecisionTraceOnly(repository, logger, {
      emailThreadId: "thread-1",
      workerId: "worker-1",
      decisionTrace,
    });

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("blocked by precedence"),
    );
  });
});

describe("buildCategoryColumnUpdates — categoryDecisionProvider", () => {
  it("stores the AI engine alongside an AI (priority) category", () => {
    expect(
      buildCategoryColumnUpdates(
        "cat-1",
        "Invoices",
        undefined,
        "priority",
        LLMProvider.GEMINI,
      ),
    ).toEqual({
      categoryId: "cat-1",
      categorySource: "priority",
      categoryDecisionProvider: LLMProvider.GEMINI,
    });
  });

  it("clears the provider when a rule supplied the category", () => {
    expect(
      buildCategoryColumnUpdates(
        "cat-1",
        "Invoices",
        undefined,
        "rule",
        JEV_DECISION_PROVIDER,
      ).categoryDecisionProvider,
    ).toBeNull();
  });

  it('clears the provider on an "Other" verdict (no category source)', () => {
    expect(
      buildCategoryColumnUpdates(
        null,
        "Other",
        undefined,
        "priority",
        LLMProvider.OPENAI,
      ),
    ).toEqual({
      categoryId: null,
      categorySource: null,
      categoryDecisionProvider: null,
    });
  });
});

describe("persistLlmCategoryWithPrecedence — decision provider", () => {
  const repository = {} as Repository<EmailThread>;
  const logger = { log: jest.fn() } as unknown as Logger;
  const baseArgs = {
    emailThreadId: "thread-1",
    workerId: "w1",
    ruleCategoryId: null,
    categoryRuleTrace: undefined,
    categoryId: "cat-1",
    finalCategory: "Invoices",
    protoCategoryId: null,
    resolvedCategoryExplanation: "because",
    decisionTrace: {} as CategoryDecisionTrace,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    updateMock.mockResolvedValue(1);
  });

  it("writes the provider that picked an AI category", async () => {
    await persistLlmCategoryWithPrecedence(repository, logger, {
      ...baseArgs,
      decisionProvider: JEV_DECISION_PROVIDER,
    });
    expect(updateMock).toHaveBeenCalledWith(
      repository,
      expect.objectContaining({
        source: "priority",
        set: expect.objectContaining({
          categoryDecisionProvider: JEV_DECISION_PROVIDER,
        }),
      }),
    );
  });

  it("writes null (generic AI label) when the provider is unknown", async () => {
    await persistLlmCategoryWithPrecedence(repository, logger, baseArgs);
    expect(updateMock.mock.calls[0][1].set.categoryDecisionProvider).toBeNull();
  });
});
