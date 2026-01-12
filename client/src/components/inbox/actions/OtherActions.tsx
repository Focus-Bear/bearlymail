import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, InboxMode } from 'types/email';
import { SnoozeInput } from 'components/inbox/actions/SnoozeInput';
import { TOAST_DURATION_MS, OPACITY_DISABLED, MODE_TRIAGE } from 'components/inbox/constants';
import { EMOJI_INBOX, EMOJI_BLOCK, EMOJI_LINK } from 'constants/emojis';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';
import { captureEvent } from 'utils/posthog';

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
  onArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  onBlockSender: (emailId: string, e: React.MouseEvent) => void;
  onSnooze: (emailId: string) => Promise<void>;
}

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
    const htmlBody = (email as any).htmlBody;
    return extractUnsubscribeLink(htmlBody, email.body);
  }, [email]);

  const handleUnsubscribeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (unsubscribeLink) {
      // Open unsubscribe link in a new tab
      window.open(unsubscribeLink, '_blank', 'noopener,noreferrer');
      captureEvent('email_unsubscribe_clicked', { email_id: email.id });
    }
  };
  
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      gap: theme.spacing.xs,
    }}>
      <div style={{
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.error.main,
        fontWeight: theme.typography.fontWeight.medium,
        marginBottom: theme.spacing.xs,
      }}>
        {t('inbox.otherActions')}:
      </div>
      <div style={{ 
        display: 'flex', 
        gap: theme.spacing.sm, 
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onArchive(email.id, e);
            // eslint-disable-next-line no-restricted-syntax -- 'click' is a standard DOM event type
            if (e.type === 'click' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
              keyboardHint.showHint(email.id, t('inbox.pressDeleteToArchive'));
              setTimeout(() => keyboardHint.hideHint(), TOAST_DURATION_MS);
            }
          }}
          title={t('inbox.archiveOrPressDelete')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.2rem',
            padding: '0 4px',
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span>{EMOJI_INBOX}</span>
          <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>{t('inbox.archive')}</span>
        </button>

        {mode !== MODE_TRIAGE && (
          <SnoozeInput
            email={email}
            snoozeInput={snoozeInput}
            onSnooze={onSnooze}
          />
        )}

        {unsubscribeLink ? (
          <button
            onClick={handleUnsubscribeClick}
            title={t('inbox.unsubscribe')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.1rem',
              padding: '0 4px',
              opacity: OPACITY_DISABLED,
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
            }}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <span>{EMOJI_LINK}</span>
            <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>{t('inbox.unsubscribe')}</span>
          </button>
        ) : (
          <button
            onClick={(e) => onBlockSender(email.id, e)}
            title={t('inbox.blockSender')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.1rem',
              padding: '0 4px',
              opacity: OPACITY_DISABLED,
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
            }}
          >
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <span>{EMOJI_BLOCK}</span>
            <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>{t('inbox.blockSender')}</span>
          </button>
        )}
      </div>
    </div>
  );
};


