import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface StatusBadgeProps {
  isGenerating: boolean;
  hasError: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ isGenerating, hasError }) => {
  const { t } = useTranslation();

  if (isGenerating) {
    return (
      <span
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: theme.colors.sunray.light4,
          color: theme.colors.accent.info,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.xs,
        }}
      >
        {t('inbox.generating')}
      </span>
    );
  }

  if (hasError) {
    return (
      <span
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: theme.colors.error.light,
          color: theme.colors.error.main,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.xs,
        }}
      >
        {t('inbox.error')}
      </span>
    );
  }

  return null;
};
