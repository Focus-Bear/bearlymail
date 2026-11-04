import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { CategoryDebugData, CURRENT_RULE_RECORDED_BY } from './CategoryDebugModal.types';
import { CategorySection } from './CategoryDebugPanels';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const RULE_ID = '11111111-2222-4333-8444-555555555555';

function renderSection(overrides: Partial<CategoryDebugData['thread']>) {
  const thread: CategoryDebugData['thread'] = {
    category: '🐛 Human GitHub issue status updates',
    categoryExplanation:
      'Incremental re-categorisation: deterministic rule matched "🐛 Human GitHub issue status updates".',
    categorySource: 'rule',
    shortlistedCategoryNames: null,
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <CategorySection thread={thread} />
    </MemoryRouter>
  );
}

describe('CategorySection — rule that set the category', () => {
  it('links to the rule by ID and says when it was found by re-matching', () => {
    renderSection({
      currentRule: {
        ruleId: RULE_ID,
        categoryName: '🐛 Human GitHub issue status updates',
        recordedBy: CURRENT_RULE_RECORDED_BY.LIVE_MATCH,
      },
    });

    expect(screen.getByText(RULE_ID)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'priority.categoryDebug.currentRuleEdit' }).getAttribute('href')).toBe(
      `/settings?openEditRuleId=${RULE_ID}#category-rules`
    );
    expect(screen.getByText('priority.categoryDebug.currentRuleLiveMatch')).toBeTruthy();
  });

  it('says the rule is unknown rather than linking to the whole list', () => {
    renderSection({ currentRule: null });

    expect(screen.getByText('priority.categoryDebug.currentRuleUnknown')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'priority.categoryDebug.currentRuleEdit' })).toBeNull();
  });

  it('shows no rule row for a category a rule did not set', () => {
    renderSection({ categorySource: 'priority' });

    expect(screen.queryByText('priority.categoryDebug.currentRuleLabel:')).toBeNull();
    expect(screen.queryByText('priority.categoryDebug.currentRuleUnknown')).toBeNull();
  });
});
