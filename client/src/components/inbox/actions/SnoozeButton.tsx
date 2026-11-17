import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiClock } from 'react-icons/fi';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import {
  EMAIL_ACTION_ICON_SIZE,
  emailActionButtonStyle,
  setEmailActionHover,
} from 'components/inbox/actions/emailActionButton.styles';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { TOUR_TARGETS } from 'constants/tour';

interface SnoozeButtonProps {
  email: Email;
  onShowSnooze: (emailId: string) => void;
}

export const SnoozeButton: React.FC<SnoozeButtonProps> = ({ email, onShowSnooze }) => {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      data-tour={TOUR_TARGETS.EMAIL_SNOOZE}
      onClick={() => {
        captureEvent(ANALYTICS_EVENTS.EMAIL_SNOOZE_CLICKED, { email_id: email.id });
        onShowSnooze(email.id);
      }}
      title={t('emailDetail.snooze')}
      style={emailActionButtonStyle}
      onMouseEnter={event => setEmailActionHover(event.currentTarget, true)}
      onMouseLeave={event => setEmailActionHover(event.currentTarget, false)}
    >
      <FiClock size={EMAIL_ACTION_ICON_SIZE} aria-hidden />
      <span className="email-action-label">{t('emailDetail.snooze')}</span>
    </button>
  );
};
