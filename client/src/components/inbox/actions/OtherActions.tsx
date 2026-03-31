import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';

import { SnoozeInput } from 'components/inbox/actions/SnoozeInput';
import { MODE_TRIAGE, OPACITY_DISABLED, TOAST_DURATION_MS } from 'components/inbox/constants';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { EMOJI_BLOCK, EMOJI_INBOX, EMOJI_LINK } from 'constants/emojis';
import { EVENT_CLICK } from 'constants/strings';

interface OtherActionsProps {
  email: Email;
  mode: InboxMode;
  keyboardHint: {
    showHint: (emailId: string, action: string) => void;
    hideHint: () => void;
  };
  snoozeInput: {
    showSnoozeInput: string | null;
    getSnoozeValue: (emailId: string) => string;
    setSnoozeValue: (emailId: string, value: string) => void;
    showSnooze: (emailId: string) => void;
    clearSnooze: (emailId: string) => void;
  };
  onArchive: (emailId: string, event: React.MouseEvent) => Promise<void>;
  onBlockSender: (emailId: string, event: React.MouseEvent) => void;
  onSnooze: (emailId: string) => Promise<void>;
}

const actionBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: '1.2rem',
  padding: '0 4px',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.xs,
};

export const OtherActions: React.FC<OtherActionsProps> = ({
  email,
  mode,
  keyboardHint,
  snoozeInput,
  onArchive,
  onBlockSender,
  onSnooze,
}) => {
  const { t } = useTranslation();

  // Extract unsubscribe link from email (check htmlBody first, then body as fallback)
  const unsubscribeLink = useMemo(() => {
    const htmlBody = email.htmlBody;
    return extractUnsubscribeLink(htmlBody, email.body);
  }, [email]);

  const handleUnsubscribeClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (unsubscribeLink) {
      // Open unsubscribe link in a new tab
      window.open(unsubscribeLink, '_blank', 'noopener,noreferrer');
      captureEvent(ANALYTICS_EVENTS.EMAIL_UNSUBSCRIBE_CLICKED, { email_id: email.id });
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.xs,
      }}
    >
      <div
        style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.error.main,
          fontWeight: theme.typography.fontWeight.medium,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('inbox.otherActions')}:
      </div>
      <div
        style={{
          display: 'flex',
          gap: theme.spacing.sm,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={event => {
            event.stopPropagation();
            onArchive(email.id, event);
            if (event.type === EVENT_CLICK && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
              keyboardHint.showHint(email.id, t('inbox.pressDeleteToArchive'));
              setTimeout(() => keyboardHint.hideHint(), TOAST_DURATION_MS);
            }
          }}
          title={t('inbox.archiveOrPressDelete')}
          style={actionBtnStyle}
        >
          <span>{EMOJI_INBOX}</span>
          <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
            {t('inbox.archive')}
          </span>
        </button>

        {mode !== MODE_TRIAGE && <SnoozeInput email={email} snoozeInput={snoozeInput} onSnooze={onSnooze} />}

        {unsubscribeLink ? (
          <button
            onClick={handleUnsubscribeClick}
            title={t('inbox.unsubscribe')}
            style={{ ...actionBtnStyle, fontSize: '1.1rem', opacity: OPACITY_DISABLED }}
          >
            <span>{EMOJI_LINK}</span>
            <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
              {t('inbox.unsubscribe')}
            </span>
          </button>
        ) : (
          <button
            onClick={event => onBlockSender(email.id, event)}
            title={t('inbox.blockSender')}
            style={{ ...actionBtnStyle, fontSize: '1.1rem', opacity: OPACITY_DISABLED }}
          >
            <span>{EMOJI_BLOCK}</span>
            <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
              {t('inbox.blockSender')}
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
