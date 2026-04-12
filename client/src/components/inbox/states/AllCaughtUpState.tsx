import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

/**
 * Shown when the user has cleared all priority tiers (high → medium → low all at zero).
 * This is the final "done" state of the progressive unlock flow.
 */
export const AllCaughtUpState: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: theme.spacing['3xl'],
        textAlign: 'center',
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.xl,
        border: `1px solid ${theme.colors.accent.success}`,
        boxShadow: `0 0 0 4px ${theme.colors.accent.success}20`,
      }}
    >
      <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>🏆</div>
      <h3
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        {t('inbox.progressiveUnlock.allCaughtUp')}
      </h3>
      <p style={{ color: theme.colors.text.secondary }}>{t('inbox.progressiveUnlock.allCaughtUpSub')}</p>
    </div>
  );
};
