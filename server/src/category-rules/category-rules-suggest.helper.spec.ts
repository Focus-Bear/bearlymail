import { Repository } from "typeorm";

import { CategoryRule } from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { LLMCategoriesService } from "../llm/llm-categories.service";
import { buildSuggestions } from "./category-rules-suggest.helper";

/**
 * Regression coverage for the category filter in the suggest pipeline: the
 * helper used to resolve the requested category with a private whole-value
 * compare (`contextValue === name`), so any category stored in the
 * "Name - Description" format silently resolved to null and suggestions fell
 * back to ALL emails. It now delegates to the canonical parsed-name resolver.
 */
describe("buildSuggestions category resolution", () => {
  const userId = "user-1";

  const makeQueryBuilder = (rows: unknown[]) => {
    const qb = {
      select: jest.fn(),
      addSelect: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      innerJoin: jest.fn(),
      groupBy: jest.fn(),
      having: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      take: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue(rows),
      getMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({ cnt: "0" }),
    };
    for (const key of Object.keys(qb)) {
      const fn = qb[key as keyof typeof qb] as jest.Mock;
      if (!key.startsWith("get")) {
        fn.mockReturnValue(qb);
      }
    }
    return qb;
  };

  it("filters candidate senders by the UUID of a described category", async () => {
    const qb = makeQueryBuilder([]);
    const emailRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<Email>;
    const userContextRepository = {
      find: jest.fn().mockResolvedValue([
        {
          contextId: "cat-uuid-1",
          contextValue: "Invoices - billing and payment emails",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]),
    } as unknown as Repository<UserContext>;
    const ruleRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<CategoryRule>;

    const suggestions = await buildSuggestions(
      {
        email: emailRepository,
        rule: ruleRepository,
        userContext: userContextRepository,
      },
      userId,
      "Invoices",
      (raw) => raw.trim().toLowerCase(),
      {} as LLMCategoriesService,
    );

    expect(suggestions).toEqual([]);
    // The described category resolves to its contextId, so the candidate query
    // joins email_threads filtered on that UUID (previously: no join at all).
    expect(qb.innerJoin).toHaveBeenCalledWith(
      "email_threads",
      "thread",
      expect.stringContaining("thread.categoryId = :categoryId"),
      { categoryId: "cat-uuid-1" },
    );
  });
});
