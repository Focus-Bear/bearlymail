import type { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import type { EmailThread } from "../database/entities/email-thread.entity";
import { persistCategoryDecisionTraceOnly } from "./category-column-updates.helper";
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
