import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface JobStat {
  jobType: string;
  queued: number;
  active: number;
  retry: number;
  failed: number;
  avgCompletionTimeMs: number | null;
}

interface JobStatsResponse {
  stats: JobStat[];
  timestamp: string;
}

export const JobsSection: React.FC = () => {
  const { t } = useTranslation();
  const [jobStats, setJobStats] = useState<JobStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchJobStats = async () => {
    try {
      const response = await axios.get<JobStatsResponse>(`${API_URL}/emails/admin/job-stats`);
      setJobStats(response.data.stats);
      setLastUpdated(new Date(response.data.timestamp));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching job stats:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobStats();
    
    // Auto-refresh every 10 seconds
    const REFRESH_INTERVAL_MS = 10000;
    const interval = setInterval(() => {
      fetchJobStats();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const formatDuration = (ms: number | null): string => {
    if (ms === null || ms === undefined) {
      return t('admin.jobs.noData');
    }
    
    const MS_PER_SECOND = 1000;
    const MS_PER_MINUTE = 60000;
    
    if (ms < MS_PER_SECOND) {
      return `${Math.round(ms)}ms`;
    }
    
    if (ms < MS_PER_MINUTE) {
      return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
    }
    
    const minutes = Math.floor(ms / MS_PER_MINUTE);
    const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);
    return `${minutes}m ${seconds}s`;
  };

  const renderTableHeader = () => (
    <thead>
      <tr style={{
        backgroundColor: theme.colors.background.default,
        borderBottom: `2px solid ${theme.colors.border.medium}`,
      }}>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'left',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          borderRight: `1px solid ${theme.colors.border.light}`,
        }}>
          {t('admin.jobs.jobType')}
        </th>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'center',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          borderRight: `1px solid ${theme.colors.border.light}`,
        }}>
          {t('admin.jobs.queued')}
        </th>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'center',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          borderRight: `1px solid ${theme.colors.border.light}`,
        }}>
          {t('admin.jobs.active')}
        </th>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'center',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          borderRight: `1px solid ${theme.colors.border.light}`,
        }}>
          {t('admin.jobs.retry')}
        </th>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'center',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          borderRight: `1px solid ${theme.colors.border.light}`,
        }}>
          {t('admin.jobs.failed')}
        </th>
        <th style={{
          padding: theme.spacing.md,
          textAlign: 'center',
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}>
          {t('admin.jobs.avgCompletionTime')}
        </th>
      </tr>
    </thead>
  );

  const renderTableBody = () => {
    if (jobStats.length === 0) {
      return (
        <tbody>
          <tr>
            <td colSpan={6} style={{
              padding: theme.spacing.xl,
              textAlign: 'center',
              color: theme.colors.text.secondary,
            }}>
              {t('admin.jobs.noJobs')}
            </td>
          </tr>
        </tbody>
      );
    }

    return (
      <tbody>
        {jobStats.map((stat, index) => (
          <tr
            key={stat.jobType}
            style={{
              backgroundColor: index % 2 === 0 ? theme.colors.background.paper : theme.colors.background.default,
              borderBottom: `1px solid ${theme.colors.border.light}`,
            }}
          >
            <td style={{
              padding: theme.spacing.md,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text.primary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}>
              {stat.jobType}
            </td>
            <td style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: stat.queued > 0 ? theme.colors.accent.warning : theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}>
              {stat.queued}
            </td>
            <td style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: stat.active > 0 ? theme.colors.accent.info : theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}>
              {stat.active}
            </td>
            <td style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: stat.retry > 0 ? theme.colors.accent.warning : theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}>
              {stat.retry}
            </td>
            <td style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: stat.failed > 0 ? theme.colors.accent.error : theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}>
              {stat.failed}
            </td>
            <td style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: theme.colors.text.primary,
            }}>
              {formatDuration(stat.avgCompletionTimeMs)}
            </td>
          </tr>
        ))}
      </tbody>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>
        {t('admin.dashboard.loading')}
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
          {t('admin.jobs.title')}
        </h2>
        {lastUpdated && (
          <div style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}>
            {t('admin.jobs.lastUpdated')}: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      <div style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        overflow: 'hidden',
        border: `1px solid ${theme.colors.border.light}`,
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}>
          {renderTableHeader()}
          {renderTableBody()}
        </table>
      </div>
    </div>
  );
};
