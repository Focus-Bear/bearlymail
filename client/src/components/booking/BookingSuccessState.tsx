import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CHECK } from 'constants/emojis';

interface BookingSuccessStateProps {
  guestEmail: string;
}

export const BookingSuccessState: React.FC<BookingSuccessStateProps> = ({ guestEmail }) => {
  const { t } = useTranslation();
  
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
      fontFamily: theme.typography.fontFamily,
    }}>
      <div style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing['2xl'],
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.md,
        textAlign: 'center',
        maxWidth: '500px',
      }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <div style={{ 
          color: theme.colors.accent.success, 
          fontSize: theme.typography.fontSize['3xl'],
          marginBottom: theme.spacing.lg 
        }}>{EMOJI_CHECK}</div>
        <h1 style={{ 
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md 
        }}>{t('booking.confirmed')}</h1>
        <p style={{ color: theme.colors.text.secondary }}>
          {t('booking.invitationSent', { email: guestEmail })}
        </p>
      </div>
    </div>
  );
};


