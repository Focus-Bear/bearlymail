import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { CategoryAccuracy, CategoryAccuracyReport, useLocalModelAccuracyData } from './useLocalModelAccuracyData';

// The supervision rate is the share of confident local calls we divert to the
// LLM to double-check, so a LOWER rate means the category has earned MORE trust.
const RATE_TRUSTED = 10;
const RATE_MONITORING = 25;
const RATE_WATCHING = 50;

type RateLabelKey = 'trusted' | 'monitoring' | 'watching';

const RATE_LABEL_BY_RATE: Record<number, RateLabelKey> = {
  [RATE_TRUSTED]: 'trusted',
  [RATE_MONITORING]: 'monitoring',
  [RATE_WATCHING]: 'watching',
};

const RATE_BADGE_COLOR_BY_KEY: Record<RateLabelKey, string> = {
  trusted: theme.colors.success.main,
  monitoring: theme.colors.warning.main,
  watching: theme.colors.error.main,
};

interface RateBadgeProps {
  sampleRatePercent: number;
}

const RateBadge: React.FC<RateBadgeProps> = ({ sampleRatePercent }) => {
  const { t } = useTranslation();
  const key: RateLabelKey = RATE_LABEL_BY_RATE[sampleRatePercent] ?? 'watching';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        borderRadius: theme.borderRadius.sm,
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.semibold,
        color: RATE_BADGE_COLOR_BY_KEY[key],
        border: `1px solid ${RATE_BADGE_COLOR_BY_KEY[key]}`,
      }}
    >
      {t(`admin.localModel.accuracy.${key}`)} · {sampleRatePercent}%
    </span>
  );
};

const AccuracyRow: React.FC<{ category: CategoryAccuracy }> = ({ category }) => (
  <tr style={{ borderBottom: `1px solid ${theme.colors.border.light}` }}>
    <td style={{ padding: theme.spacing.sm, color: theme.colors.text.primary }}>{category.category}</td>
    <td style={{ padding: theme.spacing.sm }}>
      <RateBadge sampleRatePercent={category.sampleRatePercent} />
    </td>
    <td
      style={{
        padding: theme.spacing.sm,
        textAlign: 'right',
        fontWeight: theme.typography.fontWeight.semibold,
        color: theme.colors.text.primary,
      }}
    >
      {category.agreementPct}%
      <span style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
        {' '}
        ({category.lifetimeAgreements.toLocaleString()}/{category.lifetimeSamples.toLocaleString()})
      </span>
    </td>
    <td style={{ padding: theme.spacing.sm, textAlign: 'right', color: theme.colors.text.secondary }}>
      {category.lifetimeSamples.toLocaleString()}
    </td>
  </tr>
);

interface LocalModelAccuracyViewProps {
  report: CategoryAccuracyReport | null;
  loading: boolean;
  lastUpdated: Date | null;
}

export const LocalModelAccuracyView: React.FC<LocalModelAccuracyViewProps> = ({ report, loading }) => {
  const { t } = useTranslation();

  if (loading) {
    return null;
  }

  const overall = report?.overall ?? { samples: 0, agreements: 0, agreementPct: 0 };
  const categories = report?.categories ?? [];

  return (
    <div style={{ marginTop: theme.spacing['2xl'] }}>
      <h2
        style={{
          margin: 0,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
        }}
      >
        {t('admin.localModel.accuracy.title')}
      </h2>

      <div
        style={{
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
          backgroundColor: theme.colors.background.paper,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
        }}
      >
        <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {t('admin.localModel.accuracy.overallLabel')}
        </div>
        <div
          style={{
            fontSize: theme.typography.fontSize['3xl'],
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.success.main,
          }}
        >
          {overall.agreementPct}%
        </div>
        <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary }}>
          {t('admin.localModel.accuracy.caption')} ({overall.agreements.toLocaleString()}/
          {overall.samples.toLocaleString()})
        </div>
      </div>

      {categories.length === 0 ? (
        <p style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
          {t('admin.localModel.accuracy.empty')}
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${theme.colors.border.light}` }}>
              <th style={{ padding: theme.spacing.sm, textAlign: 'left', color: theme.colors.text.secondary }}>
                {t('admin.localModel.accuracy.columns.category')}
              </th>
              <th style={{ padding: theme.spacing.sm, textAlign: 'left', color: theme.colors.text.secondary }}>
                {t('admin.localModel.accuracy.columns.rate')}
              </th>
              <th style={{ padding: theme.spacing.sm, textAlign: 'right', color: theme.colors.text.secondary }}>
                {t('admin.localModel.accuracy.columns.agreement')}
              </th>
              <th style={{ padding: theme.spacing.sm, textAlign: 'right', color: theme.colors.text.secondary }}>
                {t('admin.localModel.accuracy.columns.samples')}
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map(category => (
              <AccuracyRow key={category.category} category={category} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export const LocalModelAccuracySection: React.FC = () => {
  const { report, loading, lastUpdated } = useLocalModelAccuracyData();
  return <LocalModelAccuracyView report={report} loading={loading} lastUpdated={lastUpdated} />;
};
