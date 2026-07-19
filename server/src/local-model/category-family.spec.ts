import { assignFamily, OTHER_FAMILY } from "./category-family";

describe("assignFamily", () => {
  it("returns Other for null/empty", () => {
    expect(assignFamily(null)).toBe(OTHER_FAMILY);
    expect(assignFamily(undefined)).toBe(OTHER_FAMILY);
    expect(assignFamily("")).toBe(OTHER_FAMILY);
  });

  it("strips a leading emoji and matches on the category name", () => {
    expect(assignFamily("🤖 GitHub Bot PR Updates")).toBe(
      "GitHub / Pull Requests",
    );
    expect(assignFamily("💰 Payments & Financials")).toBe("Finance & Payments");
  });

  it("matches on the name only, ignoring the description after ' - ' / ': '", () => {
    // Description mentions "pull requests" but the NAME is a feedback category.
    expect(assignFamily("Customer feedback - notes, NOT pull requests")).toBe(
      "GitHub / Issues",
    );
  });

  it("respects word-boundary keywords (\\bform\\b does not fire on 'platform')", () => {
    expect(assignFamily("Upwork Platform Notifications")).not.toBe(
      "Documents & Forms",
    );
    expect(assignFamily("Form Response")).toBe("Documents & Forms");
  });

  it("first matching rule wins (Issues before Pull Requests)", () => {
    expect(assignFamily("GitHub issue status update")).toBe("GitHub / Issues");
  });

  it("maps unknown categories to Other", () => {
    expect(assignFamily("Something totally unrelated zzz")).toBe(OTHER_FAMILY);
  });
});
