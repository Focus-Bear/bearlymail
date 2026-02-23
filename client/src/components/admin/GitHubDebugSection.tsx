import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import axios from 'axios';
import { API_URL } from 'config/api';

interface FailedJob {
  id: string;
  userId?: string;
  emailId?: string;
  threadId?: string;
  error: string;
  createdAt: string;
  completedAt: string | null;
  retryCount: number;
  retryLimit: number;
}

interface JobStats {
  created?: number;
  active?: number;
  retry?: number;
  failed?: number;
  completed?: number;
}

interface GitHubDebugInfo {
  usersWithToken: number;
  threadsWithMetadata: number;
  jobStats: JobStats;
  recentFailedJobs: FailedJob[];
  timestamp: string;
}

export const GitHubDebugSection: React.FC = () => {
  const { t } = useTranslation();
  const [debugInfo, setDebugInfo] = useState<GitHubDebugInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchDebugInfo = useCallback(async () => {
    try {
      const response = await axios.get<GitHubDebugInfo>(`${API_URL}/github/admin/debug`);
      setDebugInfo(response.data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching GitHub debug info:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDebugInfo();
  }, [fetchDebugInfo]);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return t('admin.githubDebug.never');
    return new Date(dateStr).toLocaleString();
  };

  const statCardStyle: React.CSSProperties = {
    backgroundColor: theme.colors.background.paper,
    border: `1px solid ${theme.colors.border.light}`,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: theme.typography.fontSize['2xl'],
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.text.primary,
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>
        {t('admin.dashboard.loading')}
      </div>
    );
  }

  if (!debugInfo) {
    return (
      <div style={{ textAlign: 'center', padding: theme.spacing['3xl'], color: theme.colors.text.secondary }}>
        {t('admin.githubDebug.loadError')}
      </div>
    );
  }

  return (
    <div>
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
            onClick={fetchDebugInfo}
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

      <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.xl }}>
        {t('admin.githubDebug.description')}
      </p>

      {/* Stats grid */}
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

      {/* Recent failed jobs */}
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
    </div>
  );
};
