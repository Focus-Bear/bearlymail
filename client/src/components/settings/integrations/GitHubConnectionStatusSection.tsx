import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface RepoStatus {
  id: string;
  owner: string;
  repo: string;
  isDefault: boolean;
  isAutoDiscovered: boolean;
  accessible: boolean;
  isPrivate?: boolean;
  error?: string;
}

interface ConnectionStatus {
  hasToken: boolean;
  tokenValid?: boolean;
  login?: string;
  name?: string;
  scopes?: string[];
  repos?: RepoStatus[];
  error?: string;
}

interface GitHubConnectionStatusSectionProps {
  hasGithubToken: boolean;
  onConnectGitHub: () => void;
  onConnectGitHubWithRepoAccess: () => void;
}

const BUTTON_DISABLED_OPACITY = 0.6;

interface GitHubStatusDetailsProps {
  status: ConnectionStatus;
  inaccessibleRepos: RepoStatus[];
  hasIssues: boolean;
  onConnectGitHub: () => void;
  onConnectGitHubWithRepoAccess: () => void;
}

const GitHubStatusDetails: React.FC<GitHubStatusDetailsProps> = ({
  status,
  inaccessibleRepos,
  hasIssues,
  onConnectGitHub,
  onConnectGitHubWithRepoAccess,
}) => {
  const { t } = useTranslation();
  return (
    <>
      {/* Token status */}
      <div
        style={{
          padding: theme.spacing.md,
          borderRadius: theme.borderRadius.md,
          backgroundColor: status.tokenValid ? `${theme.colors.accent.success}10` : `${theme.colors.accent.error}10`,
          border: `1px solid ${status.tokenValid ? theme.colors.accent.success : theme.colors.accent.error}40`,
          marginBottom: theme.spacing.md,
        }}
      >
        {status.tokenValid ? (
          <div>
            <p
              style={{
                margin: 0,
                color: theme.colors.accent.success,
                fontWeight: theme.typography.fontWeight.semibold,
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('settings.github.connectionStatus.tokenValidUser', {
                login: status.login,
                name: status.name ? ` (${status.name})` : '',
              })}
            </p>
            {status.scopes && status.scopes.length > 0 && (
              <p
                style={{
                  margin: `${theme.spacing.xs} 0 0 0`,
                  fontSize: theme.typography.fontSize.xs,
                  color: theme.colors.text.secondary,
                }}
              >
                {t('settings.github.connectionStatus.scopesList', { scopes: status.scopes.join(', ') })}
              </p>
            )}
          </div>
        ) : (
          <p style={{ margin: 0, color: theme.colors.accent.error, fontSize: theme.typography.fontSize.sm }}>
            {status.error
              ? t('settings.github.connectionStatus.tokenInvalidWithError', { error: status.error })
              : t('settings.github.connectionStatus.tokenInvalid')}
          </p>
        )}
      </div>

      {/* Repository access */}
      {status.repos && status.repos.length > 0 && (
        <div style={{ marginBottom: theme.spacing.md }}>
          <h3
            style={{
              fontSize: theme.typography.fontSize.base,
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.sm,
            }}
          >
            {t('settings.github.connectionStatus.reposTitle')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
            {status.repos.map(repo => (
              <div
                key={repo.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  borderRadius: theme.borderRadius.md,
                  border: `1px solid ${repo.accessible ? theme.colors.border.light : theme.colors.accent.error}40`,
                  backgroundColor: repo.accessible ? 'transparent' : `${theme.colors.accent.error}05`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                  <span
                    style={{
                      fontSize: theme.typography.fontSize.base,
                      color: repo.accessible ? theme.colors.accent.success : theme.colors.accent.error,
                      fontWeight: theme.typography.fontWeight.bold,
                    }}
                  >
                    {repo.accessible ? '✓' : '✗'}
                  </span>
                  <span
                    style={{
                      fontWeight: theme.typography.fontWeight.medium,
                      color: theme.colors.text.primary,
                      fontSize: theme.typography.fontSize.sm,
                    }}
                  >
                    {repo.owner}/{repo.repo}
                  </span>
                  <div style={{ display: 'flex', gap: theme.spacing.xs }}>
                    {repo.isDefault && (
                      <span
                        style={{
                          backgroundColor: theme.colors.primary.main,
                          color: COLOR_NAMED_WHITE,
                          padding: `1px ${theme.spacing.sm}`,
                          borderRadius: theme.borderRadius.sm,
                          fontSize: theme.typography.fontSize.xs,
                        }}
                      >
                        {t('settings.github.repoMappings.default')}
                      </span>
                    )}
                    {repo.isPrivate && (
                      <span
                        style={{
                          backgroundColor: `${theme.colors.text.tertiary}20`,
                          color: theme.colors.text.tertiary,
                          padding: `1px ${theme.spacing.sm}`,
                          borderRadius: theme.borderRadius.sm,
                          fontSize: theme.typography.fontSize.xs,
                        }}
                      >
                        {t('settings.github.connectionStatus.private')}
                      </span>
                    )}
                  </div>
                </div>
                {!repo.accessible && (
                  <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.accent.error }}>
                    {t('settings.github.connectionStatus.noAccess')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {status.repos && status.repos.length === 0 && (
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, fontStyle: 'italic' }}>
          {t('settings.github.connectionStatus.noReposMapped')}
        </p>
      )}

      {/* Warning + reconnect if issues found */}
      {hasIssues && (
        <div
          style={{
            padding: theme.spacing.md,
            borderRadius: theme.borderRadius.md,
            backgroundColor: `${theme.colors.accent.warning}10`,
            border: `1px solid ${theme.colors.accent.warning}60`,
            marginTop: theme.spacing.md,
          }}
        >
          <p
            style={{
              margin: `0 0 ${theme.spacing.sm} 0`,
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {t('settings.github.connectionStatus.issuesFound')}
          </p>
          <p
            style={{
              margin: `0 0 ${theme.spacing.md} 0`,
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {inaccessibleRepos.length > 0
              ? t('settings.github.connectionStatus.privateRepoHint')
              : t('settings.github.connectionStatus.tokenExpiredHint')}
          </p>
          {inaccessibleRepos.length > 0 ? (
            <button
              onClick={onConnectGitHubWithRepoAccess}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.primary.main,
                color: COLOR_NAMED_WHITE,
                border: STRING_NONE,
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {t('settings.github.connectionStatus.reconnectWithRepoAccess')}
            </button>
          ) : (
            <button
              onClick={onConnectGitHub}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.primary.main,
                color: COLOR_NAMED_WHITE,
                border: STRING_NONE,
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {t('settings.github.connectionStatus.reconnect')}
            </button>
          )}
        </div>
      )}
    </>
  );
};

export const GitHubConnectionStatusSection: React.FC<GitHubConnectionStatusSectionProps> = ({
  hasGithubToken,
  onConnectGitHub,
  onConnectGitHubWithRepoAccess,
}) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!hasGithubToken) {
      return;
    }
    setLoading(true);
    try {
      const response = await axios.get<ConnectionStatus>(`${API_URL}/github/my/connection-status`);
      setStatus(response.data);
      setLastChecked(new Date());
    } catch (error) {
      console.error('Error fetching GitHub connection status:', error);
    } finally {
      setLoading(false);
    }
  }, [hasGithubToken]);

  useEffect(() => {
    if (hasGithubToken) {
      fetchStatus();
    }
  }, [hasGithubToken, fetchStatus]);

  if (!hasGithubToken) {
    return null;
  }

  const inaccessibleRepos = status?.repos?.filter(repo => !repo.accessible) ?? [];
  const hasIssues = status && (!status.tokenValid || inaccessibleRepos.length > 0);

  return (
    <div
      id="github-connection-status"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.lg,
        boxShadow: theme.shadows.md,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.md,
        }}
      >
        <h2 style={{ color: theme.colors.text.primary, margin: 0, fontSize: theme.typography.fontSize.xl }}>
          {t('settings.github.connectionStatus.title')}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          {lastChecked && (
            <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary }}>
              {t('settings.github.connectionStatus.checkedAt')}: {lastChecked.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchStatus}
            disabled={loading}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.border.medium}`,
              backgroundColor: theme.colors.background.paper,
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.sm,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? BUTTON_DISABLED_OPACITY : 1,
            }}
          >
            {loading ? t('common.loading') : t('settings.github.connectionStatus.refresh')}
          </button>
        </div>
      </div>

      {loading && !status && (
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {t('common.loading')}
        </p>
      )}

      {status && (
        <GitHubStatusDetails
          status={status}
          inaccessibleRepos={inaccessibleRepos}
          hasIssues={Boolean(hasIssues)}
          onConnectGitHub={onConnectGitHub}
          onConnectGitHubWithRepoAccess={onConnectGitHubWithRepoAccess}
        />
      )}
    </div>
  );
};
