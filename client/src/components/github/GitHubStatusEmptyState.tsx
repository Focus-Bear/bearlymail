import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_OCTOPUS, EMOJI_REFRESH } from 'constants/emojis';

interface GitHubStatusEmptyStateProps {
  loading: boolean;
  onRefresh: () => void;
}

export const GitHubStatusEmptyState: React.FC<GitHubStatusEmptyStateProps> = ({ loading, onRefresh }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.xl,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        boxShadow: theme.shadows.sm,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          {EMOJI_OCTOPUS} {t('github.statusNoLinks')}
        </span>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.colors.primary.main,
            cursor: loading ? 'wait' : 'pointer',
            fontSize: theme.typography.fontSize.xs,
            fontWeight: theme.typography.fontWeight.medium,
            padding: theme.spacing.xs,
          }}
          title={t('github.refresh')}
        >
          {loading ? (
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                border: `2px solid ${theme.colors.primary.main}`,
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
          ) : (
            <>{EMOJI_REFRESH}</>
          )}
        </button>
      </div>
    </div>
  );
};
