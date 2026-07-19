import React from 'react';
import { theme } from 'theme/theme';

import { SORT_ASC } from 'constants/strings';

import { SortColumn, SortDirection } from './JobsSection.types';

const SORT_COLUMN_AVG: SortColumn = 'avgCompletionTimeMs';
const SORT_COLUMN_AVG_LABEL = 'avgCompletionTime';

export const JOB_COLUMNS: SortColumn[] = [
  'jobType',
  'queued',
  'active',
  'retry',
  'failed',
  'completed',
  'avgCompletionTimeMs',
];

const COLUMN_LAST_IDX = JOB_COLUMNS.length - 1;

/** Returns the i18n label key segment for a given sort column. */
const getColumnLabel = (col: SortColumn) => (col === SORT_COLUMN_AVG ? SORT_COLUMN_AVG_LABEL : col);

/** Returns the sort direction indicator arrow for the currently active sort column. */
const getSortIndicator = (column: SortColumn, sortColumn: SortColumn, sortDirection: SortDirection): string => {
  if (sortColumn !== column) {
    return '';
  }
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

interface JobsTableHeaderProps {
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (col: SortColumn) => void;
  t: (key: string) => string;
}

/**
 * Renders the sticky header row for the jobs stats table, with clickable
 * column headings that cycle through ascending/descending sort order.
 */
export const JobsTableHeader: React.FC<JobsTableHeaderProps> = ({ sortColumn, sortDirection, onSort, t }) => (
  <thead>
    <tr
      style={{
        backgroundColor: theme.colors.background.default,
        borderBottom: `2px solid ${theme.colors.border.medium}`,
      }}
    >
      {JOB_COLUMNS.map((col, idx) => (
        <th key={col} style={headerStyle(idx === 0, idx === COLUMN_LAST_IDX)} onClick={() => onSort(col)}>
          {t(`admin.jobs.${getColumnLabel(col)}`)}
          {getSortIndicator(col, sortColumn, sortDirection)}
        </th>
      ))}
    </tr>
  </thead>
);
