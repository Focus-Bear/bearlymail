import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_OCTOPUS, EMOJI_REFRESH } from 'constants/emojis';

interface GitHubStatusHeaderProps {
  loading: boolean;
  onRefresh: () => void;
}

export const GitHubStatusHeader: React.FC<GitHubStatusHeaderProps> = ({ loading, onRefresh }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}
    >
      <h3
        style={{
          color: theme.colors.text.primary,
          margin: 0,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        {EMOJI_OCTOPUS} {t('github.status')}
      </h3>
      <button
        onClick={onRefresh}
        disabled={loading}
        style={{
          background: 'transparent',
          border: 'none',
          color: theme.colors.primary.main,
          cursor: loading ? 'wait' : 'pointer',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}
      >
        {loading ? (
          <>
            <span
              style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                border: `2px solid ${theme.colors.primary.main}`,
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            {t('github.refreshing')}
          </>
        ) : (
          <>
            {EMOJI_REFRESH} {t('github.refresh')}
          </>
        )}
      </button>
    </div>
  );
};
