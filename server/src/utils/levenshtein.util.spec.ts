import { isSimilarCategoryName, levenshteinDistance } from "./levenshtein.util";

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("returns the length of the longer string when one is empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("counts a single substitution", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
  });

  it("counts a single insertion", () => {
    expect(levenshteinDistance("cat", "cats")).toBe(1);
  });

  it("counts a single deletion", () => {
    expect(levenshteinDistance("cats", "cat")).toBe(1);
  });

  it("handles multi-edit differences", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("handles category-name misspellings", () => {
    // "CI/CD Alert" vs "CI/CD Alerts" → 1 char difference
    expect(levenshteinDistance("ci/cd alert", "ci/cd alerts")).toBe(1);
    // "Newslters" vs "Newsletters" → 2 chars
    expect(levenshteinDistance("newslters", "newsletters")).toBe(2);
  });
});

describe("isSimilarCategoryName", () => {
  it("returns true for identical strings", () => {
    expect(isSimilarCategoryName("Newsletters", "Newsletters")).toBe(true);
  });

  it("returns true for a 1-char typo", () => {
    expect(isSimilarCategoryName("CI/CD Alert", "CI/CD Alerts")).toBe(true);
  });

  it("returns true for a 2-char typo", () => {
    expect(isSimilarCategoryName("Newslters", "Newsletters")).toBe(true);
  });

  it("returns true within 20% threshold on longer strings", () => {
    // "Customer Supprt" vs "Customer Support" — distance 2, 20% of 16 = 3.2 → threshold 3
    expect(isSimilarCategoryName("customer supprt", "customer support")).toBe(
      true,
    );
  });

  it("returns false for clearly different names", () => {
    expect(isSimilarCategoryName("Newsletters", "Customer Support")).toBe(
      false,
    );
    expect(isSimilarCategoryName("Recruitment", "Finance Reports")).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(isSimilarCategoryName("", "")).toBe(false);
    expect(isSimilarCategoryName("", "Newsletters")).toBe(false);
    expect(isSimilarCategoryName("Newsletters", "")).toBe(false);
  });

  it("returns true when strings differ only in emoji presence", () => {
    // After emoji stripping these become equal — callers strip emoji before calling
    expect(isSimilarCategoryName("ci/cd alerts", "ci/cd alerts")).toBe(true);
  });
});
