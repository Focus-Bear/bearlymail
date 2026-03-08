import React from 'react';
import { theme } from 'theme/theme';

import { JobStat } from './JobsSection.types';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60000;

/**
 * Converts a duration in milliseconds to a human-readable string (e.g. "1m 30s").
 * Returns the i18n no-data label when the value is null.
 */
export function formatDuration(ms: number | null, tFunc: (key: string) => string): string {
  if (ms === null || ms === undefined) {
    return tFunc('admin.jobs.noData');
  }
  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < MS_PER_MINUTE) {
    return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / MS_PER_MINUTE);
  const seconds = Math.floor((ms % MS_PER_MINUTE) / MS_PER_SECOND);
  return `${minutes}m ${seconds}s`;
}

interface JobsTableBodyProps {
  sortedStats: JobStat[];
  t: (key: string) => string;
  formatDur: (ms: number | null) => string;
}

/**
 * Renders the data rows of the jobs stats table, colour-coding each metric
 * cell based on whether the count is above zero. Shows an empty-state row
 * when there are no jobs to display.
 */
export const JobsTableBody: React.FC<JobsTableBodyProps> = ({ sortedStats, t, formatDur }) => {
  if (sortedStats.length === 0) {
    return (
      <tbody>
        <tr>
          <td
            colSpan={7}
            style={{ padding: theme.spacing.xl, textAlign: 'center', color: theme.colors.text.secondary }}
          >
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
          <td
            style={{
              padding: theme.spacing.md,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text.primary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}
          >
            {stat.jobType}
          </td>
          <td
            style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: stat.queued > 0 ? theme.colors.accent.warning : theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}
          >
            {stat.queued}
          </td>
          <td
            style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: stat.active > 0 ? theme.colors.accent.info : theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}
          >
            {stat.active}
          </td>
          <td
            style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: stat.retry > 0 ? theme.colors.accent.warning : theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}
          >
            {stat.retry}
          </td>
          <td
            style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: stat.failed > 0 ? theme.colors.accent.error : theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}
          >
            {stat.failed}
          </td>
          <td
            style={{
              padding: theme.spacing.md,
              textAlign: 'center',
              color: stat.completed > 0 ? theme.colors.accent.success : theme.colors.text.secondary,
              borderRight: `1px solid ${theme.colors.border.light}`,
            }}
          >
            {stat.completed.toLocaleString()}
          </td>
          <td style={{ padding: theme.spacing.md, textAlign: 'center', color: theme.colors.text.primary }}>
            {formatDur(stat.avgCompletionTimeMs)}
          </td>
        </tr>
      ))}
    </tbody>
  );
};
