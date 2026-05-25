import { CompositeCategoryRuleSpec } from "../database/entities/category-rule.entity";
import {
  countMatchesInRows,
  type MatchScanRow,
  mergeExclusionsIntoSpec,
  specHasExclusion,
} from "./category-rules-match-gate.helper";

const identity = (raw: string) => raw.toLowerCase().trim();

const baseSpec: CompositeCategoryRuleSpec = {
  v: 3,
  fromMatchesAny: ["*@github.com"],
  subjectContainsAny: ["PR #"],
  bodyContainsAny: ["pull request"],
};

const rows: MatchScanRow[] = [
  {
    from: "notifications@github.com",
    subject: "PR #42 merged",
    body: "Your pull request was merged.",
  },
  {
    from: "notifications@github.com",
    subject: "Issue #7 opened",
    body: "Someone opened an issue.",
  },
  {
    from: "billing@stripe.com",
    subject: "PR # invoice",
    body: "pull request unrelated",
  },
];

describe("countMatchesInRows", () => {
  it("counts only rows that satisfy sender, subject, and body conditions", () => {
    expect(countMatchesInRows(rows, baseSpec, identity)).toBe(1);
  });

  it("returns 0 when nothing matches", () => {
    const spec: CompositeCategoryRuleSpec = {
      ...baseSpec,
      subjectContainsAny: ["nonexistent phrase"],
    };
    expect(countMatchesInRows(rows, spec, identity)).toBe(0);
  });

  it("excludes rows whose subject hits a NOT-contains phrase", () => {
    const spec: CompositeCategoryRuleSpec = {
      ...baseSpec,
      subjectNotContainsAny: ["merged"],
    };
    expect(countMatchesInRows(rows, spec, identity)).toBe(0);
  });

  it("matches NOT-contains exclusions case-insensitively", () => {
    // The phrase casing differs from the email text in both directions.
    const upperSubjectExclusion: CompositeCategoryRuleSpec = {
      ...baseSpec,
      subjectNotContainsAny: ["MERGED"],
    };
    expect(countMatchesInRows(rows, upperSubjectExclusion, identity)).toBe(0);

    const upperBodyExclusion: CompositeCategoryRuleSpec = {
      ...baseSpec,
      bodyNotContainsAny: ["PULL REQUEST"],
    };
    expect(countMatchesInRows(rows, upperBodyExclusion, identity)).toBe(0);
  });
});

describe("specHasExclusion", () => {
  it("is false when no exclusions are present", () => {
    expect(specHasExclusion(baseSpec)).toBe(false);
  });

  it("is true when a subject exclusion is present", () => {
    expect(
      specHasExclusion({ ...baseSpec, subjectNotContainsAny: ["digest"] }),
    ).toBe(true);
  });

  it("is true when a body exclusion is present", () => {
    expect(
      specHasExclusion({ ...baseSpec, bodyNotContainsAny: ["unsubscribe"] }),
    ).toBe(true);
  });
});

describe("mergeExclusionsIntoSpec", () => {
  it("merges new exclusions, dedups case-insensitively, and yields a v3 spec", () => {
    const merged = mergeExclusionsIntoSpec(
      { ...baseSpec, subjectNotContainsAny: ["Issue #"] },
      ["issue #", "digest"],
      ["unsubscribe"],
    );
    expect(merged.v).toBe(3);
    expect(merged.fromMatchesAny).toEqual(["*@github.com"]);
    expect(merged.subjectNotContainsAny).toEqual(["Issue #", "digest"]);
    expect(merged.bodyNotContainsAny).toEqual(["unsubscribe"]);
  });

  it("preserves positive conditions when upgrading a v1 spec", () => {
    const v1: CompositeCategoryRuleSpec = {
      v: 1,
      sender: "a@b.com",
      subjectContains: "Invoice",
      bodyContainsAny: ["amount due"],
    };
    const merged = mergeExclusionsIntoSpec(v1, ["receipt"], []);
    expect(merged.v).toBe(3);
    expect(merged.fromMatchesAny).toEqual(["a@b.com"]);
    expect(merged.subjectContainsAny).toEqual(["Invoice"]);
    expect(merged.bodyContainsAny).toEqual(["amount due"]);
    expect(merged.subjectNotContainsAny).toEqual(["receipt"]);
  });

  it("omits exclusion arrays entirely when none result", () => {
    const merged = mergeExclusionsIntoSpec(baseSpec, [], []);
    expect(merged.subjectNotContainsAny).toBeUndefined();
    expect(merged.bodyNotContainsAny).toBeUndefined();
  });
});
