import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { TokenDateFilter } from './TokenUsagePanels';
import { CategoryUsage, PriorityUsage, useLocalModelUsageData } from './useLocalModelUsageData';

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
            <td style={{ padding: theme.spacing.sm, color: theme.colors.text.primary }}>{row.label}</td>
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
    total: 0,
    localPct: 0,
    llmPct: 0,
  };
  const category: CategoryUsage = usage?.category ?? {
    local: 0,
    llm: 0,
    rule: 0,
    unprocessed: 0,
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
        rows={[
          { label: t('admin.localModel.local'), count: priority.local, pct: priority.localPct },
          { label: t('admin.localModel.llm'), count: priority.llm, pct: priority.llmPct },
          {
            label: t('admin.localModel.rule'),
            count: priority.rule,
            pct: priority.total ? Math.round((priority.rule / priority.total) * 100) : 0,
          },
          {
            label: t('admin.localModel.unprocessed'),
            count: priority.unprocessed,
            pct: priority.total ? Math.round((priority.unprocessed / priority.total) * 100) : 0,
          },
        ]}
      />

      <BreakdownTable
        title={t('admin.localModel.categoryTitle')}
        totalLabel={t('admin.localModel.total')}
        total={category.total}
        rows={[
          { label: t('admin.localModel.local'), count: category.local, pct: category.localPct },
          {
            label: t('admin.localModel.llm'),
            count: category.llm,
            pct: category.total ? Math.round((category.llm / category.total) * 100) : 0,
          },
          {
            label: t('admin.localModel.rule'),
            count: category.rule ?? 0,
            pct: category.total ? Math.round(((category.rule ?? 0) / category.total) * 100) : 0,
          },
          {
            label: t('admin.localModel.unprocessed'),
            count: category.unprocessed,
            pct: category.total ? Math.round((category.unprocessed / category.total) * 100) : 0,
          },
        ]}
      />

      <p style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
        {t('admin.localModel.caption')}
      </p>
    </div>
  );
};
