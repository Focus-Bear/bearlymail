import { categoryRuleSettingsPath, extractMatchedRuleId } from './categoryRuleLinks';

const RULE_ID = '263666e4-b0a6-47c6-b310-a1dcdb42e4e3';

describe('categoryRuleSettingsPath', () => {
  it('links to the rule by ID only', () => {
    expect(categoryRuleSettingsPath(RULE_ID)).toBe(`/settings?openEditRuleId=${RULE_ID}#category-rules`);
  });

  it('links to the rules list, with no rule param, when the rule ID is unknown', () => {
    expect(categoryRuleSettingsPath(null)).toBe('/settings#category-rules');
  });
});

describe('extractMatchedRuleId', () => {
  it.each([
    `Matched deterministic rule (composite): category="📅 Meeting Reschedule Requests" (rule:${RULE_ID})`,
    `Deterministic rule (category "🐛 Human GitHub issue status updates") applied retroactively — the rule was created or updated after this thread was last processed. (rule:${RULE_ID})`,
    `Deterministic priority+category rule (category "CI") (rule:${RULE_ID})`,
  ])('reads the rule ID every rule writer records: %s', explanation => {
    expect(extractMatchedRuleId(explanation)).toBe(RULE_ID);
  });

  it.each([null, undefined, '', 'Deterministic priority+category rule (category "CI")'])(
    'returns null when no rule ID was recorded (%s)',
    explanation => {
      expect(extractMatchedRuleId(explanation)).toBeNull();
    }
  );
});
