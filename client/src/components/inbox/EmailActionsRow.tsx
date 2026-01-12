import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, InboxMode, TriageSuggestion } from 'types/email';
import { MODE_TRIAGE } from 'constants/strings';
import { StarButtons } from 'components/inbox/actions/StarButtons';
import { SnoozeInput } from 'components/inbox/actions/SnoozeInput';
import { EMOJI_INBOX, EMOJI_BLOCK, EMOJI_LINK } from 'constants/emojis';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';
import { captureEvent } from 'utils/posthog';
import { TOAST_DURATION_MS, OPACITY_DISABLED } from 'components/inbox/constants';

interface EmailActionsRowProps {
  email: Email;
  mode: InboxMode;
  suggestion?: TriageSuggestion | null;
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
  onSetStarCount: (emailId: string, starCount: number, e?: React.MouseEvent) => Promise<void>;
  onArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  onBlockSender: (emailId: string, e: React.MouseEvent) => void;
  onSnooze: (emailId: string) => Promise<void>;
}

export const EmailActionsRow: React.FC<EmailActionsRowProps> = ({
  email,
  mode,
  suggestion,
  keyboardHint,
  snoozeInput,
  onSetStarCount,
  onArchive,
  onBlockSender,
  onSnooze,
}) => {
  const { t } = useTranslation();
  
  const getSuggestedText = (count: number) => {
    return count === 1 ? '1 star' : `${count} stars`;
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* Actions Card - All actions in single row */}
      <div style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        padding: theme.spacing.md,
        display: 'flex',
        flexDirection: 'row',
        gap: theme.spacing.md,
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: theme.spacing.xs,
      }}>
        {/* Prioritise more deeply section */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}>
          <div style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
            fontWeight: theme.typography.fontWeight.medium,
            whiteSpace: 'nowrap',
          }}>
            {t('inbox.prioritiseMoreDeeply')}:
          </div>
          <StarButtons
            email={email}
            keyboardHint={keyboardHint}
            onSetStarCount={onSetStarCount}
          />
        </div>

        {/* Suggested section */}
        {suggestion && mode === MODE_TRIAGE && suggestion.suggestedStarCount > 0 && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}>
            <div
              onClick={async (e) => {
                e.stopPropagation();
                captureEvent('triage_suggestion_accepted', {
                  email_id: email.id,
                  suggested_star_count: suggestion.suggestedStarCount,
                });
                await onSetStarCount(email.id, suggestion.suggestedStarCount);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
                cursor: 'pointer',
                opacity: 0.7,
                transition: 'opacity 0.2s',
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.7';
              }}
              title={t('inbox.clickToSetStars', { count: suggestion.suggestedStarCount })}
            >
              <span style={{ fontWeight: theme.typography.fontWeight.medium }}>
                {t('inbox.suggested')}: {getSuggestedText(suggestion.suggestedStarCount)}
              </span>
            </div>
          </div>
        )}

        {/* Other actions section */}
        <div style={{ 
          display: 'flex', 
          gap: theme.spacing.sm, 
          alignItems: 'center',
          flexWrap: 'wrap',
          marginLeft: 'auto',
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

          {(() => {
            const unsubscribeLink = extractUnsubscribeLink((email as any).htmlBody, email.body);
            return unsubscribeLink ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(unsubscribeLink, '_blank', 'noopener,noreferrer');
                  captureEvent('email_unsubscribe_clicked', { email_id: email.id });
                }}
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
            );
          })()}
        </div>
      </div>
    </div>
  );
};

