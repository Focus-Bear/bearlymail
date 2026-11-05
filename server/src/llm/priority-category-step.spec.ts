import type { CategoryShortlister } from "../shared/email-intelligence/category.types";
import type { CategoryModelClient } from "./llm-categorise-summary";
import {
  chooseEmailCategory,
  NO_USER_CATEGORIES_EXPLANATION,
} from "./priority-category-step";

const EMAIL = {
  from: "bryan@example.com",
  fromName: "Bryan",
  subject: "Help Needed with Account Access",
};
const BODY = "I can't log in to the app — please help me regain access.";
const OTHER = "Other";

function buildDeps(client: CategoryModelClient) {
  const shortlist: CategoryShortlister = {
    isShortlistEnabled: () => false,
    getShortlistWithMeta: jest.fn(),
  };
  return {
    llmCoreService: client,
    categoryShortlistService: shortlist,
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  };
}

describe("chooseEmailCategory", () => {
  it("does not ask any model to choose when the user has no categories yet", async () => {
    const client = {
      generateText: jest.fn(),
      categoriseWithJev: jest.fn(),
    };

    const chosen = await chooseEmailCategory(buildDeps(client), {
      email: EMAIL,
      userContext: { emailCategories: [], protoCategories: [] },
      cleanedBody: BODY,
    });

    expect(client.categoriseWithJev).not.toHaveBeenCalled();
    expect(client.generateText).not.toHaveBeenCalled();
    expect(chosen.categoryFields.category).toBe(OTHER);
    expect(chosen.categoryFields.categoryExplanation).toBe(
      NO_USER_CATEGORIES_EXPLANATION,
    );
    expect(chosen.modelUnavailable).toBe(false);
  });

  it("offers Jev exactly the user's own categories", async () => {
    const userCategories = [
      { name: "🔐 Login & Access", description: "Can't sign in" },
      { name: "💳 Billing & Refunds", description: "Charges and refunds" },
    ];
    const client = {
      generateText: jest.fn(),
      categoriseWithJev: jest.fn().mockResolvedValue({
        categoryNumber: 1,
        categoryName: "🔐 Login & Access",
        categoryConfidence: "HIGH",
        reasoning: 'Jev selected "🔐 Login & Access" (choice confidence 95%).',
      }),
    };

    const chosen = await chooseEmailCategory(buildDeps(client), {
      email: EMAIL,
      userContext: { emailCategories: userCategories },
      cleanedBody: BODY,
    });

    expect(client.categoriseWithJev).toHaveBeenCalledWith(
      expect.objectContaining({ categories: userCategories }),
      expect.any(Function),
    );
    expect(chosen.categoryFields.category).toBe("🔐 Login & Access");
  });
});
