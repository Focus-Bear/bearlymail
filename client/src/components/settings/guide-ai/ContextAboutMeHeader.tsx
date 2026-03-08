import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

export const ContextAboutMeHeader: React.FC = () => {
  const { t } = useTranslation();

  return (
    <h3
      style={{
        color: theme.colors.text.primary,
        fontSize: theme.typography.fontSize.lg,
        marginBottom: theme.spacing.md,
      }}
    >
      {t('settings.contextAboutMeTitle')}
    </h3>
  );
};
