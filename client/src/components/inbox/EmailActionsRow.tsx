import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiArchive } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { Email, InboxMode, TriageSuggestion } from 'types/email';
import { captureEvent } from 'utils/posthog';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';

import { OverflowMenu, OverflowMenuItem } from 'components/common/OverflowMenu';
import {
  EMAIL_ACTION_ICON_SIZE,
  emailActionButtonStyle,
  setEmailActionHover,
} from 'components/inbox/actions/emailActionButton.styles';
import { PrioritySlider } from 'components/inbox/actions/PrioritySlider';
import { SnoozeButton } from 'components/inbox/actions/SnoozeButton';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { TOAST_DURATION_MS } from 'components/inbox/constants';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { EMOJI_BLOCK, EMOJI_LINK } from 'constants/emojis';
import { MODE_TRIAGE } from 'constants/strings';
import { TOUR_TARGETS } from 'constants/tour';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

const EVENT_TYPE_CLICK = 'click';
const ACTIONS_ROW_CLASS = 'email-actions-row';
/** Lets App.css hide the action labels on narrow cards; desktop keeps them. */
export const ACTIONS_ROW_COLLAPSIBLE_CLASS = 'email-actions-row--collapsible';

/**
 * Archive action — a labelled button using the same FiArchive icon as the split view (and the
 * category "Archive All"), so archive reads consistently everywhere. Pulses when triage recommends
 * archiving.
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
    data-tour={TOUR_TARGETS.EMAIL_ARCHIVE}
    className={pulse ? 'animate-recommended-pulse' : undefined}
    title={t('inbox.archive')}
    style={emailActionButtonStyle}
    onMouseEnter={event => setEmailActionHover(event.currentTarget, true)}
    onMouseLeave={event => setEmailActionHover(event.currentTarget, false)}
    onClick={event => {
      event.stopPropagation();
      onArchive(email.id, event);
      if (event.type === EVENT_TYPE_CLICK && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
        keyboardHint.showHint(email.id, t('inbox.pressDeleteToArchive'));
        setTimeout(() => keyboardHint.hideHint(), TOAST_DURATION_MS);
      }
    }}
  >
    <FiArchive size={EMAIL_ACTION_ICON_SIZE} aria-hidden />
    <span className="email-action-label">{t('inbox.archive')}</span>
  </button>
);

const priorityBoxStyle: React.CSSProperties = {
  // Hug the PRIORITY + pills content (no flex-grow) so the box doesn't leave empty
  // space after "Oh sh$t"; actions sit at the far right and wrap below on narrow rows.
  flex: '0 1 auto',
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
};

const actionsGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  marginLeft: 'auto',
  // Centre the action icons on the priority pills line (box border + padding + pill),
  // not on the whole box, whose caption line makes it taller.
  height: '36px',
};

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
  const { isMobile } = useResponsiveBreakpoints();
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
        {/* PRIORITY controls and their effect caption sit in their own box; Snooze/Archive/⋮ sit
            at the right edge of the row. The wrapper above is a CSS container. On desktop the
            actions are always labelled buttons — when the card is too narrow (the split view)
            they wrap onto their own line rather than shrinking to unlabelled icons. On mobile the
            row is "collapsible": a container query hides the .email-action-label text so the
            actions fit as icons (titles keep the labels as tooltips). */}
        {/* Gaps live in the .email-actions-row / .email-actions-group CSS (App.css) rather than
            inline styles so the container query can tighten them on narrow cards. */}
        <div
          className={isMobile ? `${ACTIONS_ROW_CLASS} ${ACTIONS_ROW_COLLAPSIBLE_CLASS}` : ACTIONS_ROW_CLASS}
          data-testid={ACTIONS_ROW_CLASS}
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' }}
        >
          <div data-tour={TOUR_TARGETS.EMAIL_PRIORITY} style={priorityBoxStyle}>
            <PrioritySlider
              email={email}
              onSetStarCount={onSetStarCount}
              suggestion={activeSuggestion}
              inlineLabel
            />
          </div>

          <div className="email-actions-group" style={actionsGroupStyle}>
            {!isSnoozeInputVisible && <SnoozeButton email={email} onShowSnooze={snoozeInput.showSnooze} />}
            <ArchiveButton
              email={email}
              keyboardHint={keyboardHint}
              t={t}
              pulse={activeSuggestion?.suggestedArchive === true}
              onArchive={onArchive}
            />
            {/* The tour's "Block a sender" step points here — Block sender lives in this menu. */}
            <span data-tour={TOUR_TARGETS.EMAIL_MORE_ACTIONS} style={{ display: 'inline-flex' }}>
              <OverflowMenu items={overflowItems} aria-label={t('emailDetail.moreOptions')} />
            </span>
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
