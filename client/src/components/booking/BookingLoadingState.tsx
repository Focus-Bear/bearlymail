import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

export const BookingLoadingState: React.FC = () => {
  const { t } = useTranslation();

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
      {t('booking.loading')}
    </div>
  );
};
