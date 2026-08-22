/**
 * LocalModelAccuracyView — the "Local model accuracy (vs LLM)" admin panel.
 * Shows an overall agreement % and a per-category table with supervision-rate
 * trust badges (Trusted / Monitoring / Watching closely).
 *
 * For static screenshots: `cd client && npm run build-storybook`, open `storybook-static/index.html`.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { LocalModelAccuracyView } from 'components/admin/LocalModelAccuracySection';
import type { CategoryAccuracyReport } from 'components/admin/useLocalModelAccuracyData';

const meta: Meta<typeof LocalModelAccuracyView> = {
  title: 'Admin/LocalModelAccuracy',
  component: LocalModelAccuracyView,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof LocalModelAccuracyView>;

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    <MemoryRouter>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>{children}</div>
    </MemoryRouter>
  </I18nextProvider>
);

const REPORT: CategoryAccuracyReport = {
  overall: { samples: 452, agreements: 412, agreementPct: 91 },
  categories: [
    {
      category: 'GitHub PR Updates',
      sampleRatePercent: 10,
      lifetimeSamples: 1840,
      lifetimeAgreements: 1785,
      agreementPct: 97,
      windowSamples: 210,
      windowAgreements: 205,
    },
    {
      category: 'Newsletters',
      sampleRatePercent: 25,
      lifetimeSamples: 1320,
      lifetimeAgreements: 1162,
      agreementPct: 88,
      windowSamples: 160,
      windowAgreements: 141,
    },
    {
      category: 'Receipts & invoices',
      sampleRatePercent: 10,
      lifetimeSamples: 940,
      lifetimeAgreements: 902,
      agreementPct: 96,
      windowSamples: 118,
      windowAgreements: 112,
    },
    {
      category: 'Meeting scheduling',
      sampleRatePercent: 25,
      lifetimeSamples: 610,
      lifetimeAgreements: 543,
      agreementPct: 89,
      windowSamples: 74,
      windowAgreements: 66,
    },
    {
      category: 'Cold outreach: from others to me',
      sampleRatePercent: 50,
      lifetimeSamples: 388,
      lifetimeAgreements: 279,
      agreementPct: 72,
      windowSamples: 52,
      windowAgreements: 37,
    },
  ],
};

/** Populated report — overall 91% agreement with a mix of trust badges */
export const Populated: Story = {
  render: () => (
    <Wrapper>
      <LocalModelAccuracyView report={REPORT} loading={false} lastUpdated={new Date('2026-08-22T10:00:00Z')} />
    </Wrapper>
  ),
};

/** No supervised samples yet — empty state */
export const Empty: Story = {
  render: () => (
    <Wrapper>
      <LocalModelAccuracyView
        report={{ overall: { samples: 0, agreements: 0, agreementPct: 0 }, categories: [] }}
        loading={false}
        lastUpdated={null}
      />
    </Wrapper>
  ),
};
