/**
 * Every path that files a thread under a deterministic rule must record WHICH
 * rule did it, because the inbox popover's "edit this rule" link opens the rule
 * by ID. Several rules can share a category name (and names change), so a
 * category name alone can open the wrong rule.
 *
 * The ID travels as a `(rule:<uuid>)` suffix on `categoryExplanation`; the
 * client parses it with a matching end-anchored regex
 * (`client/src/utils/categoryRuleLinks.ts`), so it must stay the LAST thing in
 * the explanation.
 */
const RULE_ID_MARKER_PREFIX = "(rule:";
const RULE_ID_MARKER_SUFFIX = ")";

export function withRuleIdMarker(explanation: string, ruleId: string): string {
  return `${explanation} ${RULE_ID_MARKER_PREFIX}${ruleId}${RULE_ID_MARKER_SUFFIX}`;
}
