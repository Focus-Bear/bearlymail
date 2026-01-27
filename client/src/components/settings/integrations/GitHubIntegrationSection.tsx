import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { EMOJI_CHECK } from 'constants/emojis';
import { captureEvent } from 'utils/posthog';

interface GitHubIntegrationSectionProps {
  hasGithubToken: boolean;
  onConnectGitHub: () => void;
  onDisconnectGitHub: () => Promise<void>;
}

export const GitHubIntegrationSection: React.FC<GitHubIntegrationSectionProps> = ({
  hasGithubToken,
  onConnectGitHub,
  onDisconnectGitHub,
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
        {t('settings.github.oauthDescription')}
      </p>
      <p style={{
        color: theme.colors.text.tertiary,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.xs,
        fontStyle: 'italic',
      }}>
        {t('settings.github.orgProjectNote')}
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
            {EMOJI_CHECK} {t('settings.github.connected')}
          </div>
        )}
        <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
          {!hasGithubToken ? (
            <button
              onClick={() => {
                captureEvent('github_connect_clicked');
                onConnectGitHub();
              }}
              style={{
                padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                backgroundColor: theme.colors.primary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.md,
                fontWeight: 500,
              }}
            >
              {t('settings.github.connect')}
            </button>
          ) : (
            <button
              onClick={() => {
                captureEvent('github_disconnect_clicked');
                onDisconnectGitHub();
              }}
              style={{
                padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                backgroundColor: theme.colors.accent.error,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.md,
                fontWeight: 500,
              }}
            >
              {t('settings.github.disconnect')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

