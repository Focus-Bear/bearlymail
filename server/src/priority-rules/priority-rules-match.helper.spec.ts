import type { CompositeCategoryRuleSpecV3 } from "../database/entities/category-rule.entity";
import { evaluatePriorityRule } from "./priority-rules-match.helper";

const normaliseSender = (from: string): string => {
  const match = from.match(/<([^>]+)>/) || from.match(/([^\s]+@[^\s]+)/);
  return (match ? match[1] : from).toLowerCase().trim();
};

const evalRule = (
  spec: CompositeCategoryRuleSpecV3,
  email: { from: string; subject?: string; bodyTextForMatch?: string },
): boolean =>
  evaluatePriorityRule(
    spec,
    {
      from: email.from,
      subject: email.subject ?? "",
      bodyTextForMatch: email.bodyTextForMatch,
    },
    normaliseSender,
  );

describe("evaluatePriorityRule", () => {
  it("matches a sender-only rule on any subject/body (wildcard-empty)", () => {
    const spec: CompositeCategoryRuleSpecV3 = {
      v: 3,
      fromMatchesAny: ["notifications@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
    };
    expect(
      evalRule(spec, {
        from: "GitHub <notifications@github.com>",
        subject: "anything at all",
        bodyTextForMatch: "whatever body",
      }),
    ).toBe(true);
  });

  it("matches a domain wildcard sender", () => {
    const spec: CompositeCategoryRuleSpecV3 = {
      v: 3,
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
    };
    expect(evalRule(spec, { from: "noreply@github.com" })).toBe(true);
    expect(evalRule(spec, { from: "someone@gitlab.com" })).toBe(false);
  });

  it("does not match when the sender differs", () => {
    const spec: CompositeCategoryRuleSpecV3 = {
      v: 3,
      fromMatchesAny: ["boss@acme.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
    };
    expect(evalRule(spec, { from: "stranger@acme.com" })).toBe(false);
  });

  it("requires the subject phrase when one is specified", () => {
    const spec: CompositeCategoryRuleSpecV3 = {
      v: 3,
      fromMatchesAny: ["alerts@acme.com"],
      subjectContainsAny: ["invoice"],
      bodyContainsAny: [],
    };
    expect(
      evalRule(spec, {
        from: "alerts@acme.com",
        subject: "Your invoice is ready",
      }),
    ).toBe(true);
    expect(
      evalRule(spec, { from: "alerts@acme.com", subject: "Weekly digest" }),
    ).toBe(false);
  });

  it("disqualifies the match when a NOT-contains exclusion is present", () => {
    const spec: CompositeCategoryRuleSpecV3 = {
      v: 3,
      fromMatchesAny: ["alerts@acme.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      subjectNotContainsAny: ["URGENT"],
    };
    expect(
      evalRule(spec, { from: "alerts@acme.com", subject: "routine update" }),
    ).toBe(true);
    expect(
      evalRule(spec, {
        from: "alerts@acme.com",
        subject: "URGENT: action needed",
      }),
    ).toBe(false);
  });

  it("matches body phrases case-insensitively", () => {
    const spec: CompositeCategoryRuleSpecV3 = {
      v: 3,
      fromMatchesAny: ["alerts@acme.com"],
      subjectContainsAny: [],
      bodyContainsAny: ["deployment succeeded"],
    };
    expect(
      evalRule(spec, {
        from: "alerts@acme.com",
        bodyTextForMatch: "Your DEPLOYMENT SUCCEEDED on prod",
      }),
    ).toBe(true);
  });
});
