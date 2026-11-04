import type { Repository } from "typeorm";

import type { Email } from "../database/entities/email.entity";
import type { User } from "../database/entities/user.entity";
import {
  ContextKey,
  type UserContext,
} from "../database/entities/user-context.entity";
import { PriorityCacheService } from "./priority-cache.service";

const USER_ID = "user-1";

function context(contextKey: ContextKey, contextValue: string): UserContext {
  return { contextKey, contextValue, userId: USER_ID } as UserContext;
}

function buildService(find: jest.Mock): PriorityCacheService {
  return new PriorityCacheService(
    { find } as unknown as Repository<UserContext>,
    {} as Repository<Email>,
    {} as Repository<User>,
  );
}

describe("PriorityCacheService.getUserContexts", () => {
  it("re-reads contexts until the user has a category, so onboarding's new categories are seen at once", async () => {
    const category = context(ContextKey.EMAIL_CATEGORY, "🎧 Customer Support");
    const find = jest
      .fn()
      .mockResolvedValueOnce([context(ContextKey.MY_GOALS, "Ship v2")])
      .mockResolvedValueOnce([category]);
    const service = buildService(find);

    await service.getUserContexts(USER_ID);
    const second = await service.getUserContexts(USER_ID);

    expect(find).toHaveBeenCalledTimes(2);
    expect(second).toEqual([category]);
  });

  it("caches contexts once they include a category", async () => {
    const find = jest
      .fn()
      .mockResolvedValue([
        context(ContextKey.EMAIL_CATEGORY, "🎧 Customer Support"),
      ]);
    const service = buildService(find);

    await service.getUserContexts(USER_ID);
    await service.getUserContexts(USER_ID);

    expect(find).toHaveBeenCalledTimes(1);
  });
});
