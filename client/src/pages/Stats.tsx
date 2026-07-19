import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { SidebarPageLayout } from 'components/layout/SidebarPageLayout';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import {
  CALENDAR_DAYS_AHEAD,
  CHART_BAR_HEIGHT_OFFSET,
  CHART_BAR_MAX_WIDTH,
  DAYS_IN_MONTH_30,
  DAYS_IN_MONTH_MAX,
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  MONTHS_IN_YEAR,
  STATS_PERIOD_14_DAYS,
} from 'constants/numbers';
import { STRING_NONE, STRING_UPPERCASE } from 'constants/strings';
import { CategoryStats, ProcessedEmailStats, useEmailStats } from 'hooks/useEmailStats';

const PERIOD_OPTIONS = [7, STATS_PERIOD_14_DAYS, DAYS_IN_MONTH_30, MINUTES_PER_HOUR, CALENDAR_DAYS_AHEAD] as const;

function formatReplyTime(minutes: number | null): string {
  if (minutes === null) {
    return '-';
  }
  if (minutes < MINUTES_PER_HOUR) {
    return `${Math.round(minutes)}m`;
  }
  const hours = minutes / MINUTES_PER_HOUR;
  if (hours < HOURS_PER_DAY) {
    return `${Math.round(hours * 10) / 10}h`;
  }
  const days = hours / HOURS_PER_DAY;
  return `${Math.round(days * 10) / 10}d`;
}

const StatCard: React.FC<{
  label: string;
  value: string;
  subtext?: string;
}> = ({ label, value, subtext }) => (
  <div
    style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.lg,
      border: `1px solid ${theme.colors.border.light}`,
      textAlign: 'center',
      flex: '1 1 180px',
    }}
  >
    <div
      style={{
        ...theme.typography.heading.h3,
        color: theme.colors.primary.main,
      }}
    >
      {value}
    </div>
    <div
      style={{
        ...theme.typography.body.large,
        color: theme.colors.text.secondary,
        marginTop: theme.spacing.xs,
      }}
    >
      {label}
    </div>
    {subtext && (
      <div
        style={{
          ...theme.typography.body.medium,
          color: theme.colors.text.tertiary,
          marginTop: theme.spacing.xs,
        }}
      >
        {subtext}
      </div>
    )}
  </div>
);

