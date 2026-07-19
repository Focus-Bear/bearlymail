import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';

interface ProgressiveUnlockPromptProps {
  message: string;
  nextTierLabel: string;
  nextTierCount: number;
  onYes: () => void;
  onLater: () => void;
}

/**
 * Shown when the inbox reaches zero threads at the current priority tier.
 * Invites the user to unlock the next lower priority tier or dismiss for now.
 */
export const ProgressiveUnlockPrompt: React.FC<ProgressiveUnlockPromptProps> = ({
  message,
  nextTierLabel,
  nextTierCount,
  onYes,
  onLater,
}) => {
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
      <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>🎉</div>
      <h3
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        {message}
      </h3>
      <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
        {t('inbox.progressiveUnlock.nextTierQuestion', {
          count: nextTierCount,
          tier: nextTierLabel,
        })}
      </p>
      <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'center' }}>
        <button
          onClick={onYes}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: theme.colors.accent.success,
            color: theme.colors.common.white,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontWeight: theme.typography.fontWeight.semibold,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('inbox.progressiveUnlock.showTier', { tier: nextTierLabel })}
        </button>
        <button
          onClick={onLater}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('inbox.progressiveUnlock.later')}
        </button>
      </div>
    </div>
  );
};
