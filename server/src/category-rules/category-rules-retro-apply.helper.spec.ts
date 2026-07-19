import { Repository } from "typeorm";

import { CompositeCategoryRuleSpec } from "../database/entities/category-rule.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  retroApplyCompositeRuleToRecentThreads,
  RetroApplyRow,
  selectRetroApplyThreadIds,
} from "./category-rules-retro-apply.helper";

const SPEC: CompositeCategoryRuleSpec = {
  v: 2,
  senderMatchesAny: ["*@github.com"],
  subjectContainsAny: ["QA Passed"],
  bodyContainsAny: ["QA Passed"],
  subjectNotContainsAny: ["failed"],
  bodyNotContainsAny: [],
};

const normaliseSender = (raw: string) => raw.trim().toLowerCase();

const makeRow = (overrides: Partial<RetroApplyRow>): RetroApplyRow => ({
  threadId: "t-1",
  from: "notifications@github.com",
  subject: "QA Passed on mobile-app",
  body: "QA Passed for build 42",
  htmlBody: null,
  categoryId: null,
  ...overrides,
});

describe("selectRetroApplyThreadIds", () => {
  it("selects matching threads not already in the target category", () => {
    const rows = [
      makeRow({ threadId: "t-other" }),
      makeRow({ threadId: "t-wrong-cat", categoryId: "cat-bot" }),
      makeRow({ threadId: "t-already", categoryId: "cat-target" }),
      makeRow({
        threadId: "t-no-match",
        subject: "Deploy started",
        body: "Deploy started",
      }),
      makeRow({
        threadId: "t-excluded",
        subject: "QA Passed but build failed",
      }),
    ];

    const ids = selectRetroApplyThreadIds(
      rows,
      SPEC,
      normaliseSender,
      "cat-target",
    );

    // "Other" threads AND mis-categorised threads are re-filed; threads
    // already in the target category, non-matches, and NOT-contains
    // exclusions are skipped.
    expect(ids).toEqual(["t-other", "t-wrong-cat"]);
  });
});

describe("retroApplyCompositeRuleToRecentThreads", () => {
  const makeRepo = (rows: RetroApplyRow[], affected: number) => {
    const builder = {
      update: jest.fn(),
      set: jest.fn(),
      andWhere: jest.fn(),
      execute: jest.fn().mockResolvedValue({ affected }),
    };
    builder.update.mockReturnValue(builder);
    builder.set.mockReturnValue(builder);
    builder.andWhere.mockReturnValue(builder);
    const repository = {
      manager: { query: jest.fn().mockResolvedValue(rows) },
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    } as unknown as Repository<EmailThread>;
    return { repository, builder };
  };

  const args = {
    userId: "user-1",
    ruleId: "rule-1",
    categoryId: "cat-target",
    categoryName: "GitHub QA passed",
    spec: SPEC,
  };

  it("re-files matched threads through the precedence guard", async () => {
    const { repository, builder } = makeRepo(
      [makeRow({ threadId: "t-1" }), makeRow({ threadId: "t-2" })],
      2,
    );

    const result = await retroApplyCompositeRuleToRecentThreads(
      { emailThreadRepository: repository, normaliseSender },
      args,
    );

    expect(result).toEqual({ scanned: 2, matched: 2, applied: 2 });
    expect(builder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: "cat-target",
        categorySource: "rule",
        protoCategoryId: null,
      }),
    );
    expect(builder.andWhere).toHaveBeenCalledWith('"id" IN (:...whereIdIn)', {
      whereIdIn: ["t-1", "t-2"],
    });
    // The precedence guard clause must be present so user-pinned threads are
    // never moved.
    const guardCall = (builder.andWhere as jest.Mock).mock.calls.find(
      ([clause]) => String(clause).includes("categorySource"),
    );
    expect(guardCall?.[1]?.overridableSources).not.toContain("user");
  });

  it("does nothing when no thread matches", async () => {
    const { repository, builder } = makeRepo(
      [makeRow({ threadId: "t-1", subject: "Deploy", body: "Deploy" })],
      0,
    );

    const result = await retroApplyCompositeRuleToRecentThreads(
      { emailThreadRepository: repository, normaliseSender },
      args,
    );

    expect(result).toEqual({ scanned: 1, matched: 0, applied: 0 });
    expect(builder.execute).not.toHaveBeenCalled();
  });

  it("never throws — a retro-apply failure must not fail the rule CRUD", async () => {
    const repository = {
      manager: { query: jest.fn().mockRejectedValue(new Error("db down")) },
    } as unknown as Repository<EmailThread>;

    const result = await retroApplyCompositeRuleToRecentThreads(
      { emailThreadRepository: repository, normaliseSender },
      args,
    );

    expect(result).toEqual({ scanned: 0, matched: 0, applied: 0 });
  });
});
