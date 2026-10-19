import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { OpenTrackingStats } from 'hooks/useEmailStats';

import { OpenTrackingStatsSection } from './OpenTrackingStatsSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));

const stats: OpenTrackingStats = {
  sentCount: 12,
  trackedCount: 10,
  openedCount: 4,
  automaticOnlyCount: 1,
  openRate: 0.4,
  medianMinutesToFirstOpen: 90,
};

const renderSection = (value: OpenTrackingStats | null) =>
  render(
    <MemoryRouter>
      <OpenTrackingStatsSection stats={value} />
    </MemoryRouter>
  );

describe('OpenTrackingStatsSection', () => {
  it('shows open rate, tracked count and median time to first open', () => {
    renderSection(stats);
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('1.5h')).toBeInTheDocument();
    expect(screen.getByText(/stats\.openTracking\.untrackedNote.*"count":2/)).toBeInTheDocument();
  });

  it('shows an empty state linking to the setting when nothing was tracked', () => {
    renderSection({ ...stats, trackedCount: 0, openedCount: 0, openRate: null });
    expect(screen.getByText(/stats\.openTracking\.empty/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'stats.openTracking.manageSetting' })).toHaveAttribute(
      'href',
      '/settings#email-tracking'
    );
  });
});
