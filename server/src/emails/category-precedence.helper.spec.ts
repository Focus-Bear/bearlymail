import { Repository } from "typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import {
  categorySourceRank,
  overridableCategorySources,
  updateThreadCategoryWithPrecedence,
} from "./category-precedence.helper";

describe("category precedence ranking", () => {
  it("ranks user above every automated writer", () => {
    for (const source of ["rule", "local", "priority", "summary"]) {
      expect(categorySourceRank("user")).toBeGreaterThan(
        categorySourceRank(source),
      );
    }
  });

  it("ranks rule above local/priority, which tie", () => {
    expect(categorySourceRank("rule")).toBeGreaterThan(
      categorySourceRank("local"),
    );
    expect(categorySourceRank("local")).toBe(categorySourceRank("priority"));
  });

  it("treats null and unknown stored sources as rank 0", () => {
    expect(categorySourceRank(null)).toBe(0);
    expect(categorySourceRank(undefined)).toBe(0);
    expect(categorySourceRank("garbage")).toBe(0);
  });

  it("lets the LLM (priority) replace another automated pick but not rule/user", () => {
    const overridable = overridableCategorySources("priority");
    expect(overridable).toEqual(
      expect.arrayContaining(["local", "priority", "summary"]),
    );
    expect(overridable).not.toContain("rule");
    expect(overridable).not.toContain("user");
  });

  it("lets a rule replace automated picks but never a user override", () => {
    const overridable = overridableCategorySources("rule");
    expect(overridable).toEqual(
      expect.arrayContaining(["rule", "local", "priority", "summary"]),
    );
    expect(overridable).not.toContain("user");
  });

  it("gives proto promotion no stored source to override (null-only fills)", () => {
    // 'proto' is never stored, so promotion can only touch rows whose
    // categorySource is NULL (handled by the IS NULL branch of the SQL guard).
    const overridable = overridableCategorySources("proto");
    expect(overridable).toEqual(["proto"]);
  });
});

