import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, InboxMode, TriageSuggestion } from 'types/email';
import { captureEvent } from 'utils/posthog';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';

import { PrioritySlider } from 'components/inbox/actions/PrioritySlider';
import { SnoozeButton } from 'components/inbox/actions/SnoozeButton';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { OPACITY_DISABLED, TOAST_DURATION_MS } from 'components/inbox/constants';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { EMOJI_BLOCK, EMOJI_INBOX, EMOJI_LINK } from 'constants/emojis';
import { MODE_TRIAGE } from 'constants/strings';

const EVENT_TYPE_CLICK = 'click';

interface UnsubscribeOrBlockProps {
  email: Email;
  t: (tKey: string) => string;
  onBlockSender: (emailId: string, event: React.MouseEvent) => void;
}
const UnsubscribeOrBlock: React.FC<UnsubscribeOrBlockProps> = ({ email, t, onBlockSender }) => {
  const unsubscribeLink = extractUnsubscribeLink(email.htmlBody, email.body);
  const btnStyle = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.1rem',
    padding: '0 4px',
    opacity: OPACITY_DISABLED,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
  };
  if (unsubscribeLink) {
    return (
      <button
        onClick={event => {
          event.stopPropagation();
          window.open(unsubscribeLink, '_blank', 'noopener,noreferrer');
          captureEvent(ANALYTICS_EVENTS.EMAIL_UNSUBSCRIBE_CLICKED, { email_id: email.id });
        }}
        title={t('inbox.unsubscribe')}
        style={btnStyle}
      >
        <span>{EMOJI_LINK}</span>
        <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {t('inbox.unsubscribe')}
        </span>
      </button>
    );
  }
  return (
    <button
      onClick={event => onBlockSender(email.id, event)}
      title={t('inbox.blockSender')}
      style={btnStyle}
      data-tour="block-sender"
    >
      <span>{EMOJI_BLOCK}</span>
      <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
        {t('inbox.blockSender')}
      </span>
    </button>
  );
};

interface EmailOtherActionsGroupProps {
  email: Email;
  mode: InboxMode;
  isSnoozeInputVisible: boolean;
  snoozeValue: string;
  keyboardHint: {
    showHint: (emailId: string, action: string) => void;
    hideHint: () => void;
  };
  onShowSnooze: (emailId: string) => void;
  onSetSnoozeValue: (emailId: string, value: string) => void;
  onClearSnooze: (emailId: string) => void;
  onArchive: (emailId: string, event: React.MouseEvent) => Promise<void>;
  onBlockSender: (emailId: string, event: React.MouseEvent) => void;
  onSnooze: (emailId: string) => Promise<void>;
  t: (tKey: string, opts?: Record<string, unknown>) => string;
  /** When true and the suggestion is to archive, pulses the archive button
   * to draw the eye to the recommended action. */
  pulseArchive?: boolean;
}

const EmailOtherActionsGroup: React.FC<EmailOtherActionsGroupProps> = ({
  email,
  mode,
  isSnoozeInputVisible,
  snoozeValue,
  keyboardHint,
  onShowSnooze,
  onSetSnoozeValue,
  onClearSnooze,
  onArchive,
  onBlockSender,
  onSnooze,
  t,
  pulseArchive,
}) => (
  <>
    <div
      style={{
        display: 'flex',
        gap: theme.spacing.sm,
        alignItems: 'center',
        flexWrap: 'wrap',
        marginLeft: 'auto',
      }}
    >
      <button
        className={pulseArchive ? 'animate-recommended-pulse' : undefined}
        onClick={event => {
          event.stopPropagation();
          onArchive(email.id, event);
          if (event.type === EVENT_TYPE_CLICK && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
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
        <span>{EMOJI_INBOX}</span>
        <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {t('inbox.archive')}
        </span>
      </button>

      {mode !== MODE_TRIAGE && !isSnoozeInputVisible && <SnoozeButton email={email} onShowSnooze={onShowSnooze} />}

      <UnsubscribeOrBlock email={email} t={t} onBlockSender={onBlockSender} />
    </div>

    {mode !== MODE_TRIAGE && isSnoozeInputVisible && (
      <div style={{ borderTop: `1px solid ${theme.colors.border.light}`, paddingTop: theme.spacing.sm }}>
        <SnoozeInputForm
          email={email}
          snoozeValue={snoozeValue}
          onValueChange={value => onSetSnoozeValue(email.id, value)}
          onConfirm={() => onSnooze(email.id)}
          onCancel={() => onClearSnooze(email.id)}
        />
      </div>
    )}
  </>
);

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
  onSetStarCount: (emailId: string, starCount: number, event?: React.MouseEvent) => Promise<void>;
  onArchive: (emailId: string, event: React.MouseEvent) => Promise<void>;
  onBlockSender: (emailId: string, event: React.MouseEvent) => void;
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
  const isSnoozeInputVisible = snoozeInput.showSnoozeInput === email.id;
  const snoozeValue = snoozeInput.getSnoozeValue(email.id);
  const activeSuggestion = mode === MODE_TRIAGE ? suggestion : null;

  return (
    <div onClick={event => event.stopPropagation()}>
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
          padding: theme.spacing.md,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.xs,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: theme.spacing.md,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* Prioritise section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div
              style={{
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.tertiary,
                fontWeight: theme.typography.fontWeight.medium,
                whiteSpace: 'nowrap',
              }}
            >
              {t('inbox.prioritise')}:
            </div>
            <PrioritySlider
              email={email}
              keyboardHint={keyboardHint}
              onSetStarCount={onSetStarCount}
              suggestion={activeSuggestion}
            />
          </div>

          <EmailOtherActionsGroup
            email={email}
            mode={mode}
            isSnoozeInputVisible={isSnoozeInputVisible}
            snoozeValue={snoozeValue}
            keyboardHint={keyboardHint}
            onShowSnooze={snoozeInput.showSnooze}
            onSetSnoozeValue={snoozeInput.setSnoozeValue}
            onClearSnooze={snoozeInput.clearSnooze}
            onArchive={onArchive}
            onBlockSender={onBlockSender}
            onSnooze={onSnooze}
            t={t}
            pulseArchive={activeSuggestion?.suggestedArchive === true}
          />
        </div>
      </div>
    </div>
  );
};
