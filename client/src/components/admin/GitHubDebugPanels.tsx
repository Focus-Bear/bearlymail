import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

import { FailedJob, GitHubDebugInfo, SilentFailure, TokenTestResult } from './GitHubDebugSection.types';

const BUTTON_DISABLED_OPACITY = 0.6;

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

interface StatCardProps {
  label: string;
  value: number | string;
  borderColor?: string;
  valueColor?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, borderColor, valueColor }) => (
  <div style={{ ...STAT_CARD_STYLE, ...(borderColor ? { borderColor } : {}) }}>
    <span style={STAT_LABEL_STYLE}>{label}</span>
    <span style={{ ...STAT_VALUE_STYLE, ...(valueColor ? { color: valueColor } : {}) }}>{value}</span>
  </div>
);

interface StatsGridProps {
  debugInfo: GitHubDebugInfo;
}

export const StatsGrid: React.FC<StatsGridProps> = ({ debugInfo }) => {
  const { t } = useTranslation();
  const noStatusCount = debugInfo.threadsWithLinksNoStatus;
  const failedJobs = debugInfo.jobStats.failed ?? 0;
  const completedJobs = debugInfo.jobStats.completed ?? 0;
  const createdJobs = debugInfo.jobStats.created ?? 0;
  const retryJobs = debugInfo.jobStats.retry ?? 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.xl,
      }}
    >
      <StatCard label={t('admin.githubDebug.usersWithToken')} value={debugInfo.usersWithToken} />
      <StatCard label={t('admin.githubDebug.threadsWithMetadata')} value={debugInfo.threadsWithMetadata} />
      <StatCard
        label={t('admin.githubDebug.threadsWithLinksNoStatus')}
        value={noStatusCount}
        borderColor={noStatusCount > 0 ? theme.colors.accent.warning : undefined}
        valueColor={noStatusCount > 0 ? theme.colors.accent.warning : undefined}
      />
      <StatCard
        label={t('admin.githubDebug.jobsFailed7d')}
        value={failedJobs}
        borderColor={failedJobs ? theme.colors.accent.error : undefined}
        valueColor={failedJobs ? theme.colors.accent.error : undefined}
      />
      <StatCard
        label={t('admin.githubDebug.jobsCompleted7d')}
        value={completedJobs}
        valueColor={theme.colors.accent.success}
      />
      <StatCard
        label={t('admin.githubDebug.jobsQueued')}
        value={createdJobs}
        valueColor={createdJobs > 0 ? theme.colors.accent.warning : undefined}
      />
      <StatCard
        label={t('admin.githubDebug.jobsRetry')}
        value={retryJobs}
        valueColor={retryJobs > 0 ? theme.colors.accent.warning : undefined}
      />
    </div>
  );
};

interface SilentFailuresTableProps {
  failures: SilentFailure[];
  formatDate: (d: string | null) => string;
}

