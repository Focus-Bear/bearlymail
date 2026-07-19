import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_WARNING } from 'constants/emojis';
import { STRING_NONE } from 'constants/strings';

interface ErrorStateProps {
  error: string;
  onRetry: () => void;
}

/**
 * Error state component
 * Displays error message with retry button
 */
export const ErrorState: React.FC<ErrorStateProps> = ({ error, onRetry }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: theme.spacing['3xl'],
        textAlign: 'center',
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.xl,
        border: `2px solid ${theme.colors.accent.error}`,
      }}
    >
      <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>{EMOJI_WARNING}</div>
      <h3
        style={{
          color: theme.colors.accent.error,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        {t('inbox.errorLoadingEmails')}
      </h3>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.lg,
        }}
      >
        {error}
      </p>
      <button
        onClick={onRetry}
        style={{
          padding: `${theme.spacing.md} ${theme.spacing.xl}`,
          backgroundColor: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('common.retry')}
      </button>
    </div>
  );
};
