import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import { LocalModelAccuracySection } from './LocalModelAccuracySection';
import { TokenDateFilter } from './TokenUsagePanels';
import { CategoryUsage, PriorityUsage, useLocalModelUsageData } from './useLocalModelUsageData';

const PERCENT_MULTIPLIER = 100;

const pctOf = (part: number, total: number): number =>
  total ? Math.round((part / total) * PERCENT_MULTIPLIER) : 0;

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, sub, accent }) => (
  <div
    style={{
      flex: 1,
      minWidth: 0,
      padding: theme.spacing.lg,
      backgroundColor: theme.colors.background.paper,
      border: `1px solid ${theme.colors.border.light}`,
      borderRadius: theme.borderRadius.md,
    }}
  >
    <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>{label}</div>
    <div
      style={{
        fontSize: theme.typography.fontSize['2xl'],
        fontWeight: theme.typography.fontWeight.bold,
        color: accent ?? theme.colors.text.primary,
      }}
    >
      {value}
    </div>
    {sub && <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary }}>{sub}</div>}
  </div>
);

interface BreakdownRow {
  label: string;
  count: number;
  pct: number;
  // Sub-rows (e.g. the Deferred / Awaiting-scoring split of Unprocessed) render
  // indented and muted so they read as a breakdown of the row above them.
  indent?: boolean;
}

const BreakdownTable: React.FC<{ title: string; rows: BreakdownRow[]; totalLabel: string; total: number }> = ({
  title,
  rows,
  totalLabel,
  total,
}) => (
  <div style={{ marginBottom: theme.spacing.xl }}>
    <h3 style={{ fontSize: theme.typography.fontSize.lg, color: theme.colors.text.primary, marginBottom: theme.spacing.sm }}>
      {title}
    </h3>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map(row => (
          <tr key={row.label} style={{ borderBottom: `1px solid ${theme.colors.border.light}` }}>
            <td
              style={{
                padding: theme.spacing.sm,
                paddingLeft: row.indent ? theme.spacing.xl : theme.spacing.sm,
                color: row.indent ? theme.colors.text.secondary : theme.colors.text.primary,
                fontSize: row.indent ? theme.typography.fontSize.sm : undefined,
              }}
            >
              {row.label}
            </td>
            <td style={{ padding: theme.spacing.sm, textAlign: 'right', color: theme.colors.text.secondary }}>
              {row.count.toLocaleString()}
            </td>
            <td
              style={{
                padding: theme.spacing.sm,
                textAlign: 'right',
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.primary,
              }}
            >
              {row.pct}%
            </td>
          </tr>
        ))}
        <tr>
          <td style={{ padding: theme.spacing.sm, fontWeight: theme.typography.fontWeight.bold }}>{totalLabel}</td>
          <td style={{ padding: theme.spacing.sm, textAlign: 'right', fontWeight: theme.typography.fontWeight.bold }}>
            {total.toLocaleString()}
          </td>
          <td />
        </tr>
      </tbody>
    </table>
  </div>
);

// The Unprocessed row is split into its Deferred (skipped by design) and
// Awaiting-scoring (genuinely pending) parts, rendered as indented sub-rows.
const buildPriorityRows = (priority: PriorityUsage, translate: TFunction): BreakdownRow[] => [
  { label: translate('admin.localModel.local'), count: priority.local, pct: priority.localPct },
  { label: translate('admin.localModel.llm'), count: priority.llm, pct: priority.llmPct },
  { label: translate('admin.localModel.rule'), count: priority.rule, pct: pctOf(priority.rule, priority.total) },
  { label: translate('admin.localModel.unprocessed'), count: priority.unprocessed, pct: pctOf(priority.unprocessed, priority.total) },
  { label: translate('admin.localModel.deferred'), count: priority.deferred, pct: pctOf(priority.deferred, priority.total), indent: true },
  { label: translate('admin.localModel.pending'), count: priority.pending, pct: pctOf(priority.pending, priority.total), indent: true },
];

const buildCategoryRows = (category: CategoryUsage, translate: TFunction): BreakdownRow[] => [
  { label: translate('admin.localModel.local'), count: category.local, pct: category.localPct },
  { label: translate('admin.localModel.llm'), count: category.llm, pct: pctOf(category.llm, category.total) },
  { label: translate('admin.localModel.rule'), count: category.rule ?? 0, pct: pctOf(category.rule ?? 0, category.total) },
  { label: translate('admin.localModel.unprocessed'), count: category.unprocessed, pct: pctOf(category.unprocessed, category.total) },
  { label: translate('admin.localModel.deferred'), count: category.deferred, pct: pctOf(category.deferred, category.total), indent: true },
  { label: translate('admin.localModel.pending'), count: category.pending, pct: pctOf(category.pending, category.total), indent: true },
];

export const LocalModelUsageSection: React.FC = () => {
  const { t } = useTranslation();
  const { usage, loading, lastUpdated, dateRange, setDateRange } = useLocalModelUsageData();

  if (loading) {
    return <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>{t('admin.dashboard.loading')}</div>;
  }

  const priority: PriorityUsage = usage?.priority ?? {
    local: 0,
    llm: 0,
    rule: 0,
    unprocessed: 0,
    deferred: 0,
    pending: 0,
    total: 0,
    localPct: 0,
    llmPct: 0,
  };
  const category: CategoryUsage = usage?.category ?? {
    local: 0,
    llm: 0,
    rule: 0,
    unprocessed: 0,
    deferred: 0,
    pending: 0,
    total: 0,
    localPct: 0,
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
        <h2
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.primary,
          }}
        >
          {t('admin.localModel.title')}
        </h2>
        {lastUpdated && (
          <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {t('admin.tokenUsage.lastUpdated')}: {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      <TokenDateFilter dateRange={dateRange} onDateRangeChange={setDateRange} />

      <div style={{ display: 'flex', gap: theme.spacing.md, marginBottom: theme.spacing.xl, flexWrap: 'wrap' }}>
        <StatCard
          label={t('admin.localModel.priorityLocal')}
          value={`${priority.localPct}%`}
          sub={`${priority.local.toLocaleString()} / ${priority.total.toLocaleString()}`}
          accent={theme.colors.success.main}
        />
        <StatCard
          label={t('admin.localModel.priorityLlm')}
          value={`${priority.llmPct}%`}
          sub={priority.llm.toLocaleString()}
          accent={theme.colors.error.main}
        />
        <StatCard label={t('admin.localModel.categoryLocal')} value={`${category.localPct}%`} sub={category.local.toLocaleString()} />
        <StatCard label={t('admin.localModel.unprocessed')} value={priority.unprocessed.toLocaleString()} />
      </div>

      <BreakdownTable
        title={t('admin.localModel.priorityTitle')}
        totalLabel={t('admin.localModel.total')}
        total={priority.total}
        rows={buildPriorityRows(priority, t)}
      />

      <BreakdownTable
        title={t('admin.localModel.categoryTitle')}
        totalLabel={t('admin.localModel.total')}
        total={category.total}
        rows={buildCategoryRows(category, t)}
      />

      <p style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
        {t('admin.localModel.caption')}
      </p>

      <LocalModelAccuracySection />
    </div>
  );
};