describe("updateThreadCategoryWithPrecedence", () => {
  const makeRepo = (affected: number) => {
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
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    } as unknown as Repository<EmailThread>;
    return { repository, builder };
  };

  it("applies the where filter plus the categorySource guard", async () => {
    const { repository, builder } = makeRepo(1);

    const applied = await updateThreadCategoryWithPrecedence(repository, {
      where: { id: "thread-1" },
      source: "priority",
      set: { categoryId: "cat-1", categorySource: "priority" },
    });

    expect(applied).toBe(1);
    expect(builder.set).toHaveBeenCalledWith({
      categoryId: "cat-1",
      categorySource: "priority",
    });
    expect(builder.andWhere).toHaveBeenCalledWith('"id" = :where_id', {
      where_id: "thread-1",
    });
    const guardCall = builder.andWhere.mock.calls.find(([clause]) =>
      String(clause).includes("categorySource"),
    );
    expect(guardCall?.[0]).toContain('"categorySource" IS NULL');
    expect(guardCall?.[1]?.overridableSources).not.toContain("user");
    expect(guardCall?.[1]?.overridableSources).not.toContain("rule");
  });

  it("returns 0 when the guard blocks the write", async () => {
    const { repository } = makeRepo(0);

    const applied = await updateThreadCategoryWithPrecedence(repository, {
      where: { id: "thread-1" },
      source: "local",
      set: { categoryId: "cat-2", categorySource: "local" },
    });

    expect(applied).toBe(0);
  });

  it("refuses an empty where filter (would be a near-table-wide update)", async () => {
    const { repository, builder } = makeRepo(1);

    await expect(
      updateThreadCategoryWithPrecedence(repository, {
        where: {},
        source: "priority",
        set: { categoryId: "cat-1" },
      }),
    ).rejects.toThrow("'where' criteria cannot be empty");
    expect(builder.execute).not.toHaveBeenCalled();
  });

  it("updates nothing when an explicit empty id list is provided", async () => {
    const { repository, builder } = makeRepo(1);

    const applied = await updateThreadCategoryWithPrecedence(repository, {
      where: { protoCategoryId: "proto-1" },
      whereIdIn: [],
      source: "rule",
      set: { categoryId: "cat-1" },
    });

    // Skipping the IN clause would widen the update to every `where` match.
    expect(applied).toBe(0);
    expect(builder.execute).not.toHaveBeenCalled();
  });

  it("supports bulk filters for proto promotion", async () => {
    const { repository, builder } = makeRepo(3);

    await updateThreadCategoryWithPrecedence(repository, {
      where: { protoCategoryId: "proto-1" },
      source: "proto",
      set: { categoryId: "cat-3", categorySource: null, protoCategoryId: null },
    });

    expect(builder.andWhere).toHaveBeenCalledWith(
      '"protoCategoryId" = :where_protoCategoryId',
      { where_protoCategoryId: "proto-1" },
    );
  });

  describe("newer email in the thread", () => {
    const CLOSED_EMAIL_ID = "email-closed";
    const CLOSED_RECEIVED_AT = "2026-11-05T10:11:25.000Z";

    const newerEmailGuardCall = (builder: { andWhere: jest.Mock }) =>
      builder.andWhere.mock.calls.find(([clause]) =>
        String(clause).includes("NOT EXISTS"),
      );

    it("refuses a decision from an older email once the thread holds a newer one", async () => {
      // A "Closed as completed" notification re-run after the thread's later
      // "QA Status: Pass" comment must not refile the thread.
      const { repository, builder } = makeRepo(0);

      const applied = await updateThreadCategoryWithPrecedence(repository, {
        where: { id: "thread-1" },
        source: "rule",
        set: {
          categoryId: "cat-status-updates",
          categorySource: "rule",
          categoryDecisionTrace: {
            decidedAt: "2026-11-10T10:30:21.918Z",
            source: "rule",
            analyzedEmail: {
              emailId: CLOSED_EMAIL_ID,
              receivedAt: CLOSED_RECEIVED_AT,
            },
            finalCategory: "Human GitHub issue status updates",
            finalCategoryId: "cat-status-updates",
            steps: [],
          },
        },
      });

      expect(applied).toBe(0);
      const guardCall = newerEmailGuardCall(builder);
      expect(guardCall?.[0]).toContain('"newerEmail"."receivedAt" >');
      expect(guardCall?.[0]).toContain('"email_threads"."id"');
      expect(guardCall?.[1]).toEqual({
        analyzedEmailId: CLOSED_EMAIL_ID,
        analyzedEmailReceivedAt: new Date(CLOSED_RECEIVED_AT),
      });
    });

    it("passes the received time as a Date, so it is compared in the zone receivedAt was written in", async () => {
      // emails.receivedAt is a timestamp without time zone. Postgres ignores the
      // "Z" on an ISO string, so on a server not running in UTC a string would be
      // compared hours off and an older email would look newer.
      const { repository, builder } = makeRepo(1);

      await updateThreadCategoryWithPrecedence(repository, {
        where: { id: "thread-1" },
        source: "rule",
        set: {
          categoryDecisionTrace: {
            decidedAt: "2026-11-10T10:30:21.918Z",
            source: "rule",
            analyzedEmail: {
              emailId: CLOSED_EMAIL_ID,
              receivedAt: CLOSED_RECEIVED_AT,
            },
            finalCategory: "Human GitHub issue status updates",
            finalCategoryId: "cat-status-updates",
            steps: [],
          },
        },
      });

      const receivedAtParam =
        newerEmailGuardCall(builder)?.[1]?.analyzedEmailReceivedAt;
      expect(receivedAtParam).toBeInstanceOf(Date);
      expect((receivedAtParam as Date).toISOString()).toBe(CLOSED_RECEIVED_AT);
    });

    it("excludes the analysed email itself so it can never block its own write", async () => {
      const { repository, builder } = makeRepo(1);

      await updateThreadCategoryWithPrecedence(repository, {
        where: { id: "thread-1" },
        source: "priority",
        set: {
          categoryDecisionTrace: {
            decidedAt: "2026-11-10T10:30:21.918Z",
            source: "priority",
            analyzedEmail: {
              emailId: "email-qa-pass",
              receivedAt: "2026-11-10T10:29:04.000Z",
            },
            finalCategory: "Github QA passed issues",
            finalCategoryId: "cat-qa-passed",
            steps: [],
          },
        },
      });

      expect(newerEmailGuardCall(builder)?.[0]).toContain(
        '"newerEmail"."id" <> :analyzedEmailId',
      );
    });

    it("adds no newer-email guard when the write names no analysed email (bulk writers)", async () => {
      for (const set of [
        { categoryId: "cat-1" },
        {
          categoryDecisionTrace: {
            decidedAt: "2026-11-10T10:30:21.918Z",
            source: "rule" as const,
            finalCategory: "Invoices",
            finalCategoryId: "cat-1",
            steps: [],
          },
        },
        {
          categoryDecisionTrace: {
            decidedAt: "2026-11-10T10:30:21.918Z",
            source: "rule" as const,
            analyzedEmail: { emailId: "email-undated", receivedAt: null },
            finalCategory: "Invoices",
            finalCategoryId: "cat-1",
            steps: [],
          },
        },
        {
          categoryDecisionTrace: {
            decidedAt: "2026-11-10T10:30:21.918Z",
            source: "rule" as const,
            analyzedEmail: {
              emailId: "email-bad-date",
              receivedAt: "not-a-date",
            },
            finalCategory: "Invoices",
            finalCategoryId: "cat-1",
            steps: [],
          },
        },
      ]) {
        const { repository, builder } = makeRepo(1);
        await updateThreadCategoryWithPrecedence(repository, {
          where: { id: "thread-1" },
          source: "rule",
          set,
        });
        expect(newerEmailGuardCall(builder)).toBeUndefined();
      }
    });
  });
});
