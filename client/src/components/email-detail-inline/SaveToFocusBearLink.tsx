import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { buildFocusBearTaskLink, type FocusBearTaskSource } from 'utils/focusBearTaskLink';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { EMOJI_FOCUS_BEAR } from 'constants/emojis';

const RESTING_OPACITY = '0.6';
const ACTIVE_OPACITY = '1';

interface SaveToFocusBearLinkProps {
  taskTitle: string;
  source: FocusBearTaskSource;
}

function setOpacity(event: React.SyntheticEvent<HTMLAnchorElement>, opacity: string) {
  event.currentTarget.style.opacity = opacity;
}

/**
 * Hands an action item to the Focus Bear desktop app through its
 * `focusbear://create-task` link. A plain link rather than a button so the
 * browser's own "Open Focus Bear?" prompt and keyboard activation apply.
 */
export const SaveToFocusBearLink: React.FC<SaveToFocusBearLinkProps> = ({ taskTitle, source }) => {
  const { t } = useTranslation();
  const href = buildFocusBearTaskLink({
    title: taskTitle,
    notes: t('emailDetail.focusBearTaskNotes', { sender: source.sender, subject: source.emailSubject }),
    link: source.emailUrl,
  });
  const label = t('emailDetail.saveToFocusBear');

  return (
    <a
      href={href}
      aria-label={label}
      title={t('emailDetail.saveToFocusBearHint', { task: taskTitle })}
      onClick={() => captureEvent(ANALYTICS_EVENTS.ACTION_ITEM_SAVED_TO_FOCUS_BEAR)}
      onMouseEnter={event => setOpacity(event, ACTIVE_OPACITY)}
      onMouseLeave={event => setOpacity(event, RESTING_OPACITY)}
      onFocus={event => setOpacity(event, ACTIVE_OPACITY)}
      onBlur={event => setOpacity(event, RESTING_OPACITY)}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        padding: '2px',
        fontSize: theme.typography.fontSize.sm,
        lineHeight: 1,
        textDecoration: 'none',
        borderRadius: theme.borderRadius.sm,
        opacity: RESTING_OPACITY,
      }}
    >
      <span aria-hidden="true">{EMOJI_FOCUS_BEAR}</span>
    </a>
  );
};
