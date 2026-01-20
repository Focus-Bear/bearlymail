import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { EMOJI_CALENDAR } from 'constants/emojis';

interface CalendarInviteActionsProps {
  email: Email;
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}

export const CalendarInviteActions: React.FC<CalendarInviteActionsProps> = ({
  email,
  onAccept,
  onDecline,
  loading = false,
}) => {
  const { t } = useTranslation();
  const [responding, setResponding] = useState(false);
  const [responseStatus, setResponseStatus] = useState<'accepted' | 'declined' | null>(null);

  const handleAccept = async () => {
    setResponding(true);
    setResponseStatus(null);
    try {
      await onAccept();
      setResponseStatus('accepted');
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
    try {
      await onDecline();
      setResponseStatus('declined');
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
          disabled={isDisabled || responseStatus === 'accepted'}
          style={{
            flex: 1,
            minWidth: '120px',
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: responseStatus === 'accepted'
              ? theme.colors.accent.success || '#5CB85C'
              : isDisabled
                ? theme.colors.border.medium
                : theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.md,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: isDisabled || responseStatus === 'accepted' ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs,
            opacity: responseStatus === 'declined' ? 0.5 : 1,
          }}
        >
          {responding && responseStatus !== 'accepted' ? (
            t('emailDetail.calendarInvite.accepting') || 'Accepting...'
          ) : responseStatus === 'accepted' ? (
            t('emailDetail.calendarInvite.accepted') || 'Accepted'
          ) : (
            t('emailDetail.calendarInvite.accept') || 'Accept'
          )}
        </button>

        <button
          onClick={handleDecline}
          disabled={isDisabled || responseStatus === 'declined'}
          style={{
            flex: 1,
            minWidth: '120px',
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: responseStatus === 'declined'
              ? theme.colors.text.secondary
              : isDisabled
                ? theme.colors.border.medium
                : 'transparent',
            color: responseStatus === 'declined' ? 'white' : theme.colors.text.secondary,
            border: `1px solid ${responseStatus === 'declined' ? 'transparent' : theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: isDisabled || responseStatus === 'declined' ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.xs,
            opacity: responseStatus === 'accepted' ? 0.5 : 1,
          }}
        >
          {responding && responseStatus !== 'declined' ? (
            t('emailDetail.calendarInvite.declining') || 'Declining...'
          ) : responseStatus === 'declined' ? (
            t('emailDetail.calendarInvite.declined') || 'Declined'
          ) : (
            t('emailDetail.calendarInvite.decline') || 'Decline'
          )}
        </button>
      </div>
    </div>
  );
};
