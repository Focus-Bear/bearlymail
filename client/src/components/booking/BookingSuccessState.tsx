import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CHECK } from 'constants/emojis';

interface BookingSuccessStateProps {
  guestEmail: string;
  meetLink?: string;
  additionalGuests?: string[];
}

export const BookingSuccessState: React.FC<BookingSuccessStateProps> = ({ guestEmail, meetLink, additionalGuests }) => {
  const { t } = useTranslation();
  const hasAdditionalGuests = additionalGuests && additionalGuests.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        fontFamily: theme.typography.fontFamily,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing['2xl'],
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.md,
          textAlign: 'center',
          maxWidth: '500px',
        }}
      >
        <div
          style={{
            color: theme.colors.accent.success,
            fontSize: theme.typography.fontSize['3xl'],
            marginBottom: theme.spacing.lg,
          }}
        >
          {EMOJI_CHECK}
        </div>
        <h1
          style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
          }}
        >
          {t('booking.confirmed')}
        </h1>
        <p style={{ color: theme.colors.text.secondary }}>{t('booking.invitationSent', { email: guestEmail })}</p>
        {hasAdditionalGuests && (
          <p style={{ color: theme.colors.text.secondary, marginTop: theme.spacing.sm }}>
            {t('booking.guests.alsoInvited', { emails: additionalGuests!.join(', ') })}
          </p>
        )}
        {meetLink && (
          <div
            style={{
              marginTop: theme.spacing.lg,
              padding: theme.spacing.md,
              backgroundColor: theme.colors.primary.light,
              borderRadius: theme.borderRadius.md,
            }}
          >
            <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.sm, fontSize: theme.typography.fontSize.sm }}>
              {t('booking.meetLink', 'Video call link:')}
            </p>
            <a
              href={meetLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('booking.joinMeetingAriaLabel', 'Join video call via Google Meet')}
              style={{
                color: theme.colors.primary.main,
                fontWeight: theme.typography.fontWeight.semibold,
                wordBreak: 'break-all',
              }}
            >
              {meetLink}
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
