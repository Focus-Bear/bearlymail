import type { CategoryRuleMatch } from "../category-rules/category-rules.types";
import type { PriorityRuleMatch } from "./priority-rules.types";

/**
 * Decides whether to skip the analyze_priority LLM call for a thread. A skip
 * requires BOTH a deterministic priority rule (for the score) AND a category
 * rule (for the category the LLM would otherwise set) — so nothing is lost by
 * not calling the model. A configurable fraction of otherwise-skippable matches
 * fall through to the LLM (shadow-sampling) so drift keeps being measured even
 * after skipping is enabled.
 */
export function shouldSkipWithRule(args: {
  skipEnabled: boolean;
  priorityMatch: PriorityRuleMatch | null;
  categoryMatch: CategoryRuleMatch | null;
  /** Uniform roll in [0,1). When below `sampleRate`, fall through to the LLM. */
  sampleRoll: number;
  sampleRate: number;
}): boolean {
  if (!args.skipEnabled) return false;
  if (!args.priorityMatch) return false;
  if (args.sampleRoll < args.sampleRate) return false;
  if (!args.categoryMatch) return false;
  return true;
}
