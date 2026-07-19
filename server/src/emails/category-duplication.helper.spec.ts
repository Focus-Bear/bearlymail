import {
  DUPLICATION_SIMILARITY_THRESHOLD,
  findNearestExistingCategory,
} from "./category-duplication.helper";

describe("findNearestExistingCategory", () => {
  const existing = [
    "📝 Meeting Recaps & Summaries",
    "🤖 Automated Meeting Records",
    "💰 Payments & Financials",
    "Newsletters",
  ];

  it("flags a near-duplicate proto of an existing category", () => {
    const result = findNearestExistingCategory(
      "📝 Meeting Summaries",
      existing,
    );
    expect(result?.name).toBe("📝 Meeting Recaps & Summaries");
    expect(result?.similarity).toBeGreaterThanOrEqual(
      DUPLICATION_SIMILARITY_THRESHOLD,
    );
    expect(result?.flagged).toBe(true);
  });

  it("ignores emoji and punctuation when comparing", () => {
    const result = findNearestExistingCategory("Payments and Financials", [
      "💰 Payments & Financials",
    ]);
    expect(result?.flagged).toBe(true);
  });

  it("returns null for a genuinely distinct category with zero overlap", () => {
    const result = findNearestExistingCategory(
      "🚀 Startup Accelerators",
      existing,
    );
    expect(result).toBeNull();
  });

  it("matches but does not flag a category with low but non-zero overlap", () => {
    const result = findNearestExistingCategory("Automated Startup", existing);
    expect(result?.name).toBe("🤖 Automated Meeting Records");
    expect(result?.flagged).toBe(false);
  });

  it("returns null when there are no existing categories", () => {
    expect(findNearestExistingCategory("Anything", [])).toBeNull();
  });

  it("returns null for an empty target", () => {
    expect(findNearestExistingCategory(null, existing)).toBeNull();
  });
});
