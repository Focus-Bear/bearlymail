/**
 * SplitViewPanel.stories.tsx
 *
 * Uses the REAL SplitViewPanel component from the codebase.
 *
 * SplitViewPanel renders EmailDetail internally (a page component that uses
 * useParams + useAuth + API calls). The inner EmailDetail will show a
 * loading/not-found state in Storybook — that is expected and correct.
 * The REAL SplitViewPanel shell (title bar, action buttons, priority slider,
 * snooze form) is fully rendered by the real component.
 *
 * Providers required:
 *  - I18nextProvider (translations)
 *  - MemoryRouter with /email/:emailId route (useParams in EmailDetail)
 *  - AuthContext mock (useAuth in EmailDetail)
 *  - Redux Provider (store for email slice)
 */
import React, { createRef } from 'react';
import { I18nextProvider } from 'react-i18next';
import { FiMail } from 'react-icons/fi';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { SplitViewPanel } from 'components/inbox/SplitViewPanel';
import { AuthContext } from 'contexts/AuthContext';
import emailReducer from 'store/slices/emailSlice';

import { makeMockEmail, MOCK_EMAIL_NEWSLETTER, MOCK_EMAIL_WORK } from './storyHelpers/mockEmail';

// ---------------------------------------------------------------------------
// Mock Redux store (email slice with pre-loaded emails)
// ---------------------------------------------------------------------------
const mockStore = configureStore({
  reducer: { email: emailReducer },
});

// ---------------------------------------------------------------------------
// Mock AuthContext value (unauthenticated — EmailDetail will show loading/empty)
// ---------------------------------------------------------------------------
const mockAuthValue = {
  user: null,
  loading: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
};

// ---------------------------------------------------------------------------
// Wrapper providing all required contexts
// ---------------------------------------------------------------------------
const SplitViewPanelWrapper: React.FC<{
  emailId: string;
  email?: { subject: string; from: string; fromName?: string } | null;
  panelExpanded?: boolean;
  splitPosition?: number;
  isResizing?: boolean;
  isMobile?: boolean;
  mode?: 'action' | 'triage';
}> = ({
  emailId,
  email,
  panelExpanded = false,
  splitPosition = 40,
  isResizing = false,
  isMobile = false,
  mode = 'action',
}) => {
  const emailDetailRef = createRef<HTMLDivElement | null>();
  const getDetailFlex = () => {
    if (isMobile || panelExpanded) {
      return '1';
    }
    return `0 0 ${100 - splitPosition}%`;
  };
  const detailFlex = getDetailFlex();

  return (
    <I18nextProvider i18n={i18n}>
      <Provider store={mockStore}>
        {/* @ts-ignore — partial mock sufficient for story isolation */}
        <AuthContext.Provider value={mockAuthValue}>
          <MemoryRouter initialEntries={[`/email/${emailId}`]}>
            <Routes>
              <Route
                path="/email/:emailId"
                element={
                  <div
                    style={{
                      display: 'flex',
                      height: isMobile ? '480px' : '560px',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                    }}
                  >
                    {/* Simulated left list panel */}
                    {!isMobile && (
                      <>
                        <div
                          style={{
                            flex: `0 0 ${splitPosition}%`,
                            backgroundColor: '#F9FAFB',
                            borderRight: '1px solid #E5E7EB',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#9CA3AF',
                            fontSize: '13px',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <FiMail size={28} style={{ opacity: 0.3 }} />
                          <span>Email list panel</span>
                        </div>
                        <div
                          style={{
                            width: '4px',
                            backgroundColor: '#E5E7EB',
                            flexShrink: 0,
                            cursor: isResizing ? 'col-resize' : 'default',
                          }}
                        />
                      </>
                    )}

                    {/* REAL SplitViewPanel */}
                    <div style={{ flex: detailFlex, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <SplitViewPanel
                        selectedEmailId={emailId}
                        selectedEmail={email ?? undefined}
                        panelExpanded={panelExpanded}
                        splitPosition={splitPosition}
                        isResizing={isResizing}
                        emailDetailRef={emailDetailRef}
                        onTogglePanel={() => {}}
                        onClose={() => {}}
                        onArchiveComplete={() => {}}
                        onSnoozeComplete={() => {}}
                        onPrioritySet={() => {}}
                        mode={mode}
                      />
                    </div>
                  </div>
                }
              />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </Provider>
    </I18nextProvider>
  );
};

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------
const meta: Meta = {
  title: 'Inbox/SplitViewPanel',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Uses the REAL SplitViewPanel component. The inner EmailDetail panel will show a loading/not-found state (no auth in Storybook) — this is expected. The panel shell (title bar, action buttons, priority slider) is the real component. Wrapped with MemoryRouter + I18nextProvider + AuthContext mock + Redux Provider.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

export const WithEmail: Story = {
  name: 'With email',
  render: () => (
    <SplitViewPanelWrapper
      emailId={MOCK_EMAIL_WORK.id}
      email={{
        subject: MOCK_EMAIL_WORK.subject,
        from: MOCK_EMAIL_WORK.from,
        fromName: MOCK_EMAIL_WORK.fromName,
      }}
      splitPosition={40}
      mode="action"
    />
  ),
};

export const NewsletterEmail: Story = {
  name: 'Newsletter email',
  render: () => (
    <SplitViewPanelWrapper
      emailId={MOCK_EMAIL_NEWSLETTER.id}
      email={{
        subject: MOCK_EMAIL_NEWSLETTER.subject,
        from: MOCK_EMAIL_NEWSLETTER.from,
        fromName: MOCK_EMAIL_NEWSLETTER.fromName,
      }}
      splitPosition={40}
      mode="triage"
    />
  ),
};

export const PanelExpanded: Story = {
  name: 'Panel expanded (full width)',
  render: () => (
    <SplitViewPanelWrapper
      emailId={MOCK_EMAIL_WORK.id}
      email={{
        subject: MOCK_EMAIL_WORK.subject,
        from: MOCK_EMAIL_WORK.from,
        fromName: MOCK_EMAIL_WORK.fromName,
      }}
      panelExpanded
      splitPosition={40}
      mode="action"
    />
  ),
};

export const Mobile: Story = {
  name: 'Mobile',
  render: () => (
    <SplitViewPanelWrapper
      emailId={MOCK_EMAIL_WORK.id}
      email={{
        subject: MOCK_EMAIL_WORK.subject,
        from: MOCK_EMAIL_WORK.from,
        fromName: MOCK_EMAIL_WORK.fromName,
      }}
      isMobile
      mode="action"
    />
  ),
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

export const TriageMode: Story = {
  name: 'Triage mode',
  render: () => (
    <SplitViewPanelWrapper
      emailId={makeMockEmail({ id: 'email-urgent-1', wasDeliveredEarly: true }).id}
      email={{
        subject: 'Urgent: Server alert',
        from: 'alerts@pagerduty.com',
        fromName: 'PagerDuty',
      }}
      splitPosition={40}
      mode="triage"
    />
  ),
};
