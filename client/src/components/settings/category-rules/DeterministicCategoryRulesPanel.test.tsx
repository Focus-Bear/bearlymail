import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DeterministicCategoryRulesPanel } from './DeterministicCategoryRulesPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) {
        return `${key}:${String(opts.count)}`;
      }
      return key;
    },
  }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px' },
    colors: {
      background: { subtle: '#f5f5f5', paper: '#fff' },
      text: { primary: '#111', secondary: '#666', tertiary: '#999' },
      border: { light: '#e0e0e0', medium: '#ccc' },
      primary: { main: '#06c' },
      warning: { light: '#fef3c7', main: '#f59e0b' },
      accent: { warning: '#f59e0b' },
      feedback: { error: '#ef4444', success: '#22c55e', warning: '#f59e0b', info: '#3b82f6' },
    },
    borderRadius: { sm: '4px' },
    typography: { fontSize: { xs: '11px', sm: '12px' }, fontWeight: { semibold: 600, normal: 400 } },
  },
}));

describe('DeterministicCategoryRulesPanel', () => {
  it('shows empty translation key when there are no rules', () => {
    render(<DeterministicCategoryRulesPanel rules={[]} onToggleEnabled={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('settings.deterministicCategoryRules.empty')).toBeInTheDocument();
  });

  it('calls onToggleEnabled when the enabled checkbox changes', () => {
    const onToggle = vi.fn();
    render(
      <DeterministicCategoryRulesPanel
        rules={[
          {
            id: '1',
            categoryName: 'Cat',
            categoryId: 'cat-1',
            ruleKind: 'legacy',
            ruleType: 'exact_sender',
            pattern: 'a@b.co',
            subjectPrefix: null,
            compositeSpec: null,
            isEnabled: true,
            hitCount: 0,
            createdAt: '',
            updatedAt: '',
          },
        ]}
        onToggleEnabled={onToggle}
        onDelete={vi.fn()}
      />
    );
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('1', false);
  });

  it('shows the notification sub-streams a structural rule is pinned to', () => {
    render(
      <DeterministicCategoryRulesPanel
        rules={[
          {
            id: 'structural',
            categoryName: 'Human GitHub issue status updates',
            categoryId: 'cat-issues',
            ruleKind: 'composite',
            ruleType: null,
            pattern: '',
            subjectPrefix: null,
            compositeSpec: {
              v: 3,
              fromMatchesAny: ['notifications@github.com'],
              subjectContainsAny: [],
              bodyContainsAny: [],
              bodyNotContainsAny: ['Test Environment'],
              notificationSubtypeAny: ['github:issue:closed:human', 'github:issue:reopened:human'],
            },
            isEnabled: true,
            hitCount: 35,
            createdAt: '',
            updatedAt: '',
          },
        ]}
        onToggleEnabled={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(
      screen.getByText(
        'settings.deterministicCategoryRules.notificationSubtypeField: github:issue:closed:human' +
          'settings.deterministicCategoryRules.bodyPhraseSeparatorgithub:issue:reopened:human'
      )
    ).toBeInTheDocument();
  });
});