const CategoryRow: React.FC<{
  stat: CategoryStats;
  maxEmails: number;
}> = ({ stat, maxEmails }) => {
  const { t } = useTranslation();
  const barWidth = maxEmails > 0 ? (stat.totalEmails / maxEmails) * 100 : 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: `${theme.spacing.sm} 0`,
        borderBottom: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <div
        style={{
          width: '160px',
          flexShrink: 0,
          fontWeight: theme.typography.fontWeight.medium,
          color: theme.colors.text.primary,
          ...theme.typography.body.large,
        }}
      >
        {stat.category}
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <div
          style={{
            flex: 1,
            height: '20px',
            backgroundColor: theme.colors.greyscale[300],
            borderRadius: theme.borderRadius.full,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${barWidth}%`,
              height: '100%',
              backgroundColor: theme.colors.primary.main,
              borderRadius: theme.borderRadius.full,
              transition: theme.transitions.default,
            }}
          />
        </div>
        <span
          style={{
            width: '50px',
            textAlign: 'right',
            ...theme.typography.body.large,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
            flexShrink: 0,
          }}
        >
          {stat.totalEmails}
        </span>
      </div>

      <div
        style={{
          width: '100px',
          textAlign: 'center',
          ...theme.typography.body.large,
          color: theme.colors.text.secondary,
          flexShrink: 0,
        }}
      >
        {stat.avgReplyTimeMinutes !== null ? formatReplyTime(stat.avgReplyTimeMinutes) : t('stats.noReplyData')}
      </div>

      <div
        style={{
          width: '80px',
          textAlign: 'center',
          ...theme.typography.body.large,
          color: theme.colors.text.tertiary,
          flexShrink: 0,
        }}
      >
        {stat.repliedCount}
      </div>
    </div>
  );
};

const DailyChart: React.FC<{
  dailyCounts: Array<{ date: string; total: number }>;
}> = ({ dailyCounts }) => {
  const maxCount = Math.max(...dailyCounts.map(day => day.total), 1);
  const CHART_HEIGHT = 160;
  const BAR_GAP = 2;
  const TARGET_LABEL_COUNT = 10;
  const barWidth =
    dailyCounts.length > 0
      ? Math.max(2, Math.min(MONTHS_IN_YEAR, Math.floor(CHART_BAR_MAX_WIDTH / dailyCounts.length) - BAR_GAP))
      : 8;
  const showEveryLabel = dailyCounts.length <= DAYS_IN_MONTH_MAX;
  const labelStep = showEveryLabel ? 1 : Math.ceil(dailyCounts.length / TARGET_LABEL_COUNT);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: `${BAR_GAP}px`,
        height: `${CHART_HEIGHT}px`,
        overflowX: 'auto',
        paddingBottom: theme.spacing.md,
      }}
    >
      {dailyCounts.map((day, index) => {
        const barHeight = Math.max(2, (day.total / maxCount) * (CHART_HEIGHT - CHART_BAR_HEIGHT_OFFSET));
        const dateObj = new Date(day.date);
        const label = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

        return (
          <div
            key={day.date}
            title={`${label}: ${day.total} emails`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <div
              style={{
                width: `${barWidth}px`,
                height: `${barHeight}px`,
                backgroundColor: theme.colors.primary.main,
                borderRadius: `${theme.borderRadius.sm} ${theme.borderRadius.sm} 0 0`,
                transition: theme.transitions.default,
              }}
            />
            {showEveryLabel && (
              <span
                style={{
                  ...theme.typography.body.small,
                  color: theme.colors.text.tertiary,
                  marginTop: '2px',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            )}
            {!showEveryLabel && index % labelStep === 0 && (
              <span
                style={{
                  ...theme.typography.body.small,
                  color: theme.colors.text.tertiary,
                  whiteSpace: 'nowrap',
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: '2px',
                }}
              >
                {label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface DateTimeFormatWithRange extends Intl.DateTimeFormat {
  formatRange?: (startDate: Date, endDate: Date) => string;
}

/**
 * Shows the concrete date range covered by the selected stats period,
 * e.g. "12 Apr – 11 Jun 2026", using locale-aware formatting.
 */
const StatsDateRangeLabel: React.FC<{ days: number }> = ({ days }) => {
  const { t, i18n } = useTranslation();
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - (days - 1));
  const formatter = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }) as DateTimeFormatWithRange;
  const rangeText = formatter.formatRange
    ? formatter.formatRange(startDate, endDate)
    : `${formatter.format(startDate)} – ${formatter.format(endDate)}`;

  return (
    <span
      aria-label={t('stats.dateRangeLabel')}
      style={{
        ...theme.typography.body.medium,
        color: theme.colors.text.secondary,
        whiteSpace: 'nowrap',
      }}
    >
      {rangeText}
    </span>
  );
};

interface StatsPeriodSelectorProps {
  days: number;
  setDays: (days: number) => void;
}

const StatsPeriodSelector: React.FC<StatsPeriodSelectorProps> = ({ days, setDays }) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
      <StatsDateRangeLabel days={days} />
      <div style={{ display: 'flex', gap: theme.spacing.xs }}>
        {PERIOD_OPTIONS.map(option => (
          <button
            key={option}
            onClick={() => setDays(option)}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${days === option ? theme.colors.primary.main : theme.colors.border.light}`,
              backgroundColor: days === option ? theme.colors.primary.main : 'transparent',
              color: days === option ? 'white' : theme.colors.text.secondary,
              cursor: 'pointer',
              ...theme.typography.body.large,
              fontWeight: days === option ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.normal,
              transition: theme.transitions.fast,
            }}
          >
            {t('stats.periodDays', { count: option })}
          </button>
        ))}
      </div>
    </div>
  );
};

