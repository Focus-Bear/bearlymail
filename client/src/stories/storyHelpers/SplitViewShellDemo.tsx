/**
 * SplitViewShellDemo — stateful wrapper and mock child for SplitViewPanelShell stories.
 * MockEmailDetailPane provides a simple slot child; ShellDemo manages panel state.
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { SplitViewPanelShell } from 'components/inbox/SplitViewPanelShell';

import { splitViewI18n } from './i18nInstances';

// ---------------------------------------------------------------------------
// Mock child — represents the email detail body injected via children slot
// ---------------------------------------------------------------------------

export const MockEmailDetailPane: React.FC<{ emailId?: string }> = ({ emailId }) => (
  <div
    style={{
      padding: '24px',
      color: '#6B7280',
      fontSize: '14px',
      fontStyle: 'italic',
      lineHeight: 1.6,
    }}
  >
    <div style={{ marginBottom: '8px', fontWeight: 600, color: '#111827' }}>📧 Mock Email Detail</div>
    <div>Email ID: {emailId ?? 'email-001'}</div>
    <div style={{ marginTop: '12px' }}>
      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
      magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
    </div>
    <div style={{ marginTop: '12px', padding: '12px', background: '#F3F4F6', borderRadius: '8px' }}>
      <strong>Reply from Alice:</strong> Thanks for following up! I'll get back to you by end of week.
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Demo wrapper — manages snooze / star / archive state
// ---------------------------------------------------------------------------

export interface ShellDemoProps {
  showEmail?: boolean;
  starCount?: number;
  showSnoozeInput?: boolean;
  panelExpanded?: boolean;
}

export const ShellDemo: React.FC<ShellDemoProps> = ({
  showEmail = true,
  starCount: initialStarCount = 0,
  showSnoozeInput: initialSnooze = false,
  panelExpanded = false,
}) => {
  const [starCount, setStarCount] = useState(initialStarCount);
  const [showSnooze, setShowSnooze] = useState(initialSnooze);
  const [snoozeValue, setSnoozeValue] = useState('');
  const [archived, setArchived] = useState(false);

  if (archived) {
    return <div style={{ padding: '16px', color: '#059669', fontWeight: 500 }}>✅ Email archived!</div>;
  }

  const selectedEmail = showEmail
    ? {
        subject: 'Re: Monash Grand Prix Event — Catering Confirmation',
        from: 'alice@example.com',
        fromName: 'Alice Chen',
      }
    : undefined;

  return (
    <I18nextProvider i18n={splitViewI18n}>
      <div
        style={{
          height: '600px',
          display: 'flex',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <SplitViewPanelShell
          selectedEmailId="email-001"
          selectedEmail={selectedEmail}
          panelExpanded={panelExpanded}
          splitPosition={50}
          isResizing={false}
          senderName={selectedEmail?.fromName ?? ''}
          subject={selectedEmail?.subject ?? ''}
          starCount={starCount}
          showSnoozeInput={showSnooze}
          snoozeValue={snoozeValue}
          onReply={() => console.log('Reply clicked')}
          onForward={() => console.log('Forward clicked')}
          onArchive={() => setArchived(true)}
          onSnoozeClick={() => setShowSnooze(prev => !prev)}
          onSnoozeValueChange={setSnoozeValue}
          onSnoozeConfirm={() => {
            setShowSnooze(false);
            console.log('Snoozed for:', snoozeValue);
          }}
          onSnoozeCancel={() => setShowSnooze(false)}
          onClose={() => console.log('Panel closed')}
          onOpenInNewTab={() => console.log('Open in new tab')}
          onSetStarCount={async (_id, count) => setStarCount(count)}
        >
          <MockEmailDetailPane emailId="email-001" />
        </SplitViewPanelShell>
      </div>
    </I18nextProvider>
  );
};
