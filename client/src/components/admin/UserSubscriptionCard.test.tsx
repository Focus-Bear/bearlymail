import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AdminOrgPlanInfo, UserWithSubscription } from 'hooks/useAdminDashboard';

import { UserSubscriptionCard } from './UserSubscriptionCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock('queries/usePlanTiers', () => ({
  usePlanTiers: () => ({
    data: [
      { id: 'bearlymail_starter', monthlyPriceUsd: 10, emailsPerCycle: 3000 },
      { id: 'bearlymail_growth', monthlyPriceUsd: 20, emailsPerCycle: 10000 },
      { id: 'bearlymail_enterprise', monthlyPriceUsd: 50, emailsPerCycle: 30000 },
    ],
  }),
}));

function buildOrg(overrides: Partial<AdminOrgPlanInfo> = {}): AdminOrgPlanInfo {
  return {
    id: 'org-1',
    planStatus: 'active',
    tier: 'bearlymail_growth',
    emailVolumeLimit: 10000,
    emailsUsedThisCycle: 42,
    trialEndsAt: null,
    maxSeats: 1,
    hasRevenueCatSubscription: false,
    ...overrides,
  };
}

function buildUser(overrides: Partial<UserWithSubscription> = {}): UserWithSubscription {
  return {
    id: 'user-abc-123',
    email: 'someone@example.com',
    name: 'Someone',
    subscriptionStatus: 'active',
    subscriptionExpiresAt: null,
    trialStartedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    org: buildOrg(),
    ...overrides,
  };
}

const noopHandlers = {
  extendingUserId: null,
  extendDays: 7,
  onExtendClick: vi.fn(),
  onExtendCancel: vi.fn(),
  onExtendTrial: vi.fn(),
  onExtendDaysChange: vi.fn(),
  grantingUserId: null,
  onGrantClick: vi.fn(),
  onGrantCancel: vi.fn(),
  onGrantPlan: vi.fn(),
  onRevokePlan: vi.fn(),
  onResetUsage: vi.fn(),
};

describe('UserSubscriptionCard', () => {
  it('shows the user ID and org plan state', () => {
    render(<UserSubscriptionCard userData={buildUser()} {...noopHandlers} />);

    expect(screen.getByTestId('user-id-value')).toHaveTextContent('user-abc-123');
    const chip = screen.getByTestId('org-plan-chip');
    expect(chip).toHaveTextContent('active');
    expect(chip).toHaveTextContent('team.settings.tierGrowth');
    expect(chip).toHaveTextContent('"used":"42"');
  });

  it('shows "no organisation" when the user has no org', () => {
    render(<UserSubscriptionCard userData={buildUser({ org: null })} {...noopHandlers} />);

    expect(screen.getByTestId('org-plan-chip')).toHaveTextContent('admin.dashboard.noOrg');
    expect(screen.queryByTestId('revoke-plan-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reset-usage-button')).not.toBeInTheDocument();
  });

  it('opens the tier picker and grants the selected tier', async () => {
    const onGrantPlan = vi.fn();
    render(
      <UserSubscriptionCard
        userData={buildUser()}
        {...noopHandlers}
        grantingUserId="user-abc-123"
        onGrantPlan={onGrantPlan}
      />
    );

    await userEvent.selectOptions(
      screen.getByTestId('grant-plan-tier-select'),
      'bearlymail_enterprise'
    );
    await userEvent.click(screen.getByTestId('grant-plan-confirm'));

    expect(onGrantPlan).toHaveBeenCalledWith('user-abc-123', 'bearlymail_enterprise');
  });

  it('calls onRevokePlan for an active plan', async () => {
    const onRevokePlan = vi.fn();
    render(
      <UserSubscriptionCard userData={buildUser()} {...noopHandlers} onRevokePlan={onRevokePlan} />
    );

    await userEvent.click(screen.getByTestId('revoke-plan-button'));

    expect(onRevokePlan).toHaveBeenCalledWith('user-abc-123');
  });

  it('disables grant and revoke when billing is managed by RevenueCat', () => {
    render(
      <UserSubscriptionCard
        userData={buildUser({ org: buildOrg({ hasRevenueCatSubscription: true }) })}
        {...noopHandlers}
      />
    );

    expect(screen.getByTestId('grant-plan-button')).toBeDisabled();
    expect(screen.getByTestId('revoke-plan-button')).toBeDisabled();
    expect(screen.getByTestId('grant-plan-button')).toHaveAttribute(
      'title',
      'admin.dashboard.managedByRevenueCat'
    );
  });
});
