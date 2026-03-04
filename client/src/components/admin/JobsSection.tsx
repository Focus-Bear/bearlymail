import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { SORT_ASC, SORT_DESC, TYPEOF_STRING } from 'constants/strings';

interface JobStat {
  jobType: string;
  queued: number;
  active: number;
  retry: number;
  failed: number;
  completed: number;
  avgCompletionTimeMs: number | null;
}

interface JobStatsResponse {
  stats: JobStat[];
  timestamp: string;
}

type DateRange = '24h' | '7d' | '30d' | 'all';
type SortColumn = 'jobType' | 'queued' | 'active' | 'retry' | 'failed' | 'completed' | 'avgCompletionTimeMs';
type SortDirection = 'asc' | 'desc';

export const JobsSection: React.FC = () => {
  const { t } = useTranslation();
  const [jobStats, setJobStats] = useState<JobStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [sortColumn, setSortColumn] = useState<SortColumn>('jobType');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const fetchJobStats = useCallback(async () => {
    try {
      const response = await axios.get<JobStatsResponse>(`${API_URL}/emails/admin/job-stats`, {
        params: { range: dateRange },
      });
      setJobStats(response.data.stats);
      setLastUpdated(new Date(response.data.timestamp));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching job stats:', error);
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchJobStats();

    // Auto-refresh every 10 seconds
    const REFRESH_INTERVAL_MS = 10000;
    const interval = setInterval(() => {
      fetchJobStats();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchJobStats]);

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

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === SORT_ASC ? SORT_DESC : SORT_ASC);
    } else {
      setSortColumn(column);
      setSortDirection(SORT_ASC);
    }
  };

  const getSortedStats = (): JobStat[] => {
    return [...jobStats].sort((a, b) => {
      let aValue: string | number | null = a[sortColumn];
      let bValue: string | number | null = b[sortColumn];

      if (aValue === null) aValue = sortDirection === SORT_ASC ? Infinity : -Infinity;
      if (bValue === null) bValue = sortDirection === SORT_ASC ? Infinity : -Infinity;

      if (typeof aValue === TYPEOF_STRING && typeof bValue === TYPEOF_STRING) {
        return sortDirection === SORT_ASC
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (sortDirection === SORT_ASC) {
        return (aValue as number) - (bValue as number);
      }
      return (bValue as number) - (aValue as number);
    });
  };

  const getSortIndicator = (column: SortColumn): string => {
    if (sortColumn !== column) return '';
    return sortDirection === SORT_ASC ? ' ▲' : ' ▼';
  };

  const headerStyle = (isFirst: boolean, isLast: boolean): React.CSSProperties => ({
    padding: theme.spacing.md,
    textAlign: isFirst ? 'left' : 'center',
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    borderRight: isLast ? 'none' : `1px solid ${theme.colors.border.light}`,
    cursor: 'pointer',
    userSelect: 'none',
  });

  const renderTableHeader = () => (
    <thead>
      <tr style={{
        backgroundColor: theme.colors.background.default,
        borderBottom: `2px solid ${theme.colors.border.medium}`,
      }}>
        <th style={headerStyle(true, false)} onClick={() => handleSort('jobType')}>
          {t('admin.jobs.jobType')}{getSortIndicator('jobType')}
        </th>
        <th style={headerStyle(false, false)} onClick={() => handleSort('queued')}>
          {t('admin.jobs.queued')}{getSortIndicator('queued')}
        </th>
        <th style={headerStyle(false, false)} onClick={() => handleSort('active')}>
          {t('admin.jobs.active')}{getSortIndicator('active')}
        </th>
        <th style={headerStyle(false, false)} onClick={() => handleSort('retry')}>
          {t('admin.jobs.retry')}{getSortIndicator('retry')}
        </th>
        <th style={headerStyle(false, false)} onClick={() => handleSort('failed')}>
          {t('admin.jobs.failed')}{getSortIndicator('failed')}
        </th>
        <th style={headerStyle(false, false)} onClick={() => handleSort('completed')}>
          {t('admin.jobs.completed')}{getSortIndicator('completed')}
        </th>
        <th style={headerStyle(false, true)} onClick={() => handleSort('avgCompletionTimeMs')}>
          {t('admin.jobs.avgCompletionTime')}{getSortIndicator('avgCompletionTimeMs')}
        </th>
      </tr>
    </thead>
  );

  const renderTableBody = () => {
    const sortedStats = getSortedStats();

    if (sortedStats.length === 0) {
      return (
        <tbody>
          <tr>
            <td colSpan={7} style={{
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
        {sortedStats.map((stat, index) => (
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
              color: stat.completed > 0 ? theme.colors.accent.success : theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}>
              {stat.completed.toLocaleString()}
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

  const dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: '24h', label: t('admin.jobs.range.24h') },
    { value: '7d', label: t('admin.jobs.range.7d') },
    { value: '30d', label: t('admin.jobs.range.30d') },
    { value: 'all', label: t('admin.jobs.range.all') },
  ];

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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
        }}>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
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
            {dateRangeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {lastUpdated && (
            <div style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
            }}>
              {t('admin.jobs.lastUpdated')}: {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
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
