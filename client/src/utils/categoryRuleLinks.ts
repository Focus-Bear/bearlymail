import { EDIT_RULE_ID_PARAM } from 'constants/category-rules';
import { SETTINGS_ANCHORS, settingsAnchorPath } from 'constants/settingsAnchors';

/**
 * The server ends a rule-decided `categoryExplanation` with `(rule:<uuid>)`
 * (`server/src/category-rules/category-rule-explanation.helper.ts`) so the UI
 * can open the SPECIFIC rule that fired — several rules can share a category.
 */
const RULE_ID_MARKER_RE = /\(rule:([0-9a-f-]+)\)\s*$/i;

export function extractMatchedRuleId(explanation: string | null | undefined): string | null {
  if (!explanation) {
    return null;
  }
  const match = RULE_ID_MARKER_RE.exec(explanation);
  return match ? match[1] : null;
}

/**
 * Settings path for a deterministic rule: opens that rule's editor when the ID
 * is known, otherwise just the rules list. Never falls back to the category
 * name — a name can belong to several rules, so it can open the wrong one.
 */
export function categoryRuleSettingsPath(ruleId: string | null): string {
  const query = ruleId ? `${EDIT_RULE_ID_PARAM}=${encodeURIComponent(ruleId)}` : undefined;
  return settingsAnchorPath(SETTINGS_ANCHORS.CATEGORY_RULES, query);
}
