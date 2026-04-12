/**
 * EmailCard Width Fix — Issue #1170
 *
 * Uses the REAL EmailCard + EmailPreview components from the codebase.
 * Demonstrates the fix: `.animate-fade-in` now uses `width: 100%` instead
 * of the hardcoded `width: 651px`, so cards fill their container at any width.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { EmailCard } from 'components/inbox/EmailCard';
import { EmailPreview } from 'components/inbox/EmailPreview';

import { makeMockEmail, MOCK_EMAIL_NEWSLETTER, MOCK_EMAIL_WORK } from './storyHelpers/mockEmail';

// ---------------------------------------------------------------------------
// Container wrapper to show the card inside a constrained viewport
// ---------------------------------------------------------------------------
const ContainerWrapper = ({
  width,
  label,
  children,
}: {
  width: string | number;
  label: string;
  children: React.ReactNode;
}) => (
  <div style={{ marginBottom: '32px' }}>
    <div
      style={{
        fontSize: '11px',
        fontWeight: 600,
        color: '#6B7280',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        marginBottom: '8px',
      }}
    >
      {label}
    </div>
    <div
      style={{
        width,
        border: '1px dashed #D1D5DB',
        borderRadius: '8px',
        padding: '8px',
        backgroundColor: '#F9FAFB',
      }}
    >
      {children}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Wrapper component that renders EmailCard + EmailPreview
// ---------------------------------------------------------------------------
const EmailCardStory = ({
  email,
  isSelected = false,
  mode,
}: {
  email: ReturnType<typeof makeMockEmail>;
  isSelected?: boolean;
  mode?: 'action' | 'triage';
}) => (
  <I18nextProvider i18n={i18n}>
    <EmailCard email={email} isSelected={isSelected} onCardClick={() => {}} mode={mode}>
      <EmailPreview email={email} />
    </EmailCard>
  </I18nextProvider>
);

// ---------------------------------------------------------------------------
// Full demo showing cards at multiple container widths
// ---------------------------------------------------------------------------
const EmailCardWidthDemo = () => (
  <I18nextProvider i18n={i18n}>
    <div>
      <div
        style={{
          background: '#FEF3C7',
          border: '1px solid #F59E0B',
          borderRadius: '8px',
          padding: '8px 16px',
          marginBottom: '24px',
          fontSize: '13px',
          color: '#92400E',
        }}
      >
        <strong>Fix #1170:</strong> <code>.animate-fade-in</code> now uses <code>width: 100%</code> instead of the
        hardcoded <code>width: 651px</code>. Cards fill their container at any viewport width.
      </div>

      <ContainerWrapper width="100%" label="Full width (flex/grid column)">
        <EmailCard email={MOCK_EMAIL_WORK} isSelected={false} onCardClick={() => {}} mode="action">
          <EmailPreview email={MOCK_EMAIL_WORK} />
        </EmailCard>
      </ContainerWrapper>

      <ContainerWrapper width="640px" label="640px container (narrow panel)">
        <EmailCard email={MOCK_EMAIL_NEWSLETTER} isSelected={false} onCardClick={() => {}}>
          <EmailPreview email={MOCK_EMAIL_NEWSLETTER} />
        </EmailCard>
      </ContainerWrapper>

      <ContainerWrapper width="480px" label="480px container (side panel / split view)">
        <EmailCard email={MOCK_EMAIL_WORK} isSelected onCardClick={() => {}} mode="action">
          <EmailPreview email={MOCK_EMAIL_WORK} />
        </EmailCard>
      </ContainerWrapper>

      <ContainerWrapper width="360px" label="360px container (mobile viewport)">
        <EmailCard
          email={makeMockEmail({
            subject: '🚨 Urgent: Server alert',
            from: 'alerts@pagerduty.com',
            fromName: 'PagerDuty',
            summary: 'HIGH: API response time exceeded 2000ms threshold.',
            wasDeliveredEarly: true,
            isRead: false,
          })}
          isSelected={false}
          onCardClick={() => {}}
          mode="triage"
        >
          <EmailPreview
            email={makeMockEmail({
              subject: '🚨 Urgent: Server alert',
              wasDeliveredEarly: true,
            })}
          />
        </EmailCard>
      </ContainerWrapper>
    </div>
  </I18nextProvider>
);

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------
const meta: Meta = {
  title: 'Inbox/EmailCard Width Fix',
  parameters: {
    docs: {
      description: {
        component:
          'Demonstrates the fix for issue #1170: `.animate-fade-in` now uses `width: 100%` instead of the hardcoded `651px`, ensuring email cards fill their container at any viewport width. Uses the REAL EmailCard + EmailPreview components.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

/**
 * Shows the email card at multiple container widths (full, 640px, 480px, 360px).
 * Before the fix, cards would overflow or be clipped at widths below 651px.
 * After the fix, all cards fill 100% of their container.
 */
export const ResponsiveContainerFill: Story = {
  render: () => <EmailCardWidthDemo />,
  name: 'Responsive container fill (width: 100%)',
};

/**
 * Read email — lighter border, normal font weight.
 */
export const ReadEmail: Story = {
  render: () => (
    <EmailCardStory
      email={makeMockEmail({
        subject: 'Weekly digest — focus time report',
        from: 'noreply@focusbear.io',
        fromName: 'Focus Bear',
        summary: 'You hit 4.5 hours of deep work this week!',
        isRead: true,
      })}
    />
  ),
  name: 'Read email',
};

/**
 * Selected email card — highlighted with primary colour.
 */
export const SelectedEmail: Story = {
  render: () => (
    <EmailCardStory
      email={makeMockEmail({
        subject: 'Re: Q1 roadmap review',
        from: 'jeremy@focusbear.io',
        fromName: 'Jeremy',
        summary: "Looks good overall. Let's sync on the email card fix timeline.",
        isRead: false,
      })}
      isSelected
    />
  ),
  name: 'Selected email',
};

/**
 * Emergency-delivered email in triage mode — shows the warning ribbon.
 */
export const EmergencyDelivery: Story = {
  render: () => (
    <EmailCardStory
      email={makeMockEmail({
        subject: '🔥 Production incident — login service down',
        from: 'alerts@pagerduty.com',
        fromName: 'PagerDuty',
        summary: 'CRITICAL: Authentication service returning 503.',
        wasDeliveredEarly: true,
        isRead: false,
      })}
      mode="triage"
    />
  ),
  name: 'Emergency delivery (wasDeliveredEarly)',
};
