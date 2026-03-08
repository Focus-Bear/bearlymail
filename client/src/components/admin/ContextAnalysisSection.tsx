import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { AnalysisList } from './AnalysisList';
import { StatusFilter } from './ContextAnalysisSection.types';
import { useContextAnalysisData } from './useContextAnalysisData';

interface AnalysisFilterBarProps {
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  lastUpdated: Date | null;
}

/**
 * Header bar for the Context Analysis section. Shows the section title,
 * a status filter dropdown, and the last-updated timestamp.
 */
const AnalysisFilterBar: React.FC<AnalysisFilterBarProps> = ({ statusFilter, onStatusFilterChange, lastUpdated }) => {
  const { t } = useTranslation();
  const statusFilterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('admin.contextAnalysis.filter.all') },
    { value: 'failed', label: t('admin.contextAnalysis.filter.failed') },
    { value: 'running', label: t('admin.contextAnalysis.filter.running') },
    { value: 'completed', label: t('admin.contextAnalysis.filter.completed') },
    { value: 'pending', label: t('admin.contextAnalysis.filter.pending') },
  ];
  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
        }}
      >
        {t('admin.contextAnalysis.title')}
      </h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        <select
          value={statusFilter}
          onChange={event => onStatusFilterChange(event.target.value as StatusFilter)}
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
          {statusFilterOptions.map(option => (
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

/**
 * Admin section that lists context analysis runs with live polling.
 * Users can filter by status and expand individual cards to inspect batch failures.
 */
export const ContextAnalysisSection: React.FC = () => {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('failed');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { analyses, loading, lastUpdated, copiedId, copyToClipboard } = useContextAnalysisData(statusFilter);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>{t('admin.dashboard.loading')}</div>;
  }

  return (
    <div>
      <AnalysisFilterBar statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} lastUpdated={lastUpdated} />
      <p
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          marginBottom: theme.spacing.lg,
        }}
      >
        {t('admin.contextAnalysis.description')}
      </p>
      <AnalysisList
        analyses={analyses}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        copiedId={copiedId}
        onCopy={copyToClipboard}
      />
    </div>
  );
};
