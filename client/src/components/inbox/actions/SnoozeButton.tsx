import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { EMOJI_CLOCK } from 'constants/emojis';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';

interface SnoozeButtonProps {
  email: Email;
  onShowSnooze: (emailId: string) => void;
}

export const SnoozeButton: React.FC<SnoozeButtonProps> = ({ email, onShowSnooze }) => {
  const { t } = useTranslation();

  return (
    <button
      onClick={() => {
        captureEvent(ANALYTICS_EVENTS.EMAIL_SNOOZE_CLICKED, { email_id: email.id });
        onShowSnooze(email.id);
      }}
      title={t('emailDetail.snooze')}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontSize: '1.1rem',
        padding: '0 4px',
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        color: theme.colors.text.tertiary,
      }}
      onMouseEnter={event => (event.currentTarget.style.opacity = String(OPACITY_FULL))}
      onMouseLeave={event => (event.currentTarget.style.opacity = String(OPACITY_DISABLED))}
    >
      <span>{EMOJI_CLOCK}</span>
      <span
        className="email-action-label"
        style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}
      >
        {t('emailDetail.snooze')}
      </span>
    </button>
  );
};