const SilentFailuresTable: React.FC<SilentFailuresTableProps> = ({ failures, formatDate }) => {
  const { t } = useTranslation();
  const thStyle: React.CSSProperties = {
    padding: theme.spacing.md,
    textAlign: 'left',
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  };
  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.accent.warning}40`,
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
        marginBottom: theme.spacing.xl,
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr
            style={{
              backgroundColor: theme.colors.background.default,
              borderBottom: `2px solid ${theme.colors.border.medium}`,
            }}
          >
            <th style={thStyle}>{t('admin.githubDebug.threadId')}</th>
            <th style={thStyle}>{t('admin.githubDebug.links')}</th>
            <th style={thStyle}>{t('admin.githubDebug.lastAttempted')}</th>
          </tr>
        </thead>
        <tbody>
          {failures.map((failure, index) => (
            <tr
              key={failure.threadId}
              style={{
                backgroundColor: index % 2 === 0 ? theme.colors.background.paper : theme.colors.background.default,
                borderBottom: `1px solid ${theme.colors.border.light}`,
              }}
            >
              <td
                style={{
                  padding: theme.spacing.md,
                  fontSize: theme.typography.fontSize.xs,
                  fontFamily: 'monospace',
                  color: theme.colors.text.secondary,
                }}
              >
                {failure.threadId.slice(0, 8)}...
              </td>
              <td
                style={{
                  padding: theme.spacing.md,
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.primary,
                }}
              >
                {failure.links}
              </td>
              <td
                style={{
                  padding: theme.spacing.md,
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.secondary,
                }}
              >
                {formatDate(failure.lastAttempted)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface SilentFailuresProps {
  debugInfo: GitHubDebugInfo;
  formatDate: (d: string | null) => string;
}

export const SilentFailuresPanel: React.FC<SilentFailuresProps> = ({ debugInfo, formatDate }) => {
  const { t } = useTranslation();
  return (
    <>
      <h3
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('admin.githubDebug.silentFailures')}
      </h3>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('admin.githubDebug.silentFailuresDescription')}
      </p>
      {debugInfo.recentSilentFailures.length === 0 ? (
        <div
          style={{
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.md,
            padding: theme.spacing.xl,
            textAlign: 'center',
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xl,
          }}
        >
          {t('admin.githubDebug.noSilentFailures')}
        </div>
      ) : (
        <SilentFailuresTable failures={debugInfo.recentSilentFailures} formatDate={formatDate} />
      )}
    </>
  );
};

interface TokenTestResultDisplayProps {
  result: TokenTestResult;
  testOwnerRepo: string;
}

export const TokenTestResultDisplay: React.FC<TokenTestResultDisplayProps> = ({ result, testOwnerRepo }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        backgroundColor: result.valid ? `${theme.colors.accent.success}15` : `${theme.colors.accent.error}15`,
        border: `1px solid ${result.valid ? theme.colors.accent.success : theme.colors.accent.error}40`,
      }}
    >
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
          <p
            style={{ margin: 0, color: theme.colors.accent.success, fontWeight: theme.typography.fontWeight.semibold }}
          >
            {result.name
              ? t('admin.githubDebug.tokenValidWithName', {
                  status: t('admin.githubDebug.tokenValid'),
                  login: result.login,
                  name: result.name,
                })
              : `${t('admin.githubDebug.tokenValid')} — @${result.login}`}
          </p>
          {result.scopes && result.scopes.length > 0 && (
            <p style={{ margin: 0, fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
              {t('admin.githubDebug.scopes')}: {result.scopes.join(', ')}
            </p>
          )}
          {result.repoAccess !== undefined && (
            <p
              style={{
                margin: 0,
                color: result.repoAccess ? theme.colors.accent.success : theme.colors.accent.error,
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {testOwnerRepo}:{' '}
              {result.repoAccess ? t('admin.githubDebug.repoAccessible') : t('admin.githubDebug.repoNotAccessible')}
              {result.repoIsPrivate !== undefined &&
                ` (${result.repoIsPrivate ? t('admin.githubDebug.private') : t('admin.githubDebug.public')})`}
              {result.repoError ? ` — ${result.repoError}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

interface TokenTesterFormProps {
  testUserId: string;
  setTestUserId: (v: string) => void;
  testOwnerRepo: string;
  setTestOwnerRepo: (v: string) => void;
  testingToken: boolean;
  handleTestToken: () => void;
  tokenTestResult: TokenTestResult | null;
}

