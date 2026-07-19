import type {
  CategoryRuleMatch,
  CategoryRuleTraceSnapshot,
} from "../category-rules/category-rules.types";
import { applyCategoryRuleToResult } from "./category-rule-apply.helper";

describe("applyCategoryRuleToResult", () => {
  const snapshot: CategoryRuleTraceSnapshot = {
    evaluatedAt: "2026-06-15T00:00:00.000Z",
    ruleStepRan: true,
    rulesConsideredCount: 3,
    winningRuleId: null,
    winningRuleCategoryName: null,
    matchedButNotWinningRuleIds: [],
  };

  it("overrides the category and explanation when a rule matched, and attaches the trace", () => {
    const result = {
      category: "LLM guess",
      categoryExplanation: "from llm",
    } as {
      category: string;
      categoryExplanation: string;
      categoryRuleTrace?: CategoryRuleTraceSnapshot | null;
      ruleCategoryId?: string | null;
    };
    const match: CategoryRuleMatch = {
      categoryName: "GitHub",
      categoryId: "cat-1",
      ruleId: "rule-1",
      ruleType: null,
      ruleKind: "composite",
    };

    applyCategoryRuleToResult(result, match, {
      ...snapshot,
      winningRuleId: "rule-1",
      winningRuleCategoryName: "GitHub",
    });

    expect(result.category).toBe("GitHub");
    expect(result.categoryExplanation).toContain("Matched deterministic rule");
    expect(result.categoryExplanation).toContain("(rule:rule-1)");
    expect(result.categoryRuleTrace?.winningRuleId).toBe("rule-1");
    // The rule's authoritative categoryId is carried through so resolution can
    // use it directly instead of re-resolving the (possibly drifted) name.
    expect(result.ruleCategoryId).toBe("cat-1");
  });

  it("leaves the LLM category untouched but still attaches the trace when no rule matched", () => {
    const result = {
      category: "LLM guess",
      categoryExplanation: "from llm",
    } as {
      category: string;
      categoryExplanation: string;
      categoryRuleTrace?: CategoryRuleTraceSnapshot | null;
    };

    applyCategoryRuleToResult(result, null, snapshot);

    expect(result.category).toBe("LLM guess");
    expect(result.categoryExplanation).toBe("from llm");
    expect(result.categoryRuleTrace).toEqual(snapshot);
  });
});