interface StatsBodyContentProps {
  stats: ProcessedEmailStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  days: number;
  setDays: (days: number) => void;
  maxEmails: number;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const StatsBodyContent: React.FC<StatsBodyContentProps> = ({
  stats,
  loading,
  error,
  refetch,
  days,
  setDays,
  maxEmails,
  t,
}) => (
  <>
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.xl }}
    >
      <h1 style={{ ...theme.typography.heading.h4, color: theme.colors.text.primary, margin: 0 }}>
        {t('stats.title')}
      </h1>
      <StatsPeriodSelector days={days} setDays={setDays} />
    </div>

    {loading && (
      <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.text.secondary }}>
        {t('common.loading')}
      </div>
    )}

    {error && (
      <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.error.main }}>
        <p>{error}</p>
        <button
          onClick={refetch}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
          }}
        >
          {t('common.retry')}
        </button>
      </div>
    )}

    {stats && !loading && (
      <>
        <div style={{ display: 'flex', gap: theme.spacing.md, marginBottom: theme.spacing.xl, flexWrap: 'wrap' }}>
          <StatCard
            label={t('stats.totalEmails')}
            value={stats.totalEmails.toLocaleString()}
            subtext={t('stats.periodDays', { count: stats.days })}
          />
          <StatCard label={t('stats.avgPerDay')} value={String(stats.avgEmailsPerDay)} />
          <StatCard label={t('stats.categories')} value={String(stats.categoryStats.length)} />
          <StatCard
            label={t('stats.avgReplyTime')}
            value={formatReplyTime(
              stats.categoryStats.reduce((sum, category) => {
                if (category.avgReplyTimeMinutes !== null) {
                  return sum + category.avgReplyTimeMinutes * category.repliedCount;
                }
                return sum;
              }, 0) /
                Math.max(
                  stats.categoryStats.reduce((sum, category) => sum + category.repliedCount, 0),
                  1
                )
            )}
          />
        </div>
        <div
          style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            padding: theme.spacing.lg,
            border: `1px solid ${theme.colors.border.light}`,
            marginBottom: theme.spacing.xl,
          }}
        >
          <h2
            style={{
              ...theme.typography.heading.h6,
              color: theme.colors.text.primary,
              marginTop: 0,
              marginBottom: theme.spacing.md,
            }}
          >
            {t('stats.emailsPerDay')}
          </h2>
          {stats.dailyCounts.length > 0 ? (
            <DailyChart dailyCounts={stats.dailyCounts} />
          ) : (
            <p style={{ color: theme.colors.text.tertiary, ...theme.typography.body.large }}>{t('stats.noData')}</p>
          )}
        </div>
        <div
          style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            padding: theme.spacing.lg,
            border: `1px solid ${theme.colors.border.light}`,
          }}
        >
          <h2
            style={{
              ...theme.typography.heading.h6,
              color: theme.colors.text.primary,
              marginTop: 0,
              marginBottom: theme.spacing.md,
            }}
          >
            {t('stats.byCategory')}
          </h2>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: `${theme.spacing.sm} 0`,
              borderBottom: `2px solid ${theme.colors.border.medium}`,
            }}
          >
            <div
              style={{
                width: '160px',
                flexShrink: 0,
                ...theme.typography.body.medium,
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.tertiary,
                textTransform: STRING_UPPERCASE,
              }}
            >
              {t('stats.categoryHeader')}
            </div>
            <div
              style={{
                flex: 1,
                ...theme.typography.body.medium,
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.tertiary,
                textTransform: STRING_UPPERCASE,
              }}
            >
              {t('stats.emailsHeader')}
            </div>
            <div
              style={{
                width: '100px',
                textAlign: 'center',
                ...theme.typography.body.medium,
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.tertiary,
                textTransform: STRING_UPPERCASE,
                flexShrink: 0,
              }}
            >
              {t('stats.avgReplyHeader')}
            </div>
            <div
              style={{
                width: '80px',
                textAlign: 'center',
                ...theme.typography.body.medium,
                fontWeight: theme.typography.fontWeight.semibold,
                color: theme.colors.text.tertiary,
                textTransform: STRING_UPPERCASE,
                flexShrink: 0,
              }}
            >
              {t('stats.repliedHeader')}
            </div>
          </div>
          {stats.categoryStats.length > 0 ? (
            stats.categoryStats.map(stat => <CategoryRow key={stat.category} stat={stat} maxEmails={maxEmails} />)
          ) : (
            <p style={{ color: theme.colors.text.tertiary, ...theme.typography.body.large, padding: theme.spacing.md }}>
              {t('stats.noData')}
            </p>
          )}
        </div>
      </>
    )}
  </>
);

const Stats: React.FC = () => {
  const { t } = useTranslation();
  const [days, setDays] = useState<number>(DAYS_IN_MONTH_30);
  const { stats, loading, error, refetch } = useEmailStats(days);

  const maxEmails = stats ? Math.max(...stats.categoryStats.map(cat => cat.totalEmails), 1) : 1;

  return (
    <SidebarPageLayout>
      <StatsBodyContent
        stats={stats}
        loading={loading}
        error={error}
        refetch={refetch}
        days={days}
        setDays={setDays}
        maxEmails={maxEmails}
        t={t}
      />
    </SidebarPageLayout>
  );
};

export default Stats;
