import {
  hasCategoryNumber,
  resolveCategoryNumber,
  rewriteCategoryNumberReferences,
} from "./category-number.util";

describe("resolveCategoryNumber", () => {
  const ordered = [
    "🔧 GitHub PR Updates",
    "❌ CI/CD & QA Pipeline Failures",
    "📰 Newsletters",
  ];

  it("maps a 1-based number to the exact category by index", () => {
    expect(resolveCategoryNumber(1, ordered)).toBe("🔧 GitHub PR Updates");
    expect(resolveCategoryNumber(2, ordered)).toBe(
      "❌ CI/CD & QA Pipeline Failures",
    );
    expect(resolveCategoryNumber(3, ordered)).toBe("📰 Newsletters");
  });

  it("accepts a numeric string", () => {
    expect(resolveCategoryNumber("2", ordered)).toBe(
      "❌ CI/CD & QA Pipeline Failures",
    );
    expect(resolveCategoryNumber(" 1 ", ordered)).toBe("🔧 GitHub PR Updates");
  });

  it("returns Other for 0", () => {
    expect(resolveCategoryNumber(0, ordered)).toBe("Other");
  });

  it("returns Other for out-of-range / invalid / non-integer (never guesses)", () => {
    expect(resolveCategoryNumber(4, ordered)).toBe("Other");
    expect(resolveCategoryNumber(-1, ordered)).toBe("Other");
    expect(resolveCategoryNumber(1.5, ordered)).toBe("Other");
    expect(resolveCategoryNumber("two", ordered)).toBe("Other");
    expect(resolveCategoryNumber(null, ordered)).toBe("Other");
    expect(resolveCategoryNumber(undefined, ordered)).toBe("Other");
    expect(resolveCategoryNumber(1, [])).toBe("Other");
  });
});

describe("rewriteCategoryNumberReferences", () => {
  const ordered = [
    "🐛 Human-reported Bug Issues",
    "✅ Github QA passed issues",
    "📰 Newsletters",
  ];

  it("rewrites 'category N' references to the quoted category name", () => {
    expect(
      rewriteCategoryNumberReferences(
        "Chose category 2 because the email explicitly states 'QA PASS'. Considered category 1, but this is a QA result.",
        ordered,
      ),
    ).toBe(
      `Chose "✅ Github QA passed issues" because the email explicitly states 'QA PASS'. Considered "🐛 Human-reported Bug Issues", but this is a QA result.`,
    );
  });

  it("is case-insensitive and handles an optional #", () => {
    expect(rewriteCategoryNumberReferences("Category #3 fits", ordered)).toBe(
      `"📰 Newsletters" fits`,
    );
  });

  it("maps category 0 to Other", () => {
    expect(
      rewriteCategoryNumberReferences("Chose category 0 (no fit)", ordered),
    ).toBe(`Chose "Other" (no fit)`);
  });

  it("leaves out-of-range numbers untouched rather than guessing", () => {
    expect(
      rewriteCategoryNumberReferences("Considered category 15 too", ordered),
    ).toBe("Considered category 15 too");
  });

  it("leaves text without positional references unchanged", () => {
    const text = `Chose "📰 Newsletters" because it is a weekly digest.`;
    expect(rewriteCategoryNumberReferences(text, ordered)).toBe(text);
  });

  it("returns empty string for null/undefined", () => {
    expect(rewriteCategoryNumberReferences(null, ordered)).toBe("");
    expect(rewriteCategoryNumberReferences(undefined, ordered)).toBe("");
  });
});

describe("hasCategoryNumber", () => {
  it("is true for finite numbers and numeric strings", () => {
    expect(hasCategoryNumber(0)).toBe(true);
    expect(hasCategoryNumber(3)).toBe(true);
    expect(hasCategoryNumber("5")).toBe(true);
  });

  it("is false for non-numeric values", () => {
    expect(hasCategoryNumber("GitHub PR Updates")).toBe(false);
    expect(hasCategoryNumber(undefined)).toBe(false);
    expect(hasCategoryNumber(null)).toBe(false);
    expect(hasCategoryNumber(NaN)).toBe(false);
    expect(hasCategoryNumber("")).toBe(false);
  });
});
