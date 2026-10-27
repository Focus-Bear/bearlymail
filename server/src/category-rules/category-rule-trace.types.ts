/**
 * Compact, persisted record of what the deterministic-rule step actually did at
 * the moment an email's category was set during priority processing.
 *
 * Stored on `EmailThread.categoryRuleTrace` so the category-debug view can show
 * the ORIGINAL outcome alongside a live re-run. This is the only way to tell
 * "no rule matched when it was processed" apart from "a rule matches now but was
 * created/enabled afterwards" — the live trace alone cannot distinguish them.
 */
export interface CategoryRuleTraceSnapshot {
  /** ISO timestamp of when the rule step ran during processing. */
  evaluatedAt: string;
  /** True when the rule step executed (false reserved for short-circuit/error paths). */
  ruleStepRan: boolean;
  /** How many rules existed for the user when the email was processed. */
  rulesConsideredCount: number;
  /** The rule that won and set the category, or null when no eligible rule matched. */
  winningRuleId: string | null;
  /** Category name of the winning rule, mirrored for display without a rule lookup. */
  winningRuleCategoryName: string | null;
  /**
   * Rule IDs whose pattern matched the email but that did NOT set the category —
   * because they were disabled, lost to an earlier rule, or pointed at a removed
   * category. Lets the debug view explain why a "matching" rule was not applied.
   */
  matchedButNotWinningRuleIds: string[];
}
