import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MAX_WIDTH_600_PX, OPACITY_90_PERCENT } from 'constants/numbers';
import { STRING_AUTO, STRING_HIDDEN, STRING_WHITE } from 'constants/strings';

export const BookingErrorState: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: theme.colors.background.default,
        fontFamily: theme.typography.fontFamily,
        padding: theme.spacing.xl,
      }}
    >
      <div
        style={{
          maxWidth: `${MAX_WIDTH_600_PX}px`,
          margin: STRING_AUTO,
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          overflow: STRING_HIDDEN,
        }}
      >
        <div
          style={{
            padding: theme.spacing.xl,
            backgroundColor: theme.colors.primary.main,
            color: STRING_WHITE,
          }}
        >
          <h1 style={{ margin: 0, fontSize: theme.typography.fontSize['2xl'] }}>{t('booking.title')}</h1>
          <p style={{ marginTop: theme.spacing.sm, opacity: OPACITY_90_PERCENT }}>{t('booking.subtitle')}</p>
        </div>

        <div
          style={{
            padding: theme.spacing.xl,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '3rem',
              marginBottom: theme.spacing.lg,
            }}
          >
            📅
          </div>
          <h2
            style={{
              color: theme.colors.accent.error,
              marginBottom: theme.spacing.md,
            }}
          >
            {t('booking.error.headline')}
          </h2>
          <p
            style={{
              color: theme.colors.text?.secondary ?? theme.colors.primary.main,
              lineHeight: 1.6,
            }}
          >
            {t('booking.error.detail')}
          </p>
        </div>
      </div>
    </div>
  );
};
