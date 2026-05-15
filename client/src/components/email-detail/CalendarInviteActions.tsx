import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_CALENDAR } from 'constants/emojis';
import { OPACITY_HALF } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface CalendarInviteActionsProps {
  email: Email;
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}

const RESPONSE_STATUS_ACCEPTED = 'accepted' as const;
const RESPONSE_STATUS_DECLINED = 'declined' as const;
type ResponseStatus = typeof RESPONSE_STATUS_ACCEPTED | typeof RESPONSE_STATUS_DECLINED;

function getAcceptButtonBg(responseStatus: ResponseStatus | null, isDisabled: boolean): string {
  if (responseStatus === RESPONSE_STATUS_ACCEPTED) {
    return theme.colors.success.main;
  }
  return isDisabled ? theme.colors.border.medium : theme.colors.primary.main;
}

function getDeclineButtonBg(responseStatus: ResponseStatus | null, isDisabled: boolean): string {
  if (responseStatus === RESPONSE_STATUS_DECLINED) {
    return theme.colors.text.secondary;
  }
  return isDisabled ? theme.colors.border.medium : 'transparent';
}

interface CalendarActionButtonsProps {
  responseStatus: ResponseStatus | null;
  isDisabled: boolean;
  responding: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const CalendarActionButtons: React.FC<CalendarActionButtonsProps> = ({
  responseStatus,
  isDisabled,
  responding,
  onAccept,
  onDecline,
}) => {
  const { t } = useTranslation();

  const acceptLabel = (() => {
    if (responding && responseStatus !== RESPONSE_STATUS_ACCEPTED) {
      return t('emailDetail.calendarInvite.accepting', 'Accepting...');
    }
    if (responseStatus === RESPONSE_STATUS_ACCEPTED) {
      return t('emailDetail.calendarInvite.accepted', 'Accepted');
    }
    return t('emailDetail.calendarInvite.accept', 'Accept');
  })();

  const declineLabel = (() => {
    if (responding && responseStatus !== RESPONSE_STATUS_DECLINED) {
      return t('emailDetail.calendarInvite.declining', 'Declining...');
    }
    if (responseStatus === RESPONSE_STATUS_DECLINED) {
      return t('emailDetail.calendarInvite.declined', 'Declined');
    }
    return t('emailDetail.calendarInvite.decline', 'Decline');
  })();

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
      <button
        onClick={onAccept}
        disabled={isDisabled || responseStatus === RESPONSE_STATUS_ACCEPTED}
        style={{
          flex: 1,
          minWidth: '120px',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: getAcceptButtonBg(responseStatus, isDisabled),
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          fontWeight: theme.typography.fontWeight.semibold,
          cursor: isDisabled || responseStatus === RESPONSE_STATUS_ACCEPTED ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
          opacity: responseStatus === RESPONSE_STATUS_DECLINED ? OPACITY_HALF : 1,
        }}
      >
        {acceptLabel}
      </button>
      <button
        onClick={onDecline}
        disabled={isDisabled || responseStatus === RESPONSE_STATUS_DECLINED}
        style={{
          flex: 1,
          minWidth: '120px',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: getDeclineButtonBg(responseStatus, isDisabled),
          color: responseStatus === RESPONSE_STATUS_DECLINED ? COLOR_NAMED_WHITE : theme.colors.text.secondary,
          border: `1px solid ${responseStatus === RESPONSE_STATUS_DECLINED ? 'transparent' : theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontWeight: theme.typography.fontWeight.semibold,
          cursor: isDisabled || responseStatus === RESPONSE_STATUS_DECLINED ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
          opacity: responseStatus === RESPONSE_STATUS_ACCEPTED ? OPACITY_HALF : 1,
        }}
      >
        {declineLabel}
      </button>
    </div>
  );
};

export const CalendarInviteActions: React.FC<CalendarInviteActionsProps> = ({
  email,
  onAccept,
  onDecline,
  loading = false,
}) => {
  const { t } = useTranslation();
  const [responding, setResponding] = useState(false);
  const [responseStatus, setResponseStatus] = useState<ResponseStatus | null>(null);

  const makeHandler =
    (action: () => void | Promise<void>, status: ResponseStatus, eventName: string, errorKey: string) => async () => {
      setResponding(true);
      setResponseStatus(null);
      captureEvent(eventName, { email_id: email.id });
      try {
        await action();
        setResponseStatus(status);
      } catch (error) {
        console.error(`Error ${status}:`, error); // nosemgrep
        alert(t(`emailDetail.calendarInvite.${errorKey}`) || `Failed to ${status} invitation`);
      } finally {
        setResponding(false);
      }
    };

  const handleAccept = makeHandler(
    onAccept,
    RESPONSE_STATUS_ACCEPTED,
    ANALYTICS_EVENTS.CALENDAR_INVITE_ACCEPT_CLICKED,
    'acceptError'
  );
  const handleDecline = makeHandler(
    onDecline,
    RESPONSE_STATUS_DECLINED,
    ANALYTICS_EVENTS.CALENDAR_INVITE_DECLINE_CLICKED,
    'declineError'
  );

  const isDisabled = loading || responding;

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.md,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          marginBottom: theme.spacing.xs,
        }}
      >
        <span style={{ fontSize: theme.typography.fontSize.lg }}>{EMOJI_CALENDAR}</span>
        <span
          style={{
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}
        >
          {t('emailDetail.calendarInvite.title')}
        </span>
      </div>

      <CalendarActionButtons
        responseStatus={responseStatus}
        isDisabled={isDisabled}
        responding={responding}
        onAccept={handleAccept}
        onDecline={handleDecline}
      />
    </div>
  );
};
