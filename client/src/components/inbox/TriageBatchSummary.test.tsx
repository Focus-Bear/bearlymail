import React from 'react';
import { render, screen } from '@testing-library/react';

import { PriorityCounts } from 'hooks/usePriorityCounts';

import { TriageBatchSummary } from './TriageBatchSummary';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number; label?: string }) => {
      if (opts?.label !== undefined) {
        return `${opts.count} ${opts.label}`;
      }
      if (opts?.count !== undefined) {
        return `${key}(${opts.count})`;
      }
      return key;
    },
  }),
}));

const makeCounts = (overrides: Partial<PriorityCounts> = {}): PriorityCounts => ({
  veryHigh: 0,
  high: 0,
  medium: 0,
  low: 0,
  veryLow: 0,
  unprioritised: 0,
  ...overrides,
});

describe('TriageBatchSummary', () => {
  it('renders the total and the non-empty priority bands', () => {
    render(<TriageBatchSummary counts={makeCounts({ high: 12, medium: 20, low: 15 })} isVisible />);

    const summary = screen.getByTestId('triage-batch-summary');
    expect(summary).toHaveTextContent('inbox.batchSummary.total(47)');
    expect(summary).toHaveTextContent('12 priority.high');
    expect(summary).toHaveTextContent('20 priority.medium');
    expect(summary).toHaveTextContent('15 priority.low');
    expect(summary).not.toHaveTextContent('priority.veryHigh');
  });

  it('renders nothing when not visible', () => {
    render(<TriageBatchSummary counts={makeCounts({ high: 12 })} isVisible={false} />);
    expect(screen.queryByTestId('triage-batch-summary')).not.toBeInTheDocument();
  });

  it('renders nothing when counts have not loaded yet', () => {
    render(<TriageBatchSummary counts={null} isVisible />);
    expect(screen.queryByTestId('triage-batch-summary')).not.toBeInTheDocument();
  });

  it('renders nothing for an empty triage batch', () => {
    render(<TriageBatchSummary counts={makeCounts()} isVisible />);
    expect(screen.queryByTestId('triage-batch-summary')).not.toBeInTheDocument();
  });
});