const TokenTesterForm: React.FC<TokenTesterFormProps> = ({
  testUserId,
  setTestUserId,
  testOwnerRepo,
  setTestOwnerRepo,
  testingToken,
  handleTestToken,
  tokenTestResult,
}) => {
  const { t } = useTranslation();
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border.medium}`,
    fontSize: theme.typography.fontSize.sm,
    backgroundColor: theme.colors.background.default,
    color: theme.colors.text.primary,
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xs,
  };

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.lg,
        marginBottom: theme.spacing.xl,
      }}
    >
      <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap', marginBottom: theme.spacing.md }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle}>{t('admin.githubDebug.userId')}</label>
          <input
            type="text"
            value={testUserId}
            onChange={event => setTestUserId(event.target.value)}
            placeholder={t('admin.githubDebug.userIdPlaceholder')}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle}>
            {t('admin.githubDebug.testRepo')} ({t('admin.githubDebug.optional')})
          </label>
          <input
            type="text"
            value={testOwnerRepo}
            onChange={event => setTestOwnerRepo(event.target.value)}
            placeholder="owner/repo"
            style={inputStyle}
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
      {tokenTestResult && <TokenTestResultDisplay result={tokenTestResult} testOwnerRepo={testOwnerRepo} />}
    </div>
  );
};

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
  testUserId,
  setTestUserId,
  testOwnerRepo,
  setTestOwnerRepo,
  testingToken,
  handleTestToken,
  tokenTestResult,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <h3
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('admin.githubDebug.tokenTest')}
      </h3>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('admin.githubDebug.tokenTestDescription')}
      </p>
      <TokenTesterForm
        testUserId={testUserId}
        setTestUserId={setTestUserId}
        testOwnerRepo={testOwnerRepo}
        setTestOwnerRepo={setTestOwnerRepo}
        testingToken={testingToken}
        handleTestToken={handleTestToken}
        tokenTestResult={tokenTestResult}
      />
    </>
  );
};

interface FailedJobRowProps {
  job: FailedJob;
  index: number;
  formatDate: (d: string | null) => string;
}

const FailedJobRow: React.FC<FailedJobRowProps> = ({ job, index, formatDate }) => (
  <tr
    style={{
      backgroundColor: index % 2 === 0 ? theme.colors.background.paper : theme.colors.background.default,
      borderBottom: `1px solid ${theme.colors.border.light}`,
    }}
  >
    <td
      style={{
        padding: theme.spacing.md,
        fontSize: theme.typography.fontSize.xs,
        fontFamily: 'monospace',
        color: theme.colors.text.secondary,
      }}
    >
      {job.id.slice(0, 8)}...
    </td>
    <td
      style={{
        padding: theme.spacing.md,
        fontSize: theme.typography.fontSize.xs,
        fontFamily: 'monospace',
        color: theme.colors.text.secondary,
      }}
    >
      {job.emailId?.slice(0, 8)}...
    </td>
    <td style={{ padding: theme.spacing.md, fontSize: theme.typography.fontSize.sm, color: theme.colors.accent.error }}>
      {job.error}
    </td>
    <td
      style={{ padding: theme.spacing.md, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}
    >
      {formatDate(job.createdAt)}
    </td>
    <td
      style={{
        padding: theme.spacing.md,
        textAlign: 'center',
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.primary,
      }}
    >
      {job.retryCount}/{job.retryLimit}
    </td>
  </tr>
);

const FAILED_JOBS_LEFT_TH_KEYS = [
  'admin.githubDebug.jobId',
  'admin.githubDebug.emailId',
  'admin.githubDebug.error',
  'admin.githubDebug.createdAt',
];

interface FailedJobsTableProps {
  jobs: FailedJob[];
  formatDate: (d: string | null) => string;
}

const FailedJobsTable: React.FC<FailedJobsTableProps> = ({ jobs, formatDate }) => {
  const { t } = useTranslation();
  const thStyle: React.CSSProperties = {
    padding: theme.spacing.md,
    textAlign: 'left',
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
  };
  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr
            style={{
              backgroundColor: theme.colors.background.default,
              borderBottom: `2px solid ${theme.colors.border.medium}`,
            }}
          >
            {FAILED_JOBS_LEFT_TH_KEYS.map(key => (
              <th key={key} style={thStyle}>
                {t(key)}
              </th>
            ))}
            <th
              style={{
                padding: theme.spacing.md,
                textAlign: 'center',
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.primary,
              }}
            >
              {t('admin.githubDebug.retries')}
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, index) => (
            <FailedJobRow key={job.id} job={job} index={index} formatDate={formatDate} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface FailedJobsProps {
  debugInfo: GitHubDebugInfo;
  formatDate: (d: string | null) => string;
}

export const FailedJobsPanel: React.FC<FailedJobsProps> = ({ debugInfo, formatDate }) => {
  const { t } = useTranslation();
  return (
    <>
      <h3
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('admin.githubDebug.recentFailures')}
      </h3>

      {debugInfo.recentFailedJobs.length === 0 ? (
        <div
          style={{
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.md,
            padding: theme.spacing.xl,
            textAlign: 'center',
            color: theme.colors.text.secondary,
          }}
        >
          {t('admin.githubDebug.noRecentFailures')}
        </div>
      ) : (
        <FailedJobsTable jobs={debugInfo.recentFailedJobs} formatDate={formatDate} />
      )}
    </>
  );
};

interface GitHubDebugHeaderProps {
  lastUpdated: Date | null;
  onRefresh: () => void;
}

export const GitHubDebugHeader: React.FC<GitHubDebugHeaderProps> = ({ lastUpdated, onRefresh }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.lg,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
        }}
      >
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
