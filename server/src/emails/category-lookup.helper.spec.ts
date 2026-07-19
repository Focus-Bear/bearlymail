import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import {
  makeCategoryContextIdLookup,
  preferRuleCategoryWhenNameUnresolved,
  resolveRuleCategory,
} from "./category-lookup.helper";

const cat = (contextId: string, contextValue: string): UserContext =>
  ({
    contextId,
    contextKey: ContextKey.EMAIL_CATEGORY,
    contextValue,
  }) as unknown as UserContext;

const notACategory = {
  contextId: "ctx-vip",
  contextKey: ContextKey.VIP_CONTACT,
  contextValue: "someone@example.com",
} as unknown as UserContext;

describe("resolveRuleCategory", () => {
  const contexts = [
    cat("ctx-status", "🐛 Status updates - desc"),
    notACategory,
  ];

  it("returns the live category for a valid rule categoryId", () => {
    expect(resolveRuleCategory(contexts, "ctx-status")).toEqual({
      categoryId: "ctx-status",
      name: "🐛 Status updates",
    });
  });

  it("returns null when the rule has no category link", () => {
    expect(resolveRuleCategory(contexts, null)).toBeNull();
    expect(resolveRuleCategory(contexts, undefined)).toBeNull();
  });

  it("returns null when the linked category no longer exists", () => {
    expect(resolveRuleCategory(contexts, "ctx-gone")).toBeNull();
  });

  it("ignores a contextId that is not an EMAIL_CATEGORY", () => {
    expect(resolveRuleCategory(contexts, "ctx-vip")).toBeNull();
  });
});

describe("preferRuleCategoryWhenNameUnresolved", () => {
  const contexts = [cat("ctx-status", "🐛 Status updates - desc")];

  it("keeps an already-resolved categoryId untouched", () => {
    expect(
      preferRuleCategoryWhenNameUnresolved(
        "ctx-existing",
        "Whatever",
        contexts,
        "ctx-status",
      ),
    ).toEqual({ categoryId: "ctx-existing", finalCategory: "Whatever" });
  });

  it("rescues an unresolved name via the rule's categoryId", () => {
    expect(
      preferRuleCategoryWhenNameUnresolved(
        null,
        "Old renamed name",
        contexts,
        "ctx-status",
      ),
    ).toEqual({ categoryId: "ctx-status", finalCategory: "🐛 Status updates" });
  });

  it("leaves it unresolved when the rule has no usable categoryId", () => {
    expect(
      preferRuleCategoryWhenNameUnresolved(
        null,
        "Orphan",
        contexts,
        "ctx-gone",
      ),
    ).toEqual({ categoryId: null, finalCategory: "Orphan" });
  });
});

describe("makeCategoryContextIdLookup", () => {
  const lookup = makeCategoryContextIdLookup([
    cat("ctx-a", "Alpha - a"),
    notACategory,
  ]);

  it("resolves a known category name to its id and ignores non-categories", () => {
    expect(lookup("Alpha")).toBe("ctx-a");
    expect(lookup("Unknown")).toBeNull();
    expect(lookup(null)).toBeNull();
  });
});
