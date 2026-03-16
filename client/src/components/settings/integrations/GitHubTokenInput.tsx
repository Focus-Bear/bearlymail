import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface GitHubTokenInputProps {
  githubToken: string;
  showGithubToken: boolean;
  onGithubTokenChange: (token: string) => void;
  onShowGithubTokenChange: (show: boolean) => void;
}

export const GitHubTokenInput: React.FC<GitHubTokenInputProps> = ({
  githubToken,
  showGithubToken,
  onGithubTokenChange,
  onShowGithubTokenChange,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
      <input
        type={showGithubToken ? 'text' : 'password'}
        value={githubToken}
        onChange={event => onGithubTokenChange(event.target.value)}
        placeholder="github_pat_..."
        style={{
          flex: 1,
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.sm,
          fontFamily: 'monospace',
        }}
      />
      <button
        onClick={() => onShowGithubTokenChange(!showGithubToken)}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: theme.colors.background.default,
          color: theme.colors.text.primary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {showGithubToken ? t('common.hide', { defaultValue: 'Hide' }) : t('common.show', { defaultValue: 'Show' })}
      </button>
    </div>
  );
};
