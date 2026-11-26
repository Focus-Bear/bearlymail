import { Repository } from "typeorm";

import {
  CategoryRule,
  CompositeCategoryRuleSpec,
} from "../database/entities/category-rule.entity";
import { evaluateComposite } from "./category-rules-auto-composite.helper";
import {
  findSameCategoryRuleCoveringCandidate,
  reconcileCandidateIntoSameCategoryRule,
} from "./category-rules-merge-sibling.helper";

const normalise = (raw: string): string => {
  const match = raw.match(/<([^>]+)>/) || raw.match(/([^\s]+@[^\s]+)/);
  return (match ? match[1] : raw).toLowerCase().trim();
};

const rule = (
  id: string,
  categoryId: string,
  spec: CompositeCategoryRuleSpec,
  createdAt = "2026-02-01",
): CategoryRule =>
  ({
    id,
    categoryId,
    categoryName: `cat-${categoryId}`,
    ruleKind: "composite",
    isEnabled: true,
    hitCount: 5,
    createdAt: new Date(createdAt),
    compositeSpec: spec,
  }) as CategoryRule;

function fakeRepository(): {
  repo: Repository<CategoryRule>;
  saved: CategoryRule[];
} {
  const saved: CategoryRule[] = [];
  const repo = {
    save: async (entity: CategoryRule) => {
      saved.push(entity);
      return entity;
    },
  } as unknown as Repository<CategoryRule>;
  return { repo, saved };
}

