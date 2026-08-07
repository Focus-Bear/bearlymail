import {
  CompositeCategoryRuleSpecV2,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import {
  compareCompositeRuleSpecificity,
  pickMostSpecificCandidate,
  SpecificityCandidate,
} from "./category-rules-specificity.helper";

const broadSpec: CompositeCategoryRuleSpecV2 = {
  v: 2,
  senderMatchesAny: ["*@github.com"],
  subjectContainsAny: [],
  bodyContainsAny: [],
};

const candidate = (
  spec: SpecificityCandidate["spec"],
  createdAt: string,
  id: string,
): SpecificityCandidate => ({ spec, createdAt: new Date(createdAt), id });

describe("compareCompositeRuleSpecificity", () => {
  it("ranks a rule with a notificationSubtype ahead of a broad rule", () => {
    const structural: CompositeCategoryRuleSpecV3 = {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      notificationSubtype: "github:issue",
    };
    // The structural rule is NEWER, so oldest-wins would have picked the broad
    // one; specificity must still put the structural rule first.
    const structuralCandidate = candidate(structural, "2026-02-02", "b");
    const broadCandidate = candidate(broadSpec, "2026-02-01", "a");

    expect(
      compareCompositeRuleSpecificity(structuralCandidate, broadCandidate),
    ).toBeLessThan(0);
    expect(
      compareCompositeRuleSpecificity(broadCandidate, structuralCandidate),
    ).toBeGreaterThan(0);
    expect(
      pickMostSpecificCandidate([broadCandidate, structuralCandidate]),
    ).toBe(structuralCandidate);
  });

  it("ranks a rule with more exclusion phrases ahead of one with fewer", () => {
    const fewer: CompositeCategoryRuleSpecV2 = {
      ...broadSpec,
      bodyNotContainsAny: ["Test Environment"],
    };
    const more: CompositeCategoryRuleSpecV2 = {
      ...broadSpec,
      subjectNotContainsAny: ["QA"],
      bodyNotContainsAny: ["Test Environment", "Preconditions"],
    };
    const moreCandidate = candidate(more, "2026-02-02", "b");
    const fewerCandidate = candidate(fewer, "2026-02-01", "a");

    expect(
      compareCompositeRuleSpecificity(moreCandidate, fewerCandidate),
    ).toBeLessThan(0);
    expect(pickMostSpecificCandidate([fewerCandidate, moreCandidate])).toBe(
      moreCandidate,
    );
  });

  it("ranks a rule with more positive conditions ahead when exclusions tie", () => {
    const fewerPositives: CompositeCategoryRuleSpecV2 = {
      v: 2,
      senderMatchesAny: ["*@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      bodyNotContainsAny: ["x"],
    };
    const morePositives: CompositeCategoryRuleSpecV2 = {
      v: 2,
      senderMatchesAny: ["*@github.com"],
      subjectContainsAny: ["issue"],
      bodyContainsAny: ["assigned"],
      bodyNotContainsAny: ["x"],
    };
    expect(
      compareCompositeRuleSpecificity(
        candidate(morePositives, "2026-02-02", "b"),
        candidate(fewerPositives, "2026-02-01", "a"),
      ),
    ).toBeLessThan(0);
  });

  it("uses createdAt only as a tiebreak (older wins) when specificity is equal", () => {
    const older = candidate(broadSpec, "2026-02-01", "z");
    const newer = candidate(broadSpec, "2026-02-05", "a");
    expect(compareCompositeRuleSpecificity(older, newer)).toBeLessThan(0);
    // The older rule wins despite the newer one sorting earlier by id.
    expect(pickMostSpecificCandidate([newer, older])).toBe(older);
  });

  it("is a total order: identical specificity + createdAt falls back to id", () => {
    const sameTime = "2026-02-01T00:00:00.000Z";
    const lowerId = candidate(broadSpec, sameTime, "aaa");
    const higherId = candidate(broadSpec, sameTime, "bbb");
    expect(compareCompositeRuleSpecificity(lowerId, higherId)).toBeLessThan(0);
    expect(compareCompositeRuleSpecificity(higherId, lowerId)).toBeGreaterThan(
      0,
    );
    // Reflexive: comparing a candidate to itself is 0 (no ambiguity left).
    expect(compareCompositeRuleSpecificity(lowerId, lowerId)).toBe(0);
  });

  it("is stable regardless of input order (deterministic winner)", () => {
    const structural: CompositeCategoryRuleSpecV3 = {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      notificationSubtype: "github:issue",
    };
    const subtypeRule = candidate(structural, "2026-02-03", "c");
    const broad = candidate(broadSpec, "2026-02-01", "a");
    const mid = candidate(
      { ...broadSpec, bodyNotContainsAny: ["x"] },
      "2026-02-02",
      "b",
    );
    expect(pickMostSpecificCandidate([broad, mid, subtypeRule])).toBe(
      subtypeRule,
    );
    expect(pickMostSpecificCandidate([subtypeRule, mid, broad])).toBe(
      subtypeRule,
    );
    expect(pickMostSpecificCandidate([mid, subtypeRule, broad])).toBe(
      subtypeRule,
    );
  });
});
