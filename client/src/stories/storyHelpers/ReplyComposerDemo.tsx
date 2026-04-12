/**
 * ReplyComposerDemo — stateful wrapper for ReplyComposerFooter stories.
 * Manages sent state and exposes story-relevant props.
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ReplyComposerFooter } from 'components/email-detail-inline/ReplyComposerFooter';

import { replyComposerI18n } from './i18nInstances';

export interface ReplyComposerDemoProps {
  sending?: boolean;
  checkingTone?: boolean;
  draft?: string | null;
  scheduledSendAt?: Date | null;
}

export const ReplyComposerDemo: React.FC<ReplyComposerDemoProps> = ({
  sending = false,
  checkingTone = false,
  draft = 'Hello, just following up…',
  scheduledSendAt = null,
}) => {
  const [sent, setSent] = useState(false);

  if (sent) {
    return <div style={{ padding: '16px', color: '#059669', fontWeight: 500 }}>✅ Reply sent!</div>;
  }

  return (
    <I18nextProvider i18n={replyComposerI18n}>
      <div style={{ maxWidth: 600, fontFamily: 'system-ui, sans-serif', padding: '16px' }}>
        <ReplyComposerFooter
          sending={sending}
          checkingTone={checkingTone}
          draft={draft}
          scheduledSendAt={scheduledSendAt}
          onClose={() => console.log('Cancelled')}
          onSend={(expectedReplyHours, _draft, _scheduledAt, keepInAction) => {
            console.log('Send clicked', { expectedReplyHours, keepInAction });
            setSent(true);
          }}
          onClearSchedule={() => console.log('Schedule cleared')}
        />
      </div>
    </I18nextProvider>
  );
};
