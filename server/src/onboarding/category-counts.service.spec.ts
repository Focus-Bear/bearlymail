import type { Repository } from "typeorm";

import { STAR_COUNTS } from "../constants/priority-constants";
import type { ContextCrudService } from "../context/context-crud.service";
import type { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  type UserContext,
} from "../database/entities/user-context.entity";
import {
  buildCategoryCounts,
  CategoryCountsService,
} from "./category-counts.service";

const SUPPORT_ID = "cat-support";
const BUGS_ID = "cat-bugs";

function context(
  contextId: string,
  contextKey: ContextKey,
  contextValue: string,
): UserContext {
  return { contextId, contextKey, contextValue } as UserContext;
}

const CONTEXTS = [
  context(SUPPORT_ID, ContextKey.EMAIL_CATEGORY, "🎧 Customer Support - Help"),
  context(BUGS_ID, ContextKey.EMAIL_CATEGORY, "🐞 Bug Reports"),
  context("vip-1", ContextKey.VIP_CONTACT, "Bryan"),
];

describe("buildCategoryCounts", () => {
  it("names each category, lists empty ones at 0 and sorts largest first", () => {
    const counts = buildCategoryCounts(
      [
        { categoryId: SUPPORT_ID, count: 40 },
        { categoryId: null, count: "12" },
      ],
      CONTEXTS,
    );

    expect(counts).toEqual([
      { categoryId: SUPPORT_ID, name: "🎧 Customer Support", count: 40 },
      { categoryId: null, name: null, count: 12 },
      { categoryId: BUGS_ID, name: "🐞 Bug Reports", count: 0 },
    ]);
  });

  it("counts threads pointing at a deleted category as Other", () => {
    const counts = buildCategoryCounts(
      [
        { categoryId: "deleted-category", count: 3 },
        { categoryId: null, count: 2 },
      ],
      CONTEXTS,
    );

    expect(counts.find((entry) => entry.categoryId === null)?.count).toBe(5);
  });
});

describe("CategoryCountsService", () => {
  it("counts only settled, untriaged, non-archived threads", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new CategoryCountsService(
      { query } as unknown as Repository<EmailThread>,
      {
        getUserContext: jest.fn().mockResolvedValue(CONTEXTS),
      } as unknown as ContextCrudService,
    );

    await service.getCategoryCounts("user-1");

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('"isArchived" = false');
    expect(sql).toContain('"aiProcessingDeferred" = true');
    expect(sql).toContain('GROUP BY "categoryId"');
    expect(params).toEqual(["user-1", STAR_COUNTS.NONE]);
  });
});
