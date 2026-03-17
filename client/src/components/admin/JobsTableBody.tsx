import React from 'react';
import { theme } from 'theme/theme';

import { JobStat } from './JobsSection.types';
import { formatDuration } from './jobsTable.helpers';

interface JobsTableBodyProps {
  sortedStats: JobStat[];
  t: (key: string) => string;
}

/**
 * Renders the data rows of the jobs stats table, colour-coding each metric
 * cell based on whether the count is above zero. Shows an empty-state row
 * when there are no jobs to display.
 */
export const JobsTableBody: React.FC<JobsTableBodyProps> = ({ sortedStats, t }) => {
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
            {formatDuration(stat.avgCompletionTimeMs, t)}
          </td>
        </tr>
      ))}
    </tbody>
  );
};
