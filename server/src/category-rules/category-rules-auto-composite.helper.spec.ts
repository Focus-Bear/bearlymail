import {
  CompositeCategoryRuleSpecV1,
  CompositeCategoryRuleSpecV2,
} from "../database/entities/category-rule.entity";
import {
  compositeAutoSpecsMatch,
  evaluateComposite,
  senderMatchesPattern,
} from "./category-rules-auto-composite.helper";

const normalise = (raw: string): string => {
  const match = raw.match(/<([^>]+)>/) || raw.match(/([^\s]+@[^\s]+)/);
  return (match ? match[1] : raw).toLowerCase().trim();
};

describe("evaluateComposite", () => {
  const baseSpec: CompositeCategoryRuleSpecV2 = {
    v: 2,
    senderMatchesAny: ["jeremy@focusbear.io"],
    subjectContainsAny: ["PR #", "pull request"],
    bodyContainsAny: ["codebeard", "claude", "gemini"],
  };

  it("rejects emails whose sender does not match the senderMatchesAny list", () => {
    const result = evaluateComposite(
      baseSpec,
      {
        from: '"Badal" <notifications@github.com>',
        subject: "Re: PR #123",
        bodyTextForMatch: "codebeard says hi",
      },
      normalise,
    );
    expect(result.matches).toBe(false);
    expect(result.detail.senderMatch).toBe(false);
  });

  it("matches when all positive conditions are satisfied and no exclusions are configured", () => {
    const result = evaluateComposite(
      baseSpec,
      {
        from: "Jeremy <jeremy@focusbear.io>",
        subject: "Latest PR # update",
        bodyTextForMatch: "claude reviewed the code",
      },
      normalise,
    );
    expect(result.matches).toBe(true);
    expect(result.detail.subjectMatchedValue).toBe("PR #");
  });

  it("rejects matches when a subjectNotContainsAny phrase is present (#1789)", () => {
    const spec: CompositeCategoryRuleSpecV2 = {
      ...baseSpec,
      subjectNotContainsAny: ["Issue #"],
    };
    const result = evaluateComposite(
      spec,
      {
        from: "jeremy@focusbear.io",
        // Subject contains BOTH the positive phrase ("PR #") and the exclusion
        // ("Issue #") — exclusion wins.
        subject: "PR # mention in Issue #1186 thread",
        bodyTextForMatch: "claude responded",
      },
      normalise,
    );
    expect(result.matches).toBe(false);
    expect(result.detail.subjectMatch).toBe(true);
    expect(result.detail.subjectExcludedMatch).toBe("Issue #");
  });

  it("rejects matches when a bodyNotContainsAny phrase is present (#1789)", () => {
    const spec: CompositeCategoryRuleSpecV2 = {
      ...baseSpec,
      bodyNotContainsAny: ["unsubscribe"],
    };
    const result = evaluateComposite(
      spec,
      {
        from: "jeremy@focusbear.io",
        subject: "PR #42 ready",
        bodyTextForMatch: "claude said yes — to unsubscribe click here",
      },
      normalise,
    );
    expect(result.matches).toBe(false);
    expect(result.detail.bodyExcludedMatch).toBe("unsubscribe");
  });

  it("ignores empty exclusion phrases so they cannot disqualify every email", () => {
    const spec: CompositeCategoryRuleSpecV2 = {
      ...baseSpec,
      subjectNotContainsAny: ["", "   "],
      bodyNotContainsAny: [""],
    };
    const result = evaluateComposite(
      spec,
      {
        from: "jeremy@focusbear.io",
        subject: "PR #99 ready",
        bodyTextForMatch: "gemini approved",
      },
      normalise,
    );
    expect(result.matches).toBe(true);
    expect(result.detail.subjectExcludedMatch).toBeNull();
    expect(result.detail.bodyExcludedMatch).toBeNull();
  });

  it("supports v1 specs (no exclusions; treated as plain v2)", () => {
    const spec: CompositeCategoryRuleSpecV1 = {
      v: 1,
      sender: "alerts@acme.com",
      subjectContains: "Build failed",
      bodyContainsAny: ["pipeline"],
    };
    const result = evaluateComposite(
      spec,
      {
        from: "alerts@acme.com",
        subject: "Build failed on main",
        bodyTextForMatch: "the pipeline broke",
      },
      normalise,
    );
    expect(result.matches).toBe(true);
  });
});

describe("compositeAutoSpecsMatch", () => {
  it("treats two v2 specs with the same conditions and exclusions as equal", () => {
    const left: CompositeCategoryRuleSpecV2 = {
      v: 2,
      senderMatchesAny: ["a@example.com"],
      subjectContainsAny: ["foo"],
      bodyContainsAny: ["bar"],
      subjectNotContainsAny: ["baz"],
      bodyNotContainsAny: ["qux"],
    };
    const right: CompositeCategoryRuleSpecV2 = {
      ...left,
      subjectNotContainsAny: ["baz"],
      bodyNotContainsAny: ["qux"],
    };
    expect(compositeAutoSpecsMatch(left, right)).toBe(true);
  });

  it("treats specs as different when only one has exclusions configured", () => {
    const left: CompositeCategoryRuleSpecV2 = {
      v: 2,
      senderMatchesAny: ["a@example.com"],
      subjectContainsAny: ["foo"],
      bodyContainsAny: ["bar"],
    };
    const right: CompositeCategoryRuleSpecV2 = {
      ...left,
      subjectNotContainsAny: ["different"],
    };
    expect(compositeAutoSpecsMatch(left, right)).toBe(false);
  });
});

describe("senderMatchesPattern", () => {
  it("matches an exact normalised address", () => {
    expect(senderMatchesPattern("a@b.com", "a@b.com")).toBe(true);
  });

  it("does not match a different address", () => {
    expect(
      senderMatchesPattern("notifications@github.com", "jeremy@focusbear.io"),
    ).toBe(false);
  });

  it("matches a domain wildcard pattern", () => {
    expect(
      senderMatchesPattern("notifications@github.com", "*@github.com"),
    ).toBe(true);
  });
});
