/**
 * PlanStatusBanner stories — shows each org plan state (trial badge, active
 * tier line, expired warning with Upgrade CTA) on the app's light background.
 * Note: 'unpaid' renders identically to 'expired' (same fallback branch).
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';
import { VolumeUsage } from 'queries/useOrgUsage';

import { PlanStatusBanner } from 'components/settings/PlanStatusBanner';
import { MS_PER_DAY } from 'constants/numbers';

const bannerI18n = i18n.createInstance();
bannerI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'team.settings.planTrialDaysLeft_one': 'Trial — {{count}} day left',
        'team.settings.planTrialDaysLeft_other': 'Trial — {{count}} days left',
        'team.settings.planActive': 'Plan: {{tier}}',
        'team.settings.planExpiredWarning':
          "Your trial has expired — emails beyond the free limit ({{limit}}/cycle) won't get AI processing.",
        'team.settings.planUpgrade': 'Upgrade',
      },
    },
  },
  interpolation: { escapeValue: false },
});

function buildVolumeUsage(overrides: Partial<VolumeUsage>): VolumeUsage {
  return {
    emailsUsed: 1200,
    emailLimit: 3000,
    percentUsed: 40,
    tier: 'bearlymail_starter',
    planStatus: 'active',
    trialEndsAt: null,
    ...overrides,
  };
}

const PlanStatusBannerDemo: React.FC<{ volumeUsage: VolumeUsage }> = ({ volumeUsage }) => (
  <I18nextProvider i18n={bannerI18n}>
    <div style={{ maxWidth: 700, padding: 24, backgroundColor: '#ffffff' }}>
      <PlanStatusBanner volumeUsage={volumeUsage} />
    </div>
  </I18nextProvider>
);

const meta: Meta<typeof PlanStatusBannerDemo> = {
  title: 'Settings/PlanStatusBanner',
  component: PlanStatusBannerDemo,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof PlanStatusBannerDemo>;

export const Trial: Story = {
  name: 'Trial — 5 days left',
  args: {
    volumeUsage: buildVolumeUsage({
      planStatus: 'trial',
      // 4.5 days out rounds up to a stable "5 days left" regardless of render time.
      trialEndsAt: new Date(Date.now() + 4.5 * MS_PER_DAY).toISOString(),
    }),
  },
};

export const Active: Story = {
  name: 'Active — Growth tier',
  args: {
    volumeUsage: buildVolumeUsage({
      planStatus: 'active',
      tier: 'bearlymail_growth',
      emailLimit: 10000,
    }),
  },
};

export const Expired: Story = {
  name: 'Expired — upgrade CTA',
  args: {
    volumeUsage: buildVolumeUsage({
      planStatus: 'expired',
      emailsUsed: 3000,
      percentUsed: 100,
    }),
  },
};

/**
 * How the expired warning appears in the Inbox (issue 2): rendered in
 * `expiredOnly` mode below the inbox header/tabs and above the "No new emails"
 * empty state, so it never disturbs that layout for non-expired users.
 */
const InboxContextDemo: React.FC<{ volumeUsage: VolumeUsage }> = ({ volumeUsage }) => (
  <I18nextProvider i18n={bannerI18n}>
    <div style={{ width: 760, backgroundColor: '#f7f8fa', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', gap: 24, padding: '14px 16px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#ffffff' }}>
        <span style={{ fontWeight: 700, color: '#4f46e5' }}>Triage</span>
        <span style={{ color: '#6b7280' }}>Action</span>
        <span style={{ color: '#6b7280' }}>Follow-Up</span>
      </div>
      <div style={{ padding: '8px 16px 0' }}>
        <PlanStatusBanner volumeUsage={volumeUsage} expiredOnly onUpgradeClick={() => undefined} />
      </div>
      <div style={{ padding: '64px 16px', textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>No new emails</div>
        <div style={{ fontSize: 14, marginTop: 4 }}>You&apos;re all caught up.</div>
      </div>
    </div>
  </I18nextProvider>
);

export const InboxExpired: StoryObj<typeof InboxContextDemo> = {
  name: 'Inbox — expired warning above empty state',
  render: args => <InboxContextDemo {...args} />,
  args: {
    volumeUsage: buildVolumeUsage({
      planStatus: 'expired',
      emailLimit: 100,
      emailsUsed: 100,
      percentUsed: 100,
    }),
  },
};
