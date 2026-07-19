import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface GitHubTokenActionsProps {
  githubToken: string;
  githubTokenSaved: boolean;
  hasGithubToken: boolean;
  onSaveGithubToken: () => Promise<void>;
  onRemoveGithubToken: () => Promise<void>;
}

export const GitHubTokenActions: React.FC<GitHubTokenActionsProps> = ({
  githubToken,
  githubTokenSaved,
  hasGithubToken,
  onSaveGithubToken,
  onRemoveGithubToken,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', gap: theme.spacing.md }}>
      <button
        onClick={onSaveGithubToken}
        disabled={!githubToken.trim()}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: githubToken.trim() ? theme.colors.primary.main : theme.colors.text.tertiary,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: githubToken.trim() ? 'pointer' : 'not-allowed',
        }}
      >
        {githubTokenSaved ? t('common.saved') : t('github.saveToken')}
      </button>
      {hasGithubToken && (
        <button
          onClick={onRemoveGithubToken}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.accent.error,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
          }}
        >
          {t('github.removeToken')}
        </button>
      )}
      <a
        href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#creating-a-fine-grained-personal-access-token"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          color: theme.colors.primary.main,
          textDecoration: 'underline',
          fontSize: theme.typography.fontSize.sm,
          alignSelf: 'center',
        }}
      >
        {t('github.howToCreateToken')}
      </a>
    </div>
  );
};
