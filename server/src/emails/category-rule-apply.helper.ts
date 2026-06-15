import type {
  CategoryRuleMatch,
  CategoryRuleTraceSnapshot,
} from "../category-rules/category-rules.types";

/** The subset of a priority result this helper mutates. */
interface CategoryRuleApplicable {
  category: string;
  categoryExplanation: string;
  categoryRuleTrace?: CategoryRuleTraceSnapshot | null;
}

/**
 * Applies a deterministic category-rule outcome onto a priority result, shared
 * by the single-email and batch refine paths so both behave identically.
 *
 * When a rule matched, the rule's category overrides the LLM's choice and the
 * explanation records the matched rule (including the `(rule:<id>)` marker the
 * UI uses to deep-link to the exact rule — multiple rules can share a category).
 * The trace snapshot is always attached so the category-debug view can show what
 * the rule step saw at processing time, even when no rule matched.
 */
export function applyCategoryRuleToResult(
  result: CategoryRuleApplicable,
  match: CategoryRuleMatch | null,
  snapshot: CategoryRuleTraceSnapshot,
): void {
  if (match) {
    result.category = match.categoryName;
    const kindOrType = match.ruleType ?? match.ruleKind;
    result.categoryExplanation = `Matched deterministic rule (${kindOrType}): category="${match.categoryName}" (rule:${match.ruleId})`;
  }
  result.categoryRuleTrace = snapshot;
}
