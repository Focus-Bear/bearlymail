import React from 'react';
import { render, screen } from '@testing-library/react';

import { PriorityScoredByLine } from './PriorityScoredByLine';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { sourceLabel?: string }) =>
      options?.sourceLabel ? `${key}|${options.sourceLabel}` : key,
  }),
}));

describe('PriorityScoredByLine', () => {
  it('names the AI engine that scored the priority', () => {
    render(<PriorityScoredByLine source="llm" provider="jev" />);
    expect(screen.getByTestId('priority-scored-by')).toHaveTextContent(
      'priority.tooltip.scoredBy.label|priority.tooltip.aiProvider.jev'
    );
  });

  it('shows the rule label for a rule-scored priority', () => {
    render(<PriorityScoredByLine source="rule" provider={null} />);
    expect(screen.getByTestId('priority-scored-by')).toHaveTextContent(
      'priority.tooltip.scoredBy.label|priority.tooltip.scoredBy.rule'
    );
  });
});
