import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

import { GitHubDebugInfo, TokenTestResult } from './GitHubDebugSection.types';

const BUTTON_DISABLED_OPACITY = 0.6;

// --- Shared styles ---

export const STAT_CARD_STYLE: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
  padding: theme.spacing.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.sm,
};

export const STAT_LABEL_STYLE: React.CSSProperties = {
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.secondary,
};

export const STAT_VALUE_STYLE: React.CSSProperties = {
  fontSize: theme.typography.fontSize['2xl'],
  fontWeight: theme.typography.fontWeight.bold,
  color: theme.colors.text.primary,
};

// --- StatsGrid ---

interface StatsGridProps {
  debugInfo: GitHubDebugInfo;
  statCardStyle: React.CSSProperties;
  statLabelStyle: React.CSSProperties;
  statValueStyle: React.CSSProperties;
}

export const StatsGrid: React.FC<StatsGridProps> = ({ debugInfo, statCardStyle, statLabelStyle, statValueStyle }) => {
  const { t } = useTranslation();
  const noStatusCount = debugInfo.threadsWithLinksNoStatus;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.xl,
    }}>
      <div style={statCardStyle}>
        <span style={statLabelStyle}>{t('admin.githubDebug.usersWithToken')}</span>
        <span style={statValueStyle}>{debugInfo.usersWithToken}</span>
      </div>
      <div style={statCardStyle}>
        <span style={statLabelStyle}>{t('admin.githubDebug.threadsWithMetadata')}</span>
        <span style={statValueStyle}>{debugInfo.threadsWithMetadata}</span>
      </div>
      <div style={{
        ...statCardStyle,
        borderColor: noStatusCount > 0 ? theme.colors.accent.warning : theme.colors.border.light,
      }}>
        <span style={statLabelStyle}>{t('admin.githubDebug.threadsWithLinksNoStatus')}</span>
        <span style={{
          ...statValueStyle,
          color: noStatusCount > 0 ? theme.colors.accent.warning : theme.colors.text.primary,
        }}>
          {noStatusCount}
        </span>
      </div>
      <div style={{ ...statCardStyle, borderColor: debugInfo.jobStats.failed ? theme.colors.accent.error : theme.colors.border.light }}>
        <span style={statLabelStyle}>{t('admin.githubDebug.jobsFailed7d')}</span>
        <span style={{ ...statValueStyle, color: debugInfo.jobStats.failed ? theme.colors.accent.error : theme.colors.text.primary }}>
          {debugInfo.jobStats.failed ?? 0}
        </span>
      </div>
      <div style={statCardStyle}>
        <span style={statLabelStyle}>{t('admin.githubDebug.jobsCompleted7d')}</span>
        <span style={{ ...statValueStyle, color: theme.colors.accent.success }}>
          {debugInfo.jobStats.completed ?? 0}
        </span>
      </div>
      <div style={statCardStyle}>
        <span style={statLabelStyle}>{t('admin.githubDebug.jobsQueued')}</span>
        <span style={{ ...statValueStyle, color: (debugInfo.jobStats.created ?? 0) > 0 ? theme.colors.accent.warning : theme.colors.text.primary }}>
          {debugInfo.jobStats.created ?? 0}
        </span>
      </div>
      <div style={statCardStyle}>
        <span style={statLabelStyle}>{t('admin.githubDebug.jobsRetry')}</span>
        <span style={{ ...statValueStyle, color: (debugInfo.jobStats.retry ?? 0) > 0 ? theme.colors.accent.warning : theme.colors.text.primary }}>
          {debugInfo.jobStats.retry ?? 0}
        </span>
      </div>
    </div>
  );
};

// --- SilentFailuresPanel ---

interface SilentFailuresProps {
  debugInfo: GitHubDebugInfo;
  formatDate: (d: string | null) => string;
}

