import {
  resolveCategoryNumber,
  resolveResponseCategory,
} from "./category-number.util";

describe("category number resolution", () => {
  const categories = ["Sales pipeline", "🤖 GitHub Bot PR Updates"];

  it("maps the returned number by the exact prompt order", () => {
    expect(resolveCategoryNumber(2, categories)).toBe(
      "🤖 GitHub Bot PR Updates",
    );
  });

  it("does not guess when a number is invalid", () => {
    expect(resolveCategoryNumber(3, categories)).toBe("Other");
  });

  it("recovers only exact legacy names, ignoring emoji and case", () => {
    expect(
      resolveResponseCategory(
        { category: "github bot pr updates" },
        categories,
      ),
    ).toBe("🤖 GitHub Bot PR Updates");
    expect(
      resolveResponseCategory({ category: "GitHub PR Updates" }, categories),
    ).toBe("Other");
  });
});
