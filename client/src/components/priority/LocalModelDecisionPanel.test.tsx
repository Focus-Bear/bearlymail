import React from 'react';
import { render, screen } from '@testing-library/react';

import type { LocalModelDebugSnapshot } from './CategoryDebugModal.types';
import { LocalModelDecisionPanel } from './LocalModelDecisionPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const snapshot: LocalModelDebugSnapshot = {
  evaluatedAt: '2026-06-14T00:00:00.000Z',
  decidedBy: 'llm',
  category: 'GitHub PR Updates',
  family: 'GitHub / Pull Requests',
  categoryConfidence: 0.42,
  categoryMargin: 0.1,
  categoryFallback: true,
  familyConfidence: 0.95,
  familyFallback: false,
  priorityBand: 'med',
  priorityConfidence: 0.88,
  priorityFallback: false,
  llmCategory: 'GitHub Bot PR Updates',
  llmPriorityBand: 'med',
  categoryAgree: false,
  priorityAgree: true,
};

describe('LocalModelDecisionPanel', () => {
  it('shows a not-scored note when there is no snapshot', () => {
    render(<LocalModelDecisionPanel localModelDebug={null} />);
    expect(
      screen.getByText('priority.categoryDebug.localModel.notScored'),
    ).toBeInTheDocument();
  });

  it('shows the local prediction, the LLM value, and agreement', () => {
    render(<LocalModelDecisionPanel localModelDebug={snapshot} />);
    // local family + category render
    expect(screen.getByText('GitHub / Pull Requests')).toBeInTheDocument();
    expect(screen.getByText('GitHub PR Updates')).toBeInTheDocument();
    // the LLM's (differing) category renders for comparison
    expect(screen.getByText('GitHub Bot PR Updates')).toBeInTheDocument();
    // category differs, priority matches → one of each chip
    expect(
      screen.getByText('priority.categoryDebug.localModel.disagree'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('priority.categoryDebug.localModel.agree'),
    ).toBeInTheDocument();
    // category fell back to the LLM (below threshold marker shows)
    expect(
      screen.getByText('priority.categoryDebug.localModel.belowThreshold'),
    ).toBeInTheDocument();
  });

  it('reflects decided-by-local when the local model was authoritative', () => {
    render(
      <LocalModelDecisionPanel
        localModelDebug={{ ...snapshot, decidedBy: 'local' }}
      />,
    );
    expect(
      screen.getByText('priority.categoryDebug.localModel.decidedByLocal'),
    ).toBeInTheDocument();
  });
});
