import React from 'react';
import { render, screen } from '@testing-library/react';
import { VolumeUsage } from 'queries/useOrgUsage';

import { isPlanExpiredWarningVisible, PlanStatusBanner } from './PlanStatusBanner';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

function makeUsage(overrides: Partial<VolumeUsage>): VolumeUsage {
  return {
    emailsUsed: 0,
    emailLimit: 100,
    percentUsed: 0,
    tier: 'bearlymail_starter',
    planStatus: 'expired',
    trialEndsAt: null,
    ...overrides,
  };
}

describe('isPlanExpiredWarningVisible', () => {
  it('is true for an expired org', () => {
    expect(isPlanExpiredWarningVisible(makeUsage({ planStatus: 'expired' }))).toBe(true);
  });

  it('is false for trialling, active, self-hosted, or unknown status', () => {
    expect(isPlanExpiredWarningVisible(makeUsage({ planStatus: 'trial' }))).toBe(false);
    expect(isPlanExpiredWarningVisible(makeUsage({ planStatus: 'active' }))).toBe(false);
    expect(isPlanExpiredWarningVisible(makeUsage({ selfHosted: true }))).toBe(false);
    expect(isPlanExpiredWarningVisible(undefined)).toBe(false);
  });
});

describe('PlanStatusBanner expiredOnly', () => {
  it('renders the expired warning when expired', () => {
    render(<PlanStatusBanner expiredOnly volumeUsage={makeUsage({ planStatus: 'expired', emailLimit: 100 })} />);
    expect(screen.getByText(/planExpiredWarning/)).toBeInTheDocument();
  });

  it('renders nothing for a trial when expiredOnly is set', () => {
    const { container } = render(<PlanStatusBanner expiredOnly volumeUsage={makeUsage({ planStatus: 'trial' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('still shows the trial badge without expiredOnly', () => {
    render(<PlanStatusBanner volumeUsage={makeUsage({ planStatus: 'trial' })} />);
    expect(screen.getByText(/planTrialDaysLeft/)).toBeInTheDocument();
  });
});
