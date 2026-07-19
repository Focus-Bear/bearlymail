import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiArchive } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { Email, InboxMode, TriageSuggestion } from 'types/email';
import { captureEvent } from 'utils/posthog';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';

import { OverflowMenu, OverflowMenuItem } from 'components/common/OverflowMenu';
import { PrioritySlider } from 'components/inbox/actions/PrioritySlider';
import { SnoozeButton } from 'components/inbox/actions/SnoozeButton';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { TOAST_DURATION_MS } from 'components/inbox/constants';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { EMOJI_BLOCK, EMOJI_LINK } from 'constants/emojis';
import { MODE_TRIAGE } from 'constants/strings';

const EVENT_TYPE_CLICK = 'click';

/** Ghost action button (icon + label) matching the split-view / Snooze styling. */
const ghostActionStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '0 4px',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.xs,
  color: theme.colors.text.secondary,
  fontSize: theme.typography.fontSize.sm,
};

/**
 * Archive action — a ghost button using the same FiArchive icon as the split view (and the category
 * "Archive All"), so archive reads consistently everywhere. Pulses when triage recommends archiving.
 */
const ArchiveButton: React.FC<{
  email: Email;
  keyboardHint: { showHint: (emailId: string, action: string) => void; hideHint: () => void };
  t: (tKey: string, opts?: Record<string, unknown>) => string;
  pulse: boolean;
  onArchive: (emailId: string, event: React.MouseEvent) => Promise<void>;
}> = ({ email, keyboardHint, t, pulse, onArchive }) => (
  <button
    type="button"
    className={pulse ? 'animate-recommended-pulse' : undefined}
    title={t('inbox.archive')}
    style={ghostActionStyle}
    onClick={event => {
      event.stopPropagation();
      onArchive(email.id, event);
      if (event.type === EVENT_TYPE_CLICK && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
        keyboardHint.showHint(email.id, t('inbox.pressDeleteToArchive'));
        setTimeout(() => keyboardHint.hideHint(), TOAST_DURATION_MS);
      }
    }}
  >
    <FiArchive size={15} />
    <span className="email-action-label">{t('inbox.archive')}</span>
  </button>
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

/** A React.MouseEvent stub for handlers reached from the overflow menu, which fires without one. */
const NOOP_MOUSE_EVENT = {
  stopPropagation: () => undefined,
  preventDefault: () => undefined,
} as unknown as React.MouseEvent;

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

  // Block sender / Unsubscribe live in the overflow menu (…) rather than as a visible button.
  const unsubscribeLink = extractUnsubscribeLink(email.htmlBody, email.body);
  const overflowItems: OverflowMenuItem[] = unsubscribeLink
    ? [
        {
          key: 'unsubscribe',
          label: t('inbox.unsubscribe'),
          icon: <span aria-hidden>{EMOJI_LINK}</span>,
          onClick: () => {
            window.open(unsubscribeLink, '_blank', 'noopener,noreferrer');
            captureEvent(ANALYTICS_EVENTS.EMAIL_UNSUBSCRIBE_CLICKED, { email_id: email.id });
          },
        },
      ]
    : [
        {
          key: 'block',
          label: t('inbox.blockSender'),
          icon: <span aria-hidden>{EMOJI_BLOCK}</span>,
          onClick: () => onBlockSender(email.id, NOOP_MOUSE_EVENT),
        },
      ];

  return (
    <div onClick={event => event.stopPropagation()}>
      {/* The container query lives on this wrapper (not the row itself) because a CSS query
          container cannot style itself — only descendants respond to its @container rules. */}
      <div
        className="email-actions-container"
        style={{
          padding: `${theme.spacing.sm} 0 0`,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.xs,
        }}
      >
        {/* PRIORITY controls and their effect caption sit in their own box; Snooze/Archive/⋮ are
            ghost actions pushed to the right edge of the row — always on the same line as the
            pills. The wrapper above is a CSS container: when the card is too narrow for the
            labelled buttons, a container query hides the .email-action-label text so Snooze and
            Archive collapse to icons instead of wrapping to a second row (titles keep the labels
            as tooltips). flexWrap stays as a last-resort fallback for browsers without container
            query support, which degrade to the old wrap-below behaviour. */}
        {/* Gaps live in the .email-actions-row / .email-actions-group CSS (App.css) rather than
            inline styles so the container query can tighten them on narrow cards. */}
        <div className="email-actions-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div
            style={{
              // Hug the PRIORITY + pills content (no flex-grow) so the box doesn't leave empty
              // space after "Oh sh$t"; actions sit at the far right and wrap below on narrow rows.
              flex: '0 1 auto',
              backgroundColor: theme.colors.background.paper,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            }}
          >
            <PrioritySlider
              email={email}
              onSetStarCount={onSetStarCount}
              suggestion={activeSuggestion}
              inlineLabel
            />
          </div>

          <div
            className="email-actions-group"
            style={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              marginLeft: 'auto',
              // Centre the action icons on the priority pills line (box border + padding + pill),
              // not on the whole box, whose caption line makes it taller.
              height: '36px',
            }}
          >
            {!isSnoozeInputVisible && <SnoozeButton email={email} onShowSnooze={snoozeInput.showSnooze} />}
            <ArchiveButton
              email={email}
              keyboardHint={keyboardHint}
              t={t}
              pulse={activeSuggestion?.suggestedArchive === true}
              onArchive={onArchive}
            />
            <OverflowMenu items={overflowItems} aria-label={t('emailDetail.moreOptions')} />
          </div>
        </div>

        {isSnoozeInputVisible && (
          <div style={{ borderTop: `1px solid ${theme.colors.border.light}`, paddingTop: theme.spacing.sm }}>
            <SnoozeInputForm
              email={email}
              snoozeValue={snoozeValue}
              onValueChange={value => snoozeInput.setSnoozeValue(email.id, value)}
              onConfirm={() => onSnooze(email.id)}
              onCancel={() => snoozeInput.clearSnooze(email.id)}
            />
          </div>
        )}
      </div>
    </div>
  );
};
