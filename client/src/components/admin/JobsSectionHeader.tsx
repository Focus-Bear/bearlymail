import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { DateRange } from './JobsSection.types';

export const DATE_RANGE_KEYS: DateRange[] = ['24h', '7d', '30d', 'all'];

interface JobsSectionHeaderProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  lastUpdated: Date | null;
}

/**
 * Header bar for the Jobs section. Shows the section title, a date-range
 * dropdown to scope the stats, and the last-updated timestamp.
 */
export const JobsSectionHeader: React.FC<JobsSectionHeaderProps> = ({ dateRange, onDateRangeChange, lastUpdated }) => {
  const { t } = useTranslation();
  const dateRangeOptions = DATE_RANGE_KEYS.map(value => ({
    value,
    label: t(`admin.jobs.range.${value}`),
  }));

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
        {t('admin.jobs.title')}
      </h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        <select
          value={dateRange}
          onChange={event => onDateRangeChange(event.target.value as DateRange)}
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
          {dateRangeOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {lastUpdated && (
          <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('admin.jobs.lastUpdated')}: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};
