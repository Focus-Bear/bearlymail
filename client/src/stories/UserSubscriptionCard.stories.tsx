/**
 * UserSubscriptionCard stories — admin dashboard card showing a user's org
 * plan (status/tier/usage chip, copyable user ID) with grant / revoke /
 * reset-usage actions.
 *
 * GrantPlanForm fetches GET /subscriptions/tiers via usePlanTiers (React
 * Query), so tiers are supplied by seeding the QueryClient cache — no
 * network calls happen in Storybook.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';

import { UserSubscriptionCard } from 'components/admin/UserSubscriptionCard';
import { AdminOrgPlanInfo, UserWithSubscription } from 'hooks/useAdminDashboard';

const cardI18n = i18n.createInstance();
cardI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'common.cancel': 'Cancel',
        'admin.dashboard.noName': 'No name',
        'admin.dashboard.status': 'Status',
        'admin.dashboard.none': 'None',
        'admin.dashboard.expires': 'Expires',
        'admin.dashboard.joined': 'Joined',
        'admin.dashboard.extendTrial': 'Extend Trial',
        'admin.dashboard.copyUserId': 'Copy user ID',
        'admin.dashboard.copy': 'Copy',
        'admin.dashboard.copied': 'Copied!',
        'admin.dashboard.orgPlan': 'Org plan',
        'admin.dashboard.noOrg': 'No organisation',
        'admin.dashboard.orgUsage': '{{used}} / {{limit}} emails',
        'admin.dashboard.trialEnds': 'Trial ends',
        'admin.dashboard.revenueCatBilled': 'Billed via RevenueCat',
        'admin.dashboard.grantPlan': 'Grant plan',
        'admin.dashboard.grant': 'Grant',
        'admin.dashboard.selectTier': 'Select tier',
        'admin.dashboard.revokePlan': 'Revoke plan',
        'admin.dashboard.resetUsage': 'Reset usage',
        'admin.dashboard.managedByRevenueCat':
          'Billing is managed by RevenueCat — manual plan changes are disabled',
        'team.settings.tierStarter': 'Starter',
        'team.settings.tierGrowth': 'Growth',
        'team.settings.tierEnterprise': 'Enterprise',
      },
    },
  },
  interpolation: { escapeValue: false },
});

const DEMO_TIERS = [
  { id: 'bearlymail_starter', monthlyPriceUsd: 10, emailsPerCycle: 3000 },
  { id: 'bearlymail_growth', monthlyPriceUsd: 20, emailsPerCycle: 10000 },
  { id: 'bearlymail_enterprise', monthlyPriceUsd: 50, emailsPerCycle: 30000 },
];

function buildOrg(overrides: Partial<AdminOrgPlanInfo> = {}): AdminOrgPlanInfo {
  return {
    id: 'org-1',
    planStatus: 'active',
    tier: 'bearlymail_growth',
    emailVolumeLimit: 10000,
    emailsUsedThisCycle: 4213,
    trialEndsAt: null,
    maxSeats: 1,
    hasRevenueCatSubscription: false,
    ...overrides,
  };
}

function buildUser(overrides: Partial<UserWithSubscription> = {}): UserWithSubscription {
  return {
    id: '7f3b2c1d-9e8a-4f5b-b6c7-d8e9f0a1b2c3',
    email: 'alice@example.com',
    name: 'Alice Example',
    subscriptionStatus: 'active',
    subscriptionExpiresAt: null,
    trialStartedAt: null,
    createdAt: '2026-01-15T00:00:00.000Z',
    org: buildOrg(),
    ...overrides,
  };
}

const noopHandlers = {
  extendingUserId: null,
  extendDays: 7,
  onExtendClick: () => {},
  onExtendCancel: () => {},
  onExtendTrial: () => {},
  onExtendDaysChange: () => {},
  onGrantClick: () => {},
  onGrantCancel: () => {},
  onGrantPlan: () => {},
  onRevokePlan: () => {},
  onResetUsage: () => {},
};

const UserSubscriptionCardDemo: React.FC<{
  userData: UserWithSubscription;
  grantingUserId?: string | null;
}> = ({ userData, grantingUserId = null }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['subscriptions', 'tiers'], DEMO_TIERS);

  return (
    <I18nextProvider i18n={cardI18n}>
      <QueryClientProvider client={queryClient}>
        <div style={{ maxWidth: 850 }}>
          <UserSubscriptionCard
            userData={userData}
            grantingUserId={grantingUserId}
            {...noopHandlers}
          />
        </div>
      </QueryClientProvider>
    </I18nextProvider>
  );
};

const meta: Meta<typeof UserSubscriptionCardDemo> = {
  title: 'Admin/UserSubscriptionCard',
  component: UserSubscriptionCardDemo,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof UserSubscriptionCardDemo>;

export const TrialOrg: Story = {
  name: 'Trial org — grant available',
  args: {
    userData: buildUser({
      subscriptionStatus: 'trialing',
      org: buildOrg({
        planStatus: 'trial',
        tier: null,
        emailVolumeLimit: 3000,
        emailsUsedThisCycle: 812,
        trialEndsAt: '2026-07-20T00:00:00.000Z',
      }),
    }),
  },
};

export const ActiveComplimentaryPlan: Story = {
  name: 'Active complimentary plan — revoke visible',
  args: { userData: buildUser() },
};

export const ExpiredGrantFormOpen: Story = {
  name: 'Expired org — grant form open (tier picker)',
  args: {
    userData: buildUser({
      subscriptionStatus: 'expired',
      org: buildOrg({
        planStatus: 'expired',
        tier: null,
        emailVolumeLimit: 3000,
        emailsUsedThisCycle: 3000,
      }),
    }),
    grantingUserId: '7f3b2c1d-9e8a-4f5b-b6c7-d8e9f0a1b2c3',
  },
};

export const RevenueCatBilled: Story = {
  name: 'RevenueCat-billed org — manual actions disabled',
  args: {
    userData: buildUser({
      org: buildOrg({ hasRevenueCatSubscription: true }),
    }),
  },
};
