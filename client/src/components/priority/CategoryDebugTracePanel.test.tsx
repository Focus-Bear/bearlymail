import React from 'react';
import { render, screen } from '@testing-library/react';

import { CategorizationTrace } from './CategoryDebugModal.types';
import { CategoryDebugTracePanel } from './CategoryDebugTracePanel';

// i18n mock returns the key (and ignores interpolation params), so any text that
// only appears via an interpolated string would NOT render the dynamic value.
// Shortlisted category names are rendered as raw text (not via t()), so they must
// appear directly in the DOM when the ordered list is shown.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('theme/theme', () => ({
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

jest.mock('constants/category-rules', () => ({
  CATEGORY_RULE_KIND_COMPOSITE: 'composite',
}));

jest.mock('./CategoryDebugTraceEvaluationRow', () => ({
  CategoryDebugTraceEvaluationRow: () => <div data-testid="evaluation-row" />,
}));

const SHORTLIST_NAMES = ['✅ QA passed issues', '🐛 Human GitHub issue status updates', '🔧 GitHub PR Updates'];

function makeTrace(overrides: Partial<CategorizationTrace>): CategorizationTrace {
  return {
    deterministicRules: { winningRule: null, evaluations: [] },
    shortlist: { skipped: false, categoryNames: SHORTLIST_NAMES },
    smartModel: { category: '✅ QA passed issues', categoryExplanation: 'Matched deterministic rule' },
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
