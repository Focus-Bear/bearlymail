import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

/**
 * Consent modal header component
 */
export const ConsentModalHeader: React.FC = () => {
  const { t } = useTranslation();

  return (
    <>
      <h2
        style={{
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.primary,
        }}
      >
        {t('consent.welcome')}
      </h2>

      <p
        style={{
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.secondary,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}
      >
        {t('consent.description')}
      </p>
    </>
  );
};
