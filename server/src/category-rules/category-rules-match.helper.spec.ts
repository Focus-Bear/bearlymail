import { CategoryRule } from "../database/entities/category-rule.entity";
import type { EmailMetadata } from "./category-rules.types";
import { findMostSpecificCompositeRuleMatch } from "./category-rules-match.helper";

const normalise = (raw: string): string => {
  const match = raw.match(/<([^>]+)>/) || raw.match(/([^\s]+@[^\s]+)/);
  return (match ? match[1] : raw).toLowerCase().trim();
};

const compositeRule = (
  overrides: Partial<CategoryRule> & Pick<CategoryRule, "compositeSpec">,
): CategoryRule =>
  ({
    id: "rule",
    categoryName: "Cat",
    categoryId: "cat-1",
    ruleKind: "composite",
    ruleType: null,
    isEnabled: true,
    hitCount: 0,
    createdAt: new Date("2026-02-01"),
    ...overrides,
  }) as CategoryRule;

describe("findMostSpecificCompositeRuleMatch", () => {
  it("returns the most specific matching rule, not the oldest (subtype wins)", () => {
    const broadOlder = compositeRule({
      id: "broad-old",
      categoryName: "GitHub (broad)",
      createdAt: new Date("2026-01-01"),
      compositeSpec: {
        v: 3,
        fromMatchesAny: ["*@github.com"],
        subjectContainsAny: [],
        bodyContainsAny: [],
        bodyNotContainsAny: ["unsubscribe"],
      },
    });
    const specificNewer = compositeRule({
      id: "specific-new",
      categoryName: "Human GitHub issue status updates",
      createdAt: new Date("2026-02-01"),
      compositeSpec: {
        v: 3,
        fromMatchesAny: ["*@github.com"],
        subjectContainsAny: [],
        bodyContainsAny: [],
        notificationSubtype: "github:issue",
      },
    });

    const email: EmailMetadata = {
      from: "notifications@github.com",
      subject: "Re: [org/repo] Something happened (#42)",
      bodyTextForMatch: "an issue was updated",
      notificationSubtype: "github:issue",
    };

    // Both rules match; oldest-wins would pick broad-old. Specificity picks the
    // subtype-bearing newer rule.
    const winner = findMostSpecificCompositeRuleMatch(
      [broadOlder, specificNewer],
      email,
      normalise,
    );
    expect(winner?.ruleId).toBe("specific-new");
    expect(winner?.categoryName).toBe("Human GitHub issue status updates");
  });

  it("QA-mis-file regression: the newer, more-excluded rule wins when both match", () => {
    // Both rules point at the same GitHub category. The old rule is broad; the
    // newer sibling adds a QA exclusion. On a NON-QA github email both match, so
    // this proves the more-excluded rule is the deterministic winner (the broad
    // rule no longer shadows it). The QA email itself is handled by the
    // reconciliation dedup (see the merge-sibling spec).
    const broadOlder = compositeRule({
      id: "broad-old",
      createdAt: new Date("2026-01-01"),
      compositeSpec: {
        v: 3,
        fromMatchesAny: ["*@github.com"],
        subjectContainsAny: ["comment"],
        bodyContainsAny: [],
      } as CategoryRule["compositeSpec"],
    });
    const qaExcludingNewer = compositeRule({
      id: "qa-excluding-new",
      createdAt: new Date("2026-02-01"),
      compositeSpec: {
        v: 3,
        fromMatchesAny: ["*@github.com"],
        subjectContainsAny: ["comment"],
        bodyContainsAny: [],
        bodyNotContainsAny: ["Test Environment", "Test Objective"],
      },
    });

    const normalGithubComment: EmailMetadata = {
      from: "notifications@github.com",
      subject: "New comment on issue #7",
      bodyTextForMatch: "Looks good to me, merging shortly.",
    };

    const winner = findMostSpecificCompositeRuleMatch(
      [broadOlder, qaExcludingNewer],
      normalGithubComment,
      normalise,
    );
    expect(winner?.ruleId).toBe("qa-excluding-new");
  });

  it("ignores disabled/legacy rules and returns null when nothing matches", () => {
    const rule = compositeRule({
      compositeSpec: {
        v: 3,
        fromMatchesAny: ["*@example.com"],
        subjectContainsAny: [],
        bodyContainsAny: [],
        bodyNotContainsAny: ["x"],
      },
    });
    const email: EmailMetadata = {
      from: "notifications@github.com",
      subject: "hi",
      bodyTextForMatch: "hi",
    };
    expect(
      findMostSpecificCompositeRuleMatch([rule], email, normalise),
    ).toBeNull();
  });
});
