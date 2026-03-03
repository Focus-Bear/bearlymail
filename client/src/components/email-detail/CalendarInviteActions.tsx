import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { EMOJI_CALENDAR } from 'constants/emojis';
import { OPACITY_HALF } from 'constants/numbers';
import { captureEvent } from 'utils/posthog';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface CalendarInviteActionsProps {
  email: Email;
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}

const RESPONSE_STATUS_ACCEPTED = 'accepted' as const;
const RESPONSE_STATUS_DECLINED = 'declined' as const;

export const CalendarInviteActions: React.FC<CalendarInviteActionsProps> = ({
  email,
  onAccept,
  onDecline,
  loading = false,
}) => {
  const { t } = useTranslation();
  const [responding, setResponding] = useState(false);
  const [responseStatus, setResponseStatus] = useState<typeof RESPONSE_STATUS_ACCEPTED | typeof RESPONSE_STATUS_DECLINED | null>(null);

  const handleAccept = async () => {
    setResponding(true);
    setResponseStatus(null);
    captureEvent('calendar_invite_accept_clicked', { email_id: email.id });
    try {
      await onAccept();
      setResponseStatus(RESPONSE_STATUS_ACCEPTED);
    } catch (error) {
      console.error('Error accepting invitation:', error);
      alert(t('emailDetail.calendarInvite.acceptError') || 'Failed to accept invitation');
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = async () => {
    setResponding(true);
    setResponseStatus(null);
    captureEvent('calendar_invite_decline_clicked', { email_id: email.id });
    try {
      await onDecline();
      setResponseStatus(RESPONSE_STATUS_DECLINED);
    } catch (error) {
      console.error('Error declining invitation:', error);
      alert(t('emailDetail.calendarInvite.declineError') || 'Failed to decline invitation');
    } finally {
      setResponding(false);
    }
  };

  const isDisabled = loading || responding;

  return (
    <div style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.md,
      border: `1px solid ${theme.colors.border.light}`,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.sm,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.xs,
      }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: theme.typography.fontSize.lg }}>{EMOJI_CALENDAR}</span>
        <span style={{
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}>
          {t('emailDetail.calendarInvite.title') || 'Calendar Invitation'}
        </span>
      </div>
      
      <div style={{
        display: 'flex',
        gap: theme.spacing.sm,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={handleAccept}
          disabled={isDisabled || responseStatus === RESPONSE_STATUS_ACCEPTED}
          style={{
            flex: 1,
            minWidth: '120px',
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: (() => {
              if (responseStatus === RESPONSE_STATUS_ACCEPTED) return theme.colors.success.main;
              if (isDisabled) return theme.colors.border.medium;
              return theme.colors.primary.main;
            })(),
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
          {(() => {
            if (responding && responseStatus !== RESPONSE_STATUS_ACCEPTED) return t('emailDetail.calendarInvite.accepting') || 'Accepting...';
            if (responseStatus === RESPONSE_STATUS_ACCEPTED) return t('emailDetail.calendarInvite.accepted') || 'Accepted';
            return t('emailDetail.calendarInvite.accept') || 'Accept';
          })()}
        </button>

        <button
          onClick={handleDecline}
          disabled={isDisabled || responseStatus === RESPONSE_STATUS_DECLINED}
          style={{
            flex: 1,
            minWidth: '120px',
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: (() => {
              if (responseStatus === RESPONSE_STATUS_DECLINED) return theme.colors.text.secondary;
              if (isDisabled) return theme.colors.border.medium;
              return 'transparent';
            })(),
            color: responseStatus === RESPONSE_STATUS_DECLINED ? 'white' : theme.colors.text.secondary,
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
          {(() => {
            if (responding && responseStatus !== RESPONSE_STATUS_DECLINED) return t('emailDetail.calendarInvite.declining') || 'Declining...';
            if (responseStatus === RESPONSE_STATUS_DECLINED) return t('emailDetail.calendarInvite.declined') || 'Declined';
            return t('emailDetail.calendarInvite.decline') || 'Decline';
          })()}
        </button>
      </div>
    </div>
  );
};
