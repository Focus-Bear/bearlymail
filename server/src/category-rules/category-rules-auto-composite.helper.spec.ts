import {
  CompositeCategoryRuleSpecV1,
  CompositeCategoryRuleSpecV2,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import {
  compositeAutoSpecsMatch,
  compositeRulesShouldReconcile,
  copyV3ExtraFields,
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

  describe("notificationSubtype structured condition", () => {
    const ciSpec: CompositeCategoryRuleSpecV3 = {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: ["["],
      bodyContainsAny: ["github"],
      notificationSubtype: "github:ci:run_failed",
    };

    it("matches when the email's subtype equals the rule's notificationSubtype", () => {
      const result = evaluateComposite(
        ciSpec,
        {
          from: "notifications@github.com",
          subject: "[owner/repo] Run failed: CI",
          bodyTextForMatch: "view it on github",
          notificationSubtype: "github:ci:run_failed",
        },
        normalise,
      );
      expect(result.matches).toBe(true);
      expect(result.detail.notificationSubtypeMatch).toBe(true);
    });

    it("rejects a different sub-stream even though sender/subject/body match", () => {
      const result = evaluateComposite(
        ciSpec,
        {
          from: "notifications@github.com",
          subject: "[owner/repo] A bug report (#7)",
          bodyTextForMatch: "view it on github",
          notificationSubtype: "github:issue",
        },
        normalise,
      );
      expect(result.matches).toBe(false);
      expect(result.detail.notificationSubtypeMatch).toBe(false);
    });

    it("rejects when the email's subtype is unresolved (undefined)", () => {
      const result = evaluateComposite(
        ciSpec,
        {
          from: "notifications@github.com",
          subject: "[owner/repo] Ambiguous (#9)",
          bodyTextForMatch: "view it on github",
          notificationSubtype: undefined,
        },
        normalise,
      );
      expect(result.matches).toBe(false);
    });

    it("matches a structural rule with NO subject/body phrases when the subtype matches (empty phrase list = no constraint)", () => {
      const structuralSpec: CompositeCategoryRuleSpecV3 = {
        v: 3,
        fromMatchesAny: ["*@github.com"],
        subjectContainsAny: [],
        bodyContainsAny: [],
        notificationSubtype: "github:pr",
      };
      const result = evaluateComposite(
        structuralSpec,
        {
          from: "notifications@github.com",
          subject: "[owner/repo] Add feature (#42)",
          bodyTextForMatch: "anything at all",
          notificationSubtype: "github:pr",
        },
        normalise,
      );
      expect(result.matches).toBe(true);
      expect(result.detail.subjectMatch).toBe(true);
      expect(result.detail.bodyMatch).toBe(true);
    });

    it("does NOT match a structural rule when the email's subtype differs, even with empty phrases", () => {
      const structuralSpec: CompositeCategoryRuleSpecV3 = {
        v: 3,
        fromMatchesAny: ["*@github.com"],
        subjectContainsAny: [],
        bodyContainsAny: [],
        notificationSubtype: "github:pr",
      };
      const result = evaluateComposite(
        structuralSpec,
        {
          from: "notifications@github.com",
          subject: "[owner/repo] A bug (#7)",
          bodyTextForMatch: "anything at all",
          notificationSubtype: "github:issue",
        },
        normalise,
      );
      expect(result.matches).toBe(false);
      expect(result.detail.notificationSubtypeMatch).toBe(false);
    });

    it("ignores the email's subtype when the spec has no notificationSubtype condition", () => {
      const result = evaluateComposite(
        { ...ciSpec, notificationSubtype: undefined },
        {
          from: "notifications@github.com",
          subject: "[owner/repo] Anything (#1)",
          bodyTextForMatch: "view it on github",
          notificationSubtype: "github:issue",
        },
        normalise,
      );
      expect(result.matches).toBe(true);
    });
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

describe("notificationSubtype set matching and coarse compatibility", () => {
  const humanPrUpdates: CompositeCategoryRuleSpecV3 = {
    v: 3,
    fromMatchesAny: ["notifications@github.com"],
    subjectContainsAny: [],
    bodyContainsAny: [],
    notificationSubtypeAny: [
      "github:pr:comment:human",
      "github:pr:push:human",
      "github:pr:review_approved:human",
    ],
  };
  const legacyCoarsePr: CompositeCategoryRuleSpecV3 = {
    v: 3,
    fromMatchesAny: ["notifications@github.com"],
    subjectContainsAny: [],
    bodyContainsAny: [],
    notificationSubtype: "github:pr",
  };
  const email = (notificationSubtype: string | undefined) => ({
    from: "notifications@github.com",
    subject: "Re: [owner/repo] Add feature (PR #430)",
    bodyTextForMatch: "anything",
    notificationSubtype,
  });

  it("matches when the email's fine subtype is any member of the pinned set", () => {
    expect(
      evaluateComposite(
        humanPrUpdates,
        email("github:pr:push:human"),
        normalise,
      ).matches,
    ).toBe(true);
    expect(
      evaluateComposite(
        humanPrUpdates,
        email("github:pr:review_approved:human"),
        normalise,
      ).matches,
    ).toBe(true);
  });

  it("rejects bot, merged and review-request sub-streams the set leaves out", () => {
    for (const subtype of [
      "github:pr:push:bot",
      "github:pr:merged:human",
      "github:pr:review_requested:human",
    ]) {
      const result = evaluateComposite(
        humanPrUpdates,
        email(subtype),
        normalise,
      );
      expect(result.matches).toBe(false);
      expect(result.detail.notificationSubtypeMatch).toBe(false);
    }
  });

  it("keeps a persisted coarse github:pr rule matching today's fine PR subtypes but not issues", () => {
    expect(
      evaluateComposite(
        legacyCoarsePr,
        email("github:pr:comment:bot"),
        normalise,
      ).matches,
    ).toBe(true);
    expect(
      evaluateComposite(
        legacyCoarsePr,
        email("github:pr:merged:human"),
        normalise,
      ).matches,
    ).toBe(true);
    expect(
      evaluateComposite(
        legacyCoarsePr,
        email("github:issue:comment:bot"),
        normalise,
      ).matches,
    ).toBe(false);
  });

  it("treats identical phrase-free rules with different subtype pins as DIFFERENT rules (no dedup)", () => {
    const mergedOnly: CompositeCategoryRuleSpecV3 = {
      ...legacyCoarsePr,
      notificationSubtype: "github:pr:merged:human",
    };
    expect(compositeAutoSpecsMatch(legacyCoarsePr, mergedOnly)).toBe(false);
    expect(compositeAutoSpecsMatch(humanPrUpdates, { ...humanPrUpdates })).toBe(
      true,
    );
    expect(compositeRulesShouldReconcile(legacyCoarsePr, mergedOnly)).toBe(
      false,
    );
    expect(
      compositeRulesShouldReconcile(humanPrUpdates, { ...humanPrUpdates }),
    ).toBe(true);
  });

  it("preserves the set through copyV3ExtraFields", () => {
    expect(copyV3ExtraFields(humanPrUpdates)).toEqual({
      notificationSubtypeAny: humanPrUpdates.notificationSubtypeAny,
    });
  });
});
