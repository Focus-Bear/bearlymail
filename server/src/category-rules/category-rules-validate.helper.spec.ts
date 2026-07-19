import { Repository } from "typeorm";

import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import {
  buildCategoryNameToContextIdMap,
  findCategoryContextIdByName,
} from "./category-rules-validate.helper";

const makeContextRepo = (
  rows: Partial<UserContext>[],
): Repository<UserContext> =>
  ({
    find: jest.fn().mockResolvedValue(rows),
  }) as unknown as Repository<UserContext>;

describe("findCategoryContextIdByName", () => {
  const userId = "user-1";

  const makeRepo = makeContextRepo;

  it("matches a category whose contextValue carries a description", async () => {
    // Stored as "Name - Description"; the rule only knows the bare name.
    const repo = makeRepo([
      {
        contextId: "cat-1",
        contextValue: "Security & Compliance - AWS and security alerts",
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    ]);

    const id = await findCategoryContextIdByName(
      repo,
      userId,
      "Security & Compliance",
    );

    expect(id).toBe("cat-1");
  });

  it("matches a category with no description", async () => {
    const repo = makeRepo([
      {
        contextId: "cat-2",
        contextValue: "Billing",
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    ]);

    const id = await findCategoryContextIdByName(repo, userId, "Billing");

    expect(id).toBe("cat-2");
  });

  it("is case-insensitive on the name portion", async () => {
    const repo = makeRepo([
      {
        contextId: "cat-3",
        contextValue: "GitHub Notifications - PR and issue updates",
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    ]);

    const id = await findCategoryContextIdByName(
      repo,
      userId,
      "github notifications",
    );

    expect(id).toBe("cat-3");
  });

  it("tolerates a leading emoji prefix on either side", async () => {
    const repo = makeRepo([
      {
        contextId: "cat-emoji",
        contextValue: "🎧 Media & Communications - university comms",
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    ]);

    // A rule stored the bare name (no emoji) — it must still resolve.
    const byBareName = await findCategoryContextIdByName(
      repo,
      userId,
      "Media & Communications",
    );
    // ...and a name that itself carries the emoji resolves too.
    const byEmojiName = await findCategoryContextIdByName(
      repo,
      userId,
      "🎧 Media & Communications",
    );

    expect(byBareName).toBe("cat-emoji");
    expect(byEmojiName).toBe("cat-emoji");
  });

  it("returns null when no category name matches", async () => {
    const repo = makeRepo([
      {
        contextId: "cat-4",
        contextValue: "Billing - Payment receipts",
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    ]);

    const id = await findCategoryContextIdByName(repo, userId, "Marketing");

    expect(id).toBeNull();
  });

  it("returns null for an empty category name", async () => {
    const repo = makeRepo([
      {
        contextId: "cat-5",
        contextValue: "Billing - Payment receipts",
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    ]);

    const id = await findCategoryContextIdByName(repo, userId, "   ");

    expect(id).toBeNull();
  });
});

describe("buildCategoryNameToContextIdMap", () => {
  const userId = "user-1";

  it("keys parsed names (lowercased) to their contextId", async () => {
    const repo = makeContextRepo([
      {
        contextId: "cat-1",
        contextValue: "Security & Compliance - AWS and security alerts",
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
      {
        contextId: "cat-2",
        contextValue: "Billing",
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    ]);

    const map = await buildCategoryNameToContextIdMap(repo, userId);

    expect(map.get("security & compliance")).toBe("cat-1");
    expect(map.get("billing")).toBe("cat-2");
    expect(map.size).toBe(2);
  });

  it("keeps the first context when two share a parsed name", async () => {
    const repo = makeContextRepo([
      {
        contextId: "cat-first",
        contextValue: "Billing - Receipts",
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
      {
        contextId: "cat-dupe",
        contextValue: "Billing - Invoices",
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    ]);

    const map = await buildCategoryNameToContextIdMap(repo, userId);

    expect(map.get("billing")).toBe("cat-first");
  });

  it("skips contexts with an empty value", async () => {
    const repo = makeContextRepo([
      {
        contextId: "cat-empty",
        contextValue: "",
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
    ]);

    const map = await buildCategoryNameToContextIdMap(repo, userId);

    expect(map.size).toBe(0);
  });
});
