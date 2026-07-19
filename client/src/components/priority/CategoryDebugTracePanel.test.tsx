import React from 'react';
import { render, screen } from '@testing-library/react';

import {
  CategorizationTrace,
  CategoryRuleEvaluationDebug,
  CategoryRuleTraceSnapshot,
} from './CategoryDebugModal.types';
import { CategoryDebugTracePanel } from './CategoryDebugTracePanel';

// i18n mock returns the key (and ignores interpolation params), so any text that
// only appears via an interpolated string would NOT render the dynamic value.
// Shortlisted category names are rendered as raw text (not via t()), so they must
// appear directly in the DOM when the ordered list is shown.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px' },
    colors: {
      background: { subtle: '#f5f5f5', paper: '#fff', default: '#fafafa' },
      text: { primary: '#111', secondary: '#666', tertiary: '#999' },
      border: { default: '#e0e0e0', medium: '#ccc', light: '#eee' },
      feedback: { error: '#d32f2f', success: '#388e3c' },
      primary: { main: '#1976d2' },
    },
    borderRadius: { sm: '4px', md: '8px', lg: '12px' },
    typography: {
      fontSize: { xs: '11px', sm: '12px', base: '14px', xl: '18px' },
      fontWeight: { normal: 400, medium: 500, semibold: 600 },
    },
  },
}));

vi.mock('constants/category-rules', () => ({
  CATEGORY_RULE_KIND_COMPOSITE: 'composite',
}));

vi.mock('./CategoryDebugTraceEvaluationRow', () => ({
  CategoryDebugTraceEvaluationRow: () => <div data-testid="evaluation-row" />,
}));

const SHORTLIST_NAMES = ['✅ QA passed issues', '🐛 Human GitHub issue status updates', '🔧 GitHub PR Updates'];

function makeTrace(overrides: Partial<CategorizationTrace>): CategorizationTrace {
  return {
    deterministicRules: { winningRule: null, evaluations: [] },
    shortlist: { skipped: false, categoryNames: SHORTLIST_NAMES },
    smartModel: { category: '✅ QA passed issues', categoryExplanation: 'Matched deterministic rule' },
    evaluatedEmail: {
      emailId: 'email-1',
      isLatestInThread: true,
      evaluatedReceivedAt: '2026-06-01T00:00:00.000Z',
      latestReceivedAt: '2026-06-01T00:00:00.000Z',
      latestEmailId: 'email-1',
      threadEmailCount: 1,
    },
    ...overrides,
  };
}

// The shortlisted categories are the only <ol><li> list in the panel (the
// deterministic-rules section uses <details>, everything else uses <p>), so the
// rendered list items are an unambiguous proxy for "what the shortlist section shows".
function shortlistItemTexts(): string[] {
  return screen.queryAllByRole('listitem').map(item => item.textContent ?? '');
}

