import type { CategoryRuleMatch } from "../category-rules/category-rules.types";
import type { PriorityRuleMatch } from "./priority-rules.types";
import { shouldSkipWithRule } from "./priority-rules-skip.helper";

const priorityMatch: PriorityRuleMatch = {
  ruleId: "p1",
  band: "low",
  representativeScore: 35,
};
const categoryMatch: CategoryRuleMatch = {
  categoryName: "Newsletters",
  categoryId: "c1",
  ruleId: "r1",
  ruleType: null,
  ruleKind: "composite",
};

const base = {
  skipEnabled: true,
  priorityMatch,
  categoryMatch,
  sampleRoll: 0.5,
  sampleRate: 0.1,
};

describe("shouldSkipWithRule", () => {
  it("skips when enabled, both rules match, and not sampled", () => {
    expect(shouldSkipWithRule(base)).toBe(true);
  });

  it("does not skip when the flag is disabled", () => {
    expect(shouldSkipWithRule({ ...base, skipEnabled: false })).toBe(false);
  });

  it("does not skip without a priority rule", () => {
    expect(shouldSkipWithRule({ ...base, priorityMatch: null })).toBe(false);
  });

  it("does not skip without a category rule", () => {
    expect(shouldSkipWithRule({ ...base, categoryMatch: null })).toBe(false);
  });

  it("falls through to the LLM when the sample roll lands in the sampled fraction", () => {
    expect(shouldSkipWithRule({ ...base, sampleRoll: 0.05 })).toBe(false);
  });

  it("skips at the sample-rate boundary (roll == rate)", () => {
    expect(shouldSkipWithRule({ ...base, sampleRoll: 0.1 })).toBe(true);
  });
});
