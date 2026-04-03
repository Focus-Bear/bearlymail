import {
  allocateUniqueCategoryKey,
  baseSlugFromCategoryName,
  protoCategoryKey,
  resolveLlmCategoryToDisplayName,
} from "./category-key.util";

describe("category-key.util", () => {
  describe("baseSlugFromCategoryName", () => {
    it("slugifies typical names", () => {
      expect(
        baseSlugFromCategoryName(
          "Automated System Alerts from Sentry etc. (not github)",
        ),
      ).toBe("automated_system_alerts_from_sentry_etc_not_github");
    });

    it("handles emoji-heavy names", () => {
      expect(baseSlugFromCategoryName("📧 Newsletters & Updates")).toBe(
        "newsletters_updates",
      );
    });

    it("returns fallback for empty-after-strip", () => {
      expect(baseSlugFromCategoryName("🎉🎉")).toBe("category");
    });
  });

  describe("allocateUniqueCategoryKey", () => {
    it("adds numeric suffix on collision", () => {
      const used = new Set<string>();
      expect(allocateUniqueCategoryKey("Foo Bar", used)).toBe("foo_bar");
      expect(allocateUniqueCategoryKey("Foo Bar", used)).toBe("foo_bar_2");
    });
  });

  describe("protoCategoryKey", () => {
    it("prefixes proto uuid", () => {
      expect(protoCategoryKey("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
        "p_a1b2c3d4e5f67890abcdef1234567890",
      );
    });
  });

  describe("resolveLlmCategoryToDisplayName", () => {
    const emailCats = [
      { name: "Support", categoryKey: "customer_support" },
      { name: "Sales", categoryKey: "sales_team" },
    ];
    const protoCats = [{ name: "Proto A", categoryKey: "p_deadbeef" }];

    it("maps exact key match case-insensitive", () => {
      expect(
        resolveLlmCategoryToDisplayName("CUSTOMER_SUPPORT", emailCats, []),
      ).toBe("Support");
    });

    it("maps bracketed key", () => {
      expect(
        resolveLlmCategoryToDisplayName("[sales_team]", emailCats, []),
      ).toBe("Sales");
    });

    it("maps proto key", () => {
      expect(resolveLlmCategoryToDisplayName("p_deadbeef", [], protoCats)).toBe(
        "Proto A",
      );
    });

    it("passes through unknown strings", () => {
      expect(
        resolveLlmCategoryToDisplayName("Random Label", emailCats, []),
      ).toBe("Random Label");
    });
  });
});