describe('CategoryDebugTracePanel — shortlist section', () => {
  it('lists shortlisted categories when a deterministic rule won', () => {
    // Regression for the bug where the shortlist was hidden once a rule won, making
    // the trace look like nothing was shortlisted.
    const trace = makeTrace({
      deterministicRules: {
        winningRule: {
          categoryName: '✅ QA passed issues',
          ruleId: 'rule-1',
          ruleType: null,
          ruleKind: 'composite',
        },
        evaluations: [],
      },
    });

    render(<CategoryDebugTracePanel trace={trace} />);

    expect(shortlistItemTexts()).toEqual(SHORTLIST_NAMES);
  });

  it('lists shortlisted categories when no rule matched', () => {
    render(<CategoryDebugTracePanel trace={makeTrace({})} />);

    expect(shortlistItemTexts()).toEqual(SHORTLIST_NAMES);
  });

  it('marks live shortlist items as "new" when they were not in the stored shortlist, and lists removed items', () => {
    // Stored shortlist (what the original decision saw) lacks "QA passed issues"
    // but includes a category that has since dropped out — so the live list should
    // mark QA passed as new and show the dropped category in a "removed" block.
    const storedShortlist = [
      '🐛 Human GitHub issue status updates',
      '🔧 GitHub PR Updates',
      'Legacy Category Removed Since',
    ];
    render(<CategoryDebugTracePanel trace={makeTrace({})} storedShortlist={storedShortlist} />);

    // "QA passed issues" also appears in the final-decision section, so scope
    // the assertions to the listitems of the shortlist <ol>.
    const itemTexts = screen.queryAllByRole('listitem').map(item => item.textContent ?? '');
    const qaItem = itemTexts.find(text => text.startsWith('✅ QA passed issues'));
    expect(qaItem).toContain('priority.categoryDebug.traceShortlistNewMarker');

    const unchangedItem = itemTexts.find(text => text.startsWith('🔧 GitHub PR Updates'));
    expect(unchangedItem).not.toContain('priority.categoryDebug.traceShortlistNewMarker');

    // The "removed from original" block shows the dropped category.
    expect(screen.getByText('priority.categoryDebug.traceShortlistRemovedLabel')).toBeInTheDocument();
    expect(screen.getByText('Legacy Category Removed Since')).toBeInTheDocument();
  });

  it('shows the skip reason and renders no list when shortlisting is skipped', () => {
    const trace = makeTrace({
      shortlist: {
        skipped: true,
        skipReason: 'Category count is at or below the shortlist threshold.',
        categoryNames: SHORTLIST_NAMES,
      },
    });

    render(<CategoryDebugTracePanel trace={trace} />);

    expect(
      screen.getByText('Category count is at or below the shortlist threshold.')
    ).toBeInTheDocument();
    expect(shortlistItemTexts()).toEqual([]);
  });
});

describe('CategoryDebugTracePanel — stale-reply warning', () => {
  const WARNING_KEY = 'priority.categoryDebug.traceNotLatestReplyWarning';

  it('warns when the rules were evaluated against an older reply in the thread', () => {
    const trace = makeTrace({
      evaluatedEmail: {
        emailId: 'older-email',
        isLatestInThread: false,
        evaluatedReceivedAt: '2026-05-30T10:00:00.000Z',
        latestReceivedAt: '2026-05-31T10:00:00.000Z',
        latestEmailId: 'newest-email',
        threadEmailCount: 3,
      },
    });

    render(<CategoryDebugTracePanel trace={trace} />);

    expect(screen.getByText(WARNING_KEY)).toBeInTheDocument();
  });

  it('does not warn when the evaluated email is the latest reply', () => {
    render(<CategoryDebugTracePanel trace={makeTrace({})} />);

    expect(screen.queryByText(WARNING_KEY)).not.toBeInTheDocument();
  });
});

