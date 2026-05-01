import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { getMfaErrorType } from 'utils/mfaErrors';

import { API_URL } from 'config/api';
import { SORT_ASC, SORT_DESC } from 'constants/strings';

import { useAdminMfa } from './AdminMfaGate';
import { DateRange, JobStat, JobStatsResponse, SortColumn, SortDirection } from './JobsSection.types';
import { JobsSectionHeader } from './JobsSectionHeader';
import { JobsTableBody } from './JobsTableBody';
import { JobsTableHeader } from './JobsTableHeader';

const REFRESH_INTERVAL_MS = 10000;

/**
 * Admin section that polls job queue stats and renders them in a sortable table.
 * Supports date-range filtering and auto-refreshes every 10 seconds.
 */
export const JobsSection: React.FC = () => {
  const { t } = useTranslation();
  const { onMfaRequired, mfaVerifiedAt } = useAdminMfa();
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
      const mfaType = getMfaErrorType(error);
      if (mfaType) {
 onMfaRequired(mfaType); return; 
}
      console.error('Error fetching job stats:', error);
      setLoading(false);
    }
  }, [dateRange, onMfaRequired]);

  useEffect(() => {
    fetchJobStats();
    const interval = setInterval(() => {
      fetchJobStats();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchJobStats, mfaVerifiedAt]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === SORT_ASC ? SORT_DESC : SORT_ASC);
    } else {
      setSortColumn(column);
      setSortDirection(SORT_ASC);
    }
  };

  const sortedStats = [...jobStats].sort((itemA, itemB) => {
    let aValue: string | number | null = itemA[sortColumn];
    let bValue: string | number | null = itemB[sortColumn];
    if (aValue === null) {
      aValue = sortDirection === SORT_ASC ? Infinity : -Infinity;
    }
    if (bValue === null) {
      bValue = sortDirection === SORT_ASC ? Infinity : -Infinity;
    }
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === SORT_ASC ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }
    return sortDirection === SORT_ASC
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number);
  });

  if (loading) {
    return <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>{t('admin.dashboard.loading')}</div>;
  }

  return (
    <div>
      <JobsSectionHeader dateRange={dateRange} onDateRangeChange={setDateRange} lastUpdated={lastUpdated} />
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.md,
          overflow: 'hidden',
          border: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <JobsTableHeader sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} t={t} />
          <JobsTableBody sortedStats={sortedStats} t={t} />
        </table>
      </div>
    </div>
  );
};