describe("reconcileCandidateIntoSameCategoryRule", () => {
  it("merges a divergent same-category sibling, unioning exclusions into one rule", async () => {
    const existing = rule("existing", "gh", {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: ["Test Environment"],
    });
    const candidateSpec: CompositeCategoryRuleSpec = {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: ["Test Objective"],
    };
    const { repo, saved } = fakeRepository();

    const result = await reconcileCandidateIntoSameCategoryRule({
      compositeRules: [existing],
      candidateSpec,
      categoryId: "gh",
      repository: repo,
    });

    expect(result).toBe(existing);
    expect(saved).toHaveLength(1);
    // id + hit count preserved (merged in place, not replaced).
    expect(existing.id).toBe("existing");
    expect(existing.hitCount).toBe(5);
    const mergedSpec = existing.compositeSpec;
    if (mergedSpec?.v !== 3) throw new Error("expected v3");
    expect(mergedSpec.bodyNotContainsAny).toEqual([
      "Test Environment",
      "Test Objective",
    ]);
  });

  it("QA-mis-file regression: after reconciliation the merged rule excludes the QA email", async () => {
    // The broad rule (no QA exclusion) mis-filed QA comments. The newer sibling
    // carries the QA exclusion. Reconciling folds the exclusion into ONE rule so
    // a QA-marker email no longer matches the wrong category, while ordinary
    // github mail still matches.
    const broad = rule("broad", "gh-issue", {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: ["unsubscribe"],
    });
    const qaExcluding: CompositeCategoryRuleSpec = {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: ["Test Environment", "Test Objective"],
    };
    const { repo } = fakeRepository();

    const merged = await reconcileCandidateIntoSameCategoryRule({
      compositeRules: [broad],
      candidateSpec: qaExcluding,
      categoryId: "gh-issue",
      repository: repo,
    });
    const spec = merged?.compositeSpec;
    if (!spec) throw new Error("expected a merged rule");

    const qaEmail = {
      from: "notifications@github.com",
      subject: "New comment on PR #12",
      bodyTextForMatch:
        "Test Environment: staging\nTest Objective: verify login flow",
    };
    const normalEmail = {
      from: "notifications@github.com",
      subject: "New comment on PR #12",
      bodyTextForMatch: "Ship it!",
    };

    expect(evaluateComposite(spec, qaEmail, normalise).matches).toBe(false);
    expect(evaluateComposite(spec, normalEmail, normalise).matches).toBe(true);
  });

  it("never merges across categories", async () => {
    const otherCategory = rule("other", "billing", {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: ["Test Environment"],
    });
    const candidateSpec: CompositeCategoryRuleSpec = {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: ["Test Objective"],
    };
    const { repo, saved } = fakeRepository();

    const result = await reconcileCandidateIntoSameCategoryRule({
      compositeRules: [otherCategory],
      candidateSpec,
      // "gh" differs from the existing rule's "billing" category.
      categoryId: "gh",
      repository: repo,
    });

    expect(result).toBeNull();
    expect(saved).toHaveLength(0);
  });

  it("folds a same-phrase rule with new sub-streams into the existing rule instead of adding a sibling", async () => {
    // The production shape: one structural rule per run, each pinned to the
    // clean sub-stream set seen so far, all for the same category.
    const qaGuard = ["Test Environment", "Test Objective", "Preconditions"];
    const existing = rule("existing", "gh", {
      v: 3,
      fromMatchesAny: ["notifications@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: qaGuard,
      notificationSubtypeAny: [
        "github:pr:push:human",
        "github:pr:review_requested:human",
      ],
    });
    const candidateSpec: CompositeCategoryRuleSpec = {
      v: 3,
      fromMatchesAny: ["notifications@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: qaGuard,
      notificationSubtypeAny: [
        "github:pr:push:human",
        "github:pr:reopened:human",
      ],
    };
    const { repo, saved } = fakeRepository();

    const result = await reconcileCandidateIntoSameCategoryRule({
      compositeRules: [existing],
      candidateSpec,
      categoryId: "gh",
      repository: repo,
    });

    expect(result?.id).toBe("existing");
    expect(saved).toHaveLength(1);
    expect(result?.compositeSpec).toEqual({
      v: 3,
      fromMatchesAny: ["notifications@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: qaGuard,
      notificationSubtypeAny: [
        "github:pr:push:human",
        "github:pr:review_requested:human",
        "github:pr:reopened:human",
      ],
    });
  });

  it("does not merge rules pinned to different notification subtypes when their phrases differ", async () => {
    const prRule = rule("pr", "gh", {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: ["PR #"],
      bodyContainsAny: [],
      notificationSubtype: "github:pr",
    });
    const issueCandidate: CompositeCategoryRuleSpec = {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: ["Issue #"],
      bodyContainsAny: [],
      notificationSubtype: "github:issue",
    };
    const { repo } = fakeRepository();

    const result = await reconcileCandidateIntoSameCategoryRule({
      compositeRules: [prRule],
      candidateSpec: issueCandidate,
      categoryId: "gh",
      repository: repo,
    });

    expect(result).toBeNull();
  });
});

describe("findSameCategoryRuleCoveringCandidate", () => {
  const closedRuleSpec: CompositeCategoryRuleSpec = {
    v: 3,
    fromMatchesAny: ["notifications@github.com"],
    subjectContainsAny: [],
    bodyContainsAny: [],
    bodyNotContainsAny: ["Test Environment", "Test Objective", "Preconditions"],
    notificationSubtypeAny: [
      "github:issue:closed:human",
      "github:issue:reopened:human",
    ],
  };

  it("finds a rule that already does everything the candidate would (case and order ignored)", () => {
    const existing = rule("existing", "issues", closedRuleSpec);
    const candidate: CompositeCategoryRuleSpec = {
      v: 3,
      fromMatchesAny: ["Notifications@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: [
        "preconditions",
        "test environment",
        "Test Objective",
      ],
      notificationSubtype: "github:issue:closed:human",
    };

    expect(
      findSameCategoryRuleCoveringCandidate([existing], candidate, "issues"),
    ).toBe(existing);
  });

  it("counts a disabled rule, so a rule the user switched off is not recreated", () => {
    const disabled = {
      ...rule("off", "issues", closedRuleSpec),
      isEnabled: false,
    } as CategoryRule;

    expect(
      findSameCategoryRuleCoveringCandidate(
        [disabled],
        closedRuleSpec,
        "issues",
      ),
    ).toBe(disabled);
  });

  it("returns null when the candidate adds a sub-stream or an exclusion", () => {
    const existing = rule("existing", "issues", closedRuleSpec);
    const addsSubtype: CompositeCategoryRuleSpec = {
      ...closedRuleSpec,
      notificationSubtypeAny: [
        "github:issue:closed:human",
        "github:issue:labeled:human",
      ],
    };
    const addsExclusion: CompositeCategoryRuleSpec = {
      ...closedRuleSpec,
      subjectNotContainsAny: ["[bot]"],
    };

    expect(
      findSameCategoryRuleCoveringCandidate([existing], addsSubtype, "issues"),
    ).toBeNull();
    expect(
      findSameCategoryRuleCoveringCandidate(
        [existing],
        addsExclusion,
        "issues",
      ),
    ).toBeNull();
  });

  it("ignores rules for other categories and candidates without a category", () => {
    const otherCategory = rule("other", "prs", closedRuleSpec);

    expect(
      findSameCategoryRuleCoveringCandidate(
        [otherCategory],
        closedRuleSpec,
        "issues",
      ),
    ).toBeNull();
    expect(
      findSameCategoryRuleCoveringCandidate(
        [otherCategory],
        closedRuleSpec,
        null,
      ),
    ).toBeNull();
  });
});
