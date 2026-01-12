import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { GitHubTokenInput } from 'components/settings/integrations/GitHubTokenInput';
import { GitHubTokenActions } from 'components/settings/integrations/GitHubTokenActions';
import { EMOJI_CHECK } from 'constants/emojis';

interface GitHubIntegrationSectionProps {
  githubToken: string;
  showGithubToken: boolean;
  githubTokenSaved: boolean;
  hasGithubToken: boolean;
  onGithubTokenChange: (token: string) => void;
  onShowGithubTokenChange: (show: boolean) => void;
  onSaveGithubToken: () => Promise<void>;
  onRemoveGithubToken: () => Promise<void>;
}

export const GitHubIntegrationSection: React.FC<GitHubIntegrationSectionProps> = ({
  githubToken,
  showGithubToken,
  githubTokenSaved,
  hasGithubToken,
  onGithubTokenChange,
  onShowGithubTokenChange,
  onSaveGithubToken,
  onRemoveGithubToken,
}) => {
  const { t } = useTranslation();
  
  return (
    <div id="github-integration" style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.xl,
      marginBottom: theme.spacing.lg,
      boxShadow: theme.shadows.md,
    }}>
      <h2 style={{
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.xl,
        scrollMarginTop: `${INPUT_WIDTH_PX}px`,
      }}>
        {t('settings.github.title')}
      </h2>
      <p style={{
        color: theme.colors.text.secondary,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.sm,
      }}>
        {t('settings.github.description')}{' '}
        {t('settings.github.permissions')}{' '}
        <code>{t('settings.github.permissionIssues')}</code>{' '}
        {t('settings.github.and')}{' '}
        <code>{t('settings.github.permissionPullRequests')}</code>{' '}
        {t('settings.github.permissionsEnd')}.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        {hasGithubToken && (
          <div style={{
            padding: theme.spacing.sm,
            backgroundColor: `${theme.colors.accent.success}20`,
            border: `1px solid ${theme.colors.accent.success}`,
            borderRadius: theme.borderRadius.md,
            color: theme.colors.accent.success,
            fontSize: theme.typography.fontSize.sm,
          }}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            {EMOJI_CHECK} {t('settings.github.tokenConfigured')}
          </div>
        )}
        <GitHubTokenInput
          githubToken={githubToken}
          showGithubToken={showGithubToken}
          onGithubTokenChange={onGithubTokenChange}
          onShowGithubTokenChange={onShowGithubTokenChange}
        />
        <GitHubTokenActions
          githubToken={githubToken}
          githubTokenSaved={githubTokenSaved}
          hasGithubToken={hasGithubToken}
          onSaveGithubToken={onSaveGithubToken}
          onRemoveGithubToken={onRemoveGithubToken}
        />
      </div>
    </div>
  );
};

