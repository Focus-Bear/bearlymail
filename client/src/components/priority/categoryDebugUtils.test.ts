import { CategoryDebugData, CURRENT_RULE_RECORDED_BY, CurrentCategoryRule } from './CategoryDebugModal.types';
import { formatForGithubIssue } from './categoryDebugUtils';

const APP_ORIGIN = 'https://app.bearlymail.com';
const CATEGORY = '🐛 Human GitHub issue status updates';
const CURRENT_RULE_ID = '11111111-2222-4333-8444-555555555555';
const OLD_TRACE_RULE_ID = '692f8698-5a2e-458f-bfef-0ae9f9af1cd8';

/** Shaped like the 2026-11-04 report: a rule-set category whose explanation has no rule ID and a 2026-10-15 trace. */
function debugData(currentRule: CurrentCategoryRule | null): CategoryDebugData {
  return {
    email: {
      emailId: 'email-1',
      from: 'notifications@github.com',
      fromName: 'QA Tester',
      senderJobTitle: '',
      subject: 'Re: [Focus-Bear/Mac-App] Blocking stops working (Issue #2928)',
      bodyPreview: '',
      receivedAt: null,
    },
    threadEmails: [],
    thread: {
      category: CATEGORY,
      categoryExplanation: `Incremental re-categorisation: deterministic rule matched "${CATEGORY}".`,
      categorySource: 'rule',
      shortlistedCategoryNames: null,
      categoryRuleTrace: {
        evaluatedAt: '2026-10-15T12:50:24.854Z',
        ruleStepRan: true,
        rulesConsideredCount: 132,
        winningRuleId: OLD_TRACE_RULE_ID,
        winningRuleCategoryName: CATEGORY,
        matchedButNotWinningRuleIds: [],
      },
      currentRule,
    },
    emailCategories: [],
    protoCategories: [],
    userContext: { urgentItems: [], notUrgentItems: [], goals: [], workingOn: [], dontCare: [] },
  } as CategoryDebugData;
}

function lineStarting(report: string, prefix: string): string {
  return report.split('\n').find(line => line.startsWith(prefix)) ?? '';
}

describe('formatForGithubIssue — current category rule', () => {
  it('names the rule that set the category, with its ID and a link that opens it', () => {
    const report = formatForGithubIssue(
      debugData({ ruleId: CURRENT_RULE_ID, categoryName: CATEGORY, recordedBy: CURRENT_RULE_RECORDED_BY.EXPLANATION }),
      APP_ORIGIN
    );

    expect(lineStarting(report, '- **Rule that set this category**')).toBe(
      `- **Rule that set this category**: ${CATEGORY} (rule ${CURRENT_RULE_ID}) — ${APP_ORIGIN}/settings?openEditRuleId=${CURRENT_RULE_ID}#category-rules`
    );
  });

  it('labels the processing-time trace historical and flags that it names a different rule', () => {
    const report = formatForGithubIssue(
      debugData({ ruleId: CURRENT_RULE_ID, categoryName: CATEGORY, recordedBy: CURRENT_RULE_RECORDED_BY.LIVE_MATCH }),
      APP_ORIGIN
    );

    const traceLine = lineStarting(report, '- **Rule trace');
    expect(traceLine).toContain('historical, from processing time 2026-10-15T12:50:24.854Z');
    expect(traceLine).toContain(OLD_TRACE_RULE_ID);
    expect(traceLine).toContain('a different rule from the one that set the current category');
    expect(lineStarting(report, '- **Rule that set this category**')).toContain(
      'ID not recorded when this was set; this is the rule that matches the newest email now'
    );
  });

  it('does not flag the trace when it names the current rule', () => {
    const data = debugData({
      ruleId: OLD_TRACE_RULE_ID,
      categoryName: CATEGORY,
      recordedBy: CURRENT_RULE_RECORDED_BY.EXPLANATION,
    });

    expect(lineStarting(formatForGithubIssue(data, APP_ORIGIN), '- **Rule trace')).not.toContain('different rule');
  });

  it('says so when no rule can be identified', () => {
    const report = formatForGithubIssue(debugData(null), APP_ORIGIN);

    expect(lineStarting(report, '- **Rule that set this category**')).toContain('not recorded');
  });

  it('names a deleted rule by its ID', () => {
    const report = formatForGithubIssue(
      debugData({ ruleId: CURRENT_RULE_ID, categoryName: null, recordedBy: CURRENT_RULE_RECORDED_BY.EXPLANATION }),
      APP_ORIGIN
    );

    expect(lineStarting(report, '- **Rule that set this category**')).toContain(
      `rule since deleted (rule ${CURRENT_RULE_ID})`
    );
  });

  it('leaves the rule line out when a rule did not set the category', () => {
    const data = debugData(null);
    data.thread.categorySource = 'priority';

    expect(formatForGithubIssue(data, APP_ORIGIN)).not.toContain('Rule that set this category');
  });
});
