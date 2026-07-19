import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

export const ContextImpactInfo: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.subtle,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xs,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        💡 {t('settings.contextAboutMe.impactTitle')}
      </div>
      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('settings.contextAboutMe.impactDescription')}
      </div>
      <Link
        to="/help/context"
        style={{
          color: theme.colors.primary.main,
          fontSize: theme.typography.fontSize.sm,
          textDecoration: 'underline',
          cursor: 'pointer',
        }}
      >
        {t('settings.contextAboutMe.learnMore')} →
      </Link>
    </div>
  );
};