describe('CategoryDebugTracePanel — processing-time history', () => {
  const KEY = 'priority.categoryDebug';

  function makeEval(overrides: Partial<CategoryRuleEvaluationDebug>): CategoryRuleEvaluationDebug {
    return {
      id: 'rule-1',
      ruleKind: 'composite',
      ruleType: null,
      categoryName: 'QA',
      pattern: '',
      subjectPrefix: null,
      isEnabled: true,
      hitCount: 0,
      patternMatches: false,
      isWinningRule: false,
      createdAt: '2026-05-01T00:00:00.000Z',
      ...overrides,
    };
  }

  const snapshotNoWinner: CategoryRuleTraceSnapshot = {
    evaluatedAt: '2026-06-01T00:00:00.000Z',
    ruleStepRan: true,
    rulesConsideredCount: 5,
    winningRuleId: null,
    winningRuleCategoryName: null,
    matchedButNotWinningRuleIds: ['d1'],
  };

  it('shows the no-record message when no snapshot is provided', () => {
    render(<CategoryDebugTracePanel trace={makeTrace({})} />);

    expect(screen.getByText(`${KEY}.traceProcessingNoRecord`)).toBeInTheDocument();
  });

  it('shows the processing-time outcome and matched-not-applied note from the snapshot', () => {
    render(<CategoryDebugTracePanel trace={makeTrace({})} processingSnapshot={snapshotNoWinner} />);

    expect(screen.getByText(`${KEY}.traceProcessingNoRuleMatched`)).toBeInTheDocument();
    expect(screen.getByText(`${KEY}.traceProcessingMatchedNotApplied`)).toBeInTheDocument();
    expect(screen.queryByText(`${KEY}.traceProcessingDivergence`)).not.toBeInTheDocument();
  });

  it('warns about divergence when a rule wins the live re-run but not at processing time', () => {
    const trace = makeTrace({
      deterministicRules: {
        winningRule: { categoryName: 'QA', ruleId: 'rule-x', ruleType: null, ruleKind: 'composite' },
        evaluations: [],
      },
    });

    render(<CategoryDebugTracePanel trace={trace} processingSnapshot={snapshotNoWinner} />);

    expect(screen.getByText(`${KEY}.traceProcessingDivergence`)).toBeInTheDocument();
  });

  it('flags a disabled match and a created-after-processing match distinctly (not as a winner)', () => {
    const trace = makeTrace({
      deterministicRules: {
        winningRule: null,
        evaluations: [
          makeEval({ id: 'd1', isEnabled: false, patternMatches: true, createdAt: '2026-05-01T00:00:00.000Z' }),
          makeEval({ id: 'n1', isEnabled: true, patternMatches: true, createdAt: '2026-06-05T00:00:00.000Z' }),
        ],
      },
    });

    render(<CategoryDebugTracePanel trace={trace} processingSnapshot={snapshotNoWinner} />);

    expect(screen.getByText(`${KEY}.traceRuleStatusDisabledButWouldMatch`)).toBeInTheDocument();
    expect(screen.getByText(`${KEY}.traceRuleStatusMatchedNewer`)).toBeInTheDocument();
    // Neither should be reported as the applied winner.
    expect(screen.queryByText(`${KEY}.traceRuleStatusWinner`)).not.toBeInTheDocument();
  });

  it('flags a matching rule whose category no longer exists (the silent-skip case)', () => {
    const trace = makeTrace({
      deterministicRules: {
        winningRule: null,
        evaluations: [
          makeEval({ id: 'broken', isEnabled: true, patternMatches: true, categoryExists: false }),
        ],
      },
    });

    render(<CategoryDebugTracePanel trace={trace} />);

    expect(screen.getByText(`${KEY}.traceRuleStatusMatchedCategoryMissing`)).toBeInTheDocument();
  });
});

describe('CategoryDebugTracePanel — stored-vs-live divergence warning', () => {
  it('warns when the stored category differs from the live re-run', () => {
    const trace = makeTrace({
      smartModel: { category: '✅ QA passed issues', categoryExplanation: 'x' },
    });
    render(
      <CategoryDebugTracePanel
        trace={trace}
        storedCategory="🐛 Human-reported Bug Issues"
        storedDecidedAt="2026-07-01T00:00:00.000Z"
      />
    );
    expect(screen.getByText('priority.categoryDebug.traceDivergenceTitle')).toBeInTheDocument();
    expect(screen.getByText('priority.categoryDebug.traceDivergenceBody')).toBeInTheDocument();
  });

  it('does not warn when stored and live categories match (case-insensitive)', () => {
    const trace = makeTrace({
      smartModel: { category: '✅ QA passed issues', categoryExplanation: 'x' },
    });
    render(<CategoryDebugTracePanel trace={trace} storedCategory="✅ qa Passed Issues" />);
    expect(screen.queryByText('priority.categoryDebug.traceDivergenceTitle')).not.toBeInTheDocument();
  });

  it('does not warn when there is no stored category', () => {
    const trace = makeTrace({
      smartModel: { category: '✅ QA passed issues', categoryExplanation: 'x' },
    });
    render(<CategoryDebugTracePanel trace={trace} />);
    expect(screen.queryByText('priority.categoryDebug.traceDivergenceTitle')).not.toBeInTheDocument();
  });
});