export const SilentFailuresPanel: React.FC<SilentFailuresProps> = ({ debugInfo, formatDate }) => {
  const { t } = useTranslation();
  return (
    <>
      <h3 style={{
        fontSize: theme.typography.fontSize.lg,
        fontWeight: theme.typography.fontWeight.semibold,
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.md,
      }}>
        {t('admin.githubDebug.silentFailures')}
      </h3>
      <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md, fontSize: theme.typography.fontSize.sm }}>
        {t('admin.githubDebug.silentFailuresDescription')}
      </p>

      {debugInfo.recentSilentFailures.length === 0 ? (
        <div style={{
          backgroundColor: theme.colors.background.paper,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.xl,
          textAlign: 'center',
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xl,
        }}>
          {t('admin.githubDebug.noSilentFailures')}
        </div>
      ) : (
        <div style={{
          backgroundColor: theme.colors.background.paper,
          border: `1px solid ${theme.colors.accent.warning}40`,
          borderRadius: theme.borderRadius.md,
          overflow: 'hidden',
          marginBottom: theme.spacing.xl,
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{
                backgroundColor: theme.colors.background.default,
                borderBottom: `2px solid ${theme.colors.border.medium}`,
              }}>
                <th style={{ padding: theme.spacing.md, textAlign: 'left', fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
                  {t('admin.githubDebug.threadId')}
                </th>
                <th style={{ padding: theme.spacing.md, textAlign: 'left', fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
                  {t('admin.githubDebug.links')}
                </th>
                <th style={{ padding: theme.spacing.md, textAlign: 'left', fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
                  {t('admin.githubDebug.lastAttempted')}
                </th>
              </tr>
            </thead>
            <tbody>
              {debugInfo.recentSilentFailures.map((failure, index) => (
                <tr
                  key={failure.threadId}
                  style={{
                    backgroundColor: index % 2 === 0 ? theme.colors.background.paper : theme.colors.background.default,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                  }}
                >
                  <td style={{ padding: theme.spacing.md, fontSize: theme.typography.fontSize.xs, fontFamily: 'monospace', color: theme.colors.text.secondary }}>
                    {failure.threadId.slice(0, 8)}...
                  </td>
                  <td style={{ padding: theme.spacing.md, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary }}>
                    {failure.links}
                  </td>
                  <td style={{ padding: theme.spacing.md, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
                    {formatDate(failure.lastAttempted)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// --- TokenTestResultDisplay ---

interface TokenTestResultDisplayProps {
  result: TokenTestResult;
  testOwnerRepo: string;
}

export const TokenTestResultDisplay: React.FC<TokenTestResultDisplayProps> = ({ result, testOwnerRepo }) => {
  const { t } = useTranslation();
  return (
    <div style={{
      padding: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      backgroundColor: result.valid
        ? `${theme.colors.accent.success}15`
        : `${theme.colors.accent.error}15`,
      border: `1px solid ${result.valid ? theme.colors.accent.success : theme.colors.accent.error}40`,
    }}>
      {!result.hasToken && (
        <p style={{ margin: 0, color: theme.colors.text.secondary }}>{t('admin.githubDebug.noTokenFound')}</p>
      )}
      {result.hasToken && !result.valid && (
        <p style={{ margin: 0, color: theme.colors.accent.error }}>
          {t('admin.githubDebug.tokenInvalid')}: {result.error}
        </p>
      )}
      {result.valid && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
          <p style={{ margin: 0, color: theme.colors.accent.success, fontWeight: theme.typography.fontWeight.semibold }}>
            {t('admin.githubDebug.tokenValid')} — @{result.login}
            {result.name ? ` (${result.name})` : ''}
          </p>
          {/* eslint-enable i18next/no-literal-string */}
          {result.scopes && result.scopes.length > 0 && (
            <p style={{ margin: 0, fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
              {t('admin.githubDebug.scopes')}: {result.scopes.join(', ')}
            </p>
          )}
          {result.repoAccess !== undefined && (
            <p style={{
              margin: 0,
              color: result.repoAccess ? theme.colors.accent.success : theme.colors.accent.error,
              fontSize: theme.typography.fontSize.sm,
            }}>
              {testOwnerRepo}: {result.repoAccess
                ? t('admin.githubDebug.repoAccessible')
                : t('admin.githubDebug.repoNotAccessible')}
              {result.repoIsPrivate !== undefined && ` (${result.repoIsPrivate ? t('admin.githubDebug.private') : t('admin.githubDebug.public')})`}
              {result.repoError ? ` — ${result.repoError}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// --- TokenTesterPanel ---

interface TokenTesterProps {
  testUserId: string;
  setTestUserId: (v: string) => void;
  testOwnerRepo: string;
  setTestOwnerRepo: (v: string) => void;
  testingToken: boolean;
  handleTestToken: () => void;
  tokenTestResult: TokenTestResult | null;
}

export const TokenTesterPanel: React.FC<TokenTesterProps> = ({
  testUserId, setTestUserId, testOwnerRepo, setTestOwnerRepo, testingToken, handleTestToken, tokenTestResult,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <h3 style={{
        fontSize: theme.typography.fontSize.lg,
        fontWeight: theme.typography.fontWeight.semibold,
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.md,
      }}>
        {t('admin.githubDebug.tokenTest')}
      </h3>
      <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md, fontSize: theme.typography.fontSize.sm }}>
        {t('admin.githubDebug.tokenTestDescription')}
      </p>
      <div style={{
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.xl,
      }}>
        <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap', marginBottom: theme.spacing.md }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, marginBottom: theme.spacing.xs }}>
              {t('admin.githubDebug.userId')}
            </label>
            <input
              type="text"
              value={testUserId}
              onChange={(e) => setTestUserId(e.target.value)}
              placeholder={t('admin.githubDebug.userIdPlaceholder')}
              style={{
                width: '100%',
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.border.medium}`,
                fontSize: theme.typography.fontSize.sm,
                backgroundColor: theme.colors.background.default,
                color: theme.colors.text.primary,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, marginBottom: theme.spacing.xs }}>
              {t('admin.githubDebug.testRepo')} ({t('admin.githubDebug.optional')})
            </label>
            <input
              type="text"
              value={testOwnerRepo}
              onChange={(e) => setTestOwnerRepo(e.target.value)}
              placeholder="owner/repo"
              style={{
                width: '100%',
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.border.medium}`,
                fontSize: theme.typography.fontSize.sm,
                backgroundColor: theme.colors.background.default,
                color: theme.colors.text.primary,
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={handleTestToken}
              disabled={testingToken || !testUserId.trim()}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                borderRadius: theme.borderRadius.md,
                border: STRING_NONE,
                backgroundColor: theme.colors.primary.main,
                color: COLOR_NAMED_WHITE,
                fontSize: theme.typography.fontSize.sm,
                cursor: testingToken || !testUserId.trim() ? 'not-allowed' : 'pointer',
                opacity: testingToken || !testUserId.trim() ? BUTTON_DISABLED_OPACITY : 1,
              }}
            >
              {testingToken ? t('admin.githubDebug.testing') : t('admin.githubDebug.testTokenButton')}
            </button>
          </div>
        </div>

        {tokenTestResult && (
          <TokenTestResultDisplay result={tokenTestResult} testOwnerRepo={testOwnerRepo} />
        )}
      </div>
    </>
  );
};

// --- FailedJobsPanel ---

interface FailedJobsProps {
  debugInfo: GitHubDebugInfo;
  formatDate: (d: string | null) => string;
}

export const FailedJobsPanel: React.FC<FailedJobsProps> = ({ debugInfo, formatDate }) => {
  const { t } = useTranslation();
  return (
    <>
      <h3 style={{
        fontSize: theme.typography.fontSize.lg,
        fontWeight: theme.typography.fontWeight.semibold,
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.md,
      }}>
        {t('admin.githubDebug.recentFailures')}
      </h3>

      {debugInfo.recentFailedJobs.length === 0 ? (
        <div style={{
          backgroundColor: theme.colors.background.paper,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.xl,
          textAlign: 'center',
          color: theme.colors.text.secondary,
        }}>
          {t('admin.githubDebug.noRecentFailures')}
        </div>
      ) : (
        <div style={{
          backgroundColor: theme.colors.background.paper,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{
                backgroundColor: theme.colors.background.default,
                borderBottom: `2px solid ${theme.colors.border.medium}`,
              }}>
                <th style={{ padding: theme.spacing.md, textAlign: 'left', fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
                  {t('admin.githubDebug.jobId')}
                </th>
                <th style={{ padding: theme.spacing.md, textAlign: 'left', fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
                  {t('admin.githubDebug.emailId')}
                </th>
                <th style={{ padding: theme.spacing.md, textAlign: 'left', fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
                  {t('admin.githubDebug.error')}
                </th>
                <th style={{ padding: theme.spacing.md, textAlign: 'left', fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
                  {t('admin.githubDebug.createdAt')}
                </th>
                <th style={{ padding: theme.spacing.md, textAlign: 'center', fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
                  {t('admin.githubDebug.retries')}
                </th>
              </tr>
            </thead>
            <tbody>
              {debugInfo.recentFailedJobs.map((job, index) => (
                <tr
                  key={job.id}
                  style={{
                    backgroundColor: index % 2 === 0 ? theme.colors.background.paper : theme.colors.background.default,
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                  }}
                >
                  <td style={{ padding: theme.spacing.md, fontSize: theme.typography.fontSize.xs, fontFamily: 'monospace', color: theme.colors.text.secondary }}>
                    {job.id.slice(0, 8)}...
                  </td>
                  <td style={{ padding: theme.spacing.md, fontSize: theme.typography.fontSize.xs, fontFamily: 'monospace', color: theme.colors.text.secondary }}>
                    {job.emailId?.slice(0, 8)}...
                  </td>
                  <td style={{ padding: theme.spacing.md, fontSize: theme.typography.fontSize.sm, color: theme.colors.accent.error }}>
                    {job.error}
                  </td>
                  <td style={{ padding: theme.spacing.md, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
                    {formatDate(job.createdAt)}
                  </td>
                  <td style={{ padding: theme.spacing.md, textAlign: 'center', fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary }}>
                    {job.retryCount}/{job.retryLimit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// --- GitHubDebugHeader ---

interface GitHubDebugHeaderProps {
  lastUpdated: Date | null;
  onRefresh: () => void;
}

export const GitHubDebugHeader: React.FC<GitHubDebugHeaderProps> = ({ lastUpdated, onRefresh }) => {
  const { t } = useTranslation();
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing.lg,
    }}>
      <h2 style={{
        margin: 0,
        fontSize: theme.typography.fontSize['2xl'],
        fontWeight: theme.typography.fontWeight.bold,
        color: theme.colors.text.primary,
      }}>
        {t('admin.githubDebug.title')}
      </h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        {lastUpdated && (
          <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('admin.jobs.lastUpdated')}: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={onRefresh}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border.medium}`,
            backgroundColor: theme.colors.background.paper,
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize.sm,
            cursor: 'pointer',
          }}
        >
          {t('admin.githubDebug.refresh')}
        </button>
      </div>
    </div>
  );
};
