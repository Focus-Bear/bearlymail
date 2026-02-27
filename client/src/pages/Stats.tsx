import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { STATS_PERIOD_14_DAYS, DAYS_IN_MONTH_30, MONTHS_IN_YEAR, CHART_BAR_MAX_WIDTH, CHART_BAR_HEIGHT_OFFSET, DAYS_IN_MONTH_MAX, CALENDAR_DAYS_AHEAD, MINUTES_PER_HOUR, HOURS_PER_DAY } from 'constants/numbers';
import { useAuth } from 'contexts/AuthContext';
import { Sidebar } from 'components/inbox/Sidebar';
import { useEmailStats, CategoryStats } from 'hooks/useEmailStats';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSidebarState } from 'hooks/useSidebarState';
import { EMOJI_MENU } from 'constants/emojis';

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
  <div style={{
    backgroundColor: theme.colors.background.paper,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    border: `1px solid ${theme.colors.border.light}`,
    textAlign: 'center',
    flex: '1 1 180px',
  }}>
    <div style={{
      ...theme.typography.heading.h3,
      color: theme.colors.primary.main,
    }}>
      {value}
    </div>
    <div style={{
      ...theme.typography.body.large,
      color: theme.colors.text.secondary,
      marginTop: theme.spacing.xs,
    }}>
      {label}
    </div>
    {subtext && (
      <div style={{
        ...theme.typography.body.medium,
        color: theme.colors.text.tertiary,
        marginTop: theme.spacing.xs,
      }}>
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
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing.md,
      padding: `${theme.spacing.sm} 0`,
      borderBottom: `1px solid ${theme.colors.border.light}`,
    }}>
      <div style={{
        width: '160px',
        flexShrink: 0,
        fontWeight: theme.typography.fontWeight.medium,
        color: theme.colors.text.primary,
        ...theme.typography.body.large,
      }}>
        {stat.category}
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <div style={{
          flex: 1,
          height: '20px',
          backgroundColor: theme.colors.greyscale[300],
          borderRadius: theme.borderRadius.full,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${barWidth}%`,
            height: '100%',
            backgroundColor: theme.colors.primary.main,
            borderRadius: theme.borderRadius.full,
            transition: theme.transitions.default,
          }} />
        </div>
        <span style={{
          width: '50px',
          textAlign: 'right',
          ...theme.typography.body.large,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          flexShrink: 0,
        }}>
          {stat.totalEmails}
        </span>
      </div>

      <div style={{
        width: '100px',
        textAlign: 'center',
        ...theme.typography.body.large,
        color: theme.colors.text.secondary,
        flexShrink: 0,
      }}>
        {stat.avgReplyTimeMinutes !== null
          ? formatReplyTime(stat.avgReplyTimeMinutes)
          : t('stats.noReplyData')}
      </div>

      <div style={{
        width: '80px',
        textAlign: 'center',
        ...theme.typography.body.large,
        color: theme.colors.text.tertiary,
        flexShrink: 0,
      }}>
        {stat.repliedCount}
      </div>
    </div>
  );
};

const DailyChart: React.FC<{
  dailyCounts: Array<{ date: string; total: number }>;
}> = ({ dailyCounts }) => {
  const maxCount = Math.max(...dailyCounts.map(d => d.total), 1);
  const CHART_HEIGHT = 160;
  const BAR_GAP = 2;
  const barWidth = dailyCounts.length > 0
    ? Math.max(2, Math.min(MONTHS_IN_YEAR, Math.floor(CHART_BAR_MAX_WIDTH / dailyCounts.length) - BAR_GAP))
    : 8;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: `${BAR_GAP}px`,
      height: `${CHART_HEIGHT}px`,
      overflowX: 'auto',
      paddingBottom: theme.spacing.md,
    }}>
      {dailyCounts.map(day => {
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
            }}
          >
            <div style={{
              width: `${barWidth}px`,
              height: `${barHeight}px`,
              backgroundColor: theme.colors.primary.main,
              borderRadius: `${theme.borderRadius.sm} ${theme.borderRadius.sm} 0 0`,
              transition: theme.transitions.default,
            }} />
            {dailyCounts.length <= DAYS_IN_MONTH_MAX && (
              <span style={{
                ...theme.typography.body.small,
                color: theme.colors.text.tertiary,
                marginTop: '2px',
                whiteSpace: 'nowrap',
              }}>
                {label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

const Stats: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [days, setDays] = useState<number>(DAYS_IN_MONTH_30);
  const { stats, loading, error, refetch } = useEmailStats(days);
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;
  const {
    isCollapsed,
    isMobileMenuOpen,
    toggleCollapse,
    openMobileMenu,
    closeMobileMenu,
  } = useSidebarState();

  const maxEmails = stats
    ? Math.max(...stats.categoryStats.map(c => c.totalEmails), 1)
    : 1;

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
      overflow: 'hidden',
    }}>
      <Sidebar
        user={user}
        logout={logout}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={closeMobileMenu}
      />

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: isNarrow ? `70px ${theme.spacing.sm} ${theme.spacing.md}` : theme.spacing.xl,
      }}>
        {isNarrow && (
          <button
            onClick={openMobileMenu}
            style={{
              position: 'fixed',
              top: theme.spacing.md,
              left: theme.spacing.md,
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: `1px solid ${theme.colors.border.medium}`,
              backgroundColor: theme.colors.background.paper,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              transition: theme.transitions.fast,
              boxShadow: theme.shadows.md,
              zIndex: 100,
            }}
            aria-label="Open navigation menu"
          >
            {EMOJI_MENU}
          </button>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.xl,
        }}>
          <h1 style={{
            ...theme.typography.heading.h4,
            color: theme.colors.text.primary,
            margin: 0,
          }}>
            {t('stats.title')}
          </h1>

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

        {loading && (
          <div style={{
            textAlign: 'center',
            padding: theme.spacing.xl,
            color: theme.colors.text.secondary,
          }}>
            {t('common.loading')}
          </div>
        )}

        {error && (
          <div style={{
            textAlign: 'center',
            padding: theme.spacing.xl,
            color: theme.colors.error.main,
          }}>
            <p>{error}</p>
            <button
              onClick={refetch}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.primary.main,
                color: 'white',
                border: 'none',
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
            {/* Summary Cards */}
            <div style={{
              display: 'flex',
              gap: theme.spacing.md,
              marginBottom: theme.spacing.xl,
              flexWrap: 'wrap',
            }}>
              <StatCard
                label={t('stats.totalEmails')}
                value={stats.totalEmails.toLocaleString()}
                subtext={t('stats.periodDays', { count: stats.days })}
              />
              <StatCard
                label={t('stats.avgPerDay')}
                value={String(stats.avgEmailsPerDay)}
              />
              <StatCard
                label={t('stats.categories')}
                value={String(stats.categoryStats.length)}
              />
              <StatCard
                label={t('stats.avgReplyTime')}
                value={formatReplyTime(
                  stats.categoryStats.reduce((sum, c) => {
                    if (c.avgReplyTimeMinutes !== null) {
                      return sum + c.avgReplyTimeMinutes * c.repliedCount;
                    }
                    return sum;
                  }, 0) / Math.max(stats.categoryStats.reduce((sum, c) => sum + c.repliedCount, 0), 1),
                )}
              />
            </div>

            {/* Emails Per Day Chart */}
            <div style={{
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.lg,
              padding: theme.spacing.lg,
              border: `1px solid ${theme.colors.border.light}`,
              marginBottom: theme.spacing.xl,
            }}>
              <h2 style={{
                ...theme.typography.heading.h6,
                color: theme.colors.text.primary,
                marginTop: 0,
                marginBottom: theme.spacing.md,
              }}>
                {t('stats.emailsPerDay')}
              </h2>
              {stats.dailyCounts.length > 0 ? (
                <DailyChart dailyCounts={stats.dailyCounts} />
              ) : (
                <p style={{ color: theme.colors.text.tertiary, ...theme.typography.body.large }}>
                  {t('stats.noData')}
                </p>
              )}
            </div>

            {/* Category Breakdown */}
            <div style={{
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.lg,
              padding: theme.spacing.lg,
              border: `1px solid ${theme.colors.border.light}`,
            }}>
              <h2 style={{
                ...theme.typography.heading.h6,
                color: theme.colors.text.primary,
                marginTop: 0,
                marginBottom: theme.spacing.md,
              }}>
                {t('stats.byCategory')}
              </h2>

              {/* Header Row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.md,
                padding: `${theme.spacing.sm} 0`,
                borderBottom: `2px solid ${theme.colors.border.medium}`,
              }}>
                <div style={{
                  width: '160px',
                  flexShrink: 0,
                  ...theme.typography.body.medium,
                  fontWeight: theme.typography.fontWeight.semibold,
                  color: theme.colors.text.tertiary,
                  textTransform: 'uppercase' as const,
                }}>
                  {t('stats.categoryHeader')}
                </div>
                <div style={{
                  flex: 1,
                  ...theme.typography.body.medium,
                  fontWeight: theme.typography.fontWeight.semibold,
                  color: theme.colors.text.tertiary,
                  textTransform: 'uppercase' as const,
                }}>
                  {t('stats.emailsHeader')}
                </div>
                <div style={{
                  width: '100px',
                  textAlign: 'center',
                  ...theme.typography.body.medium,
                  fontWeight: theme.typography.fontWeight.semibold,
                  color: theme.colors.text.tertiary,
                  textTransform: 'uppercase' as const,
                  flexShrink: 0,
                }}>
                  {t('stats.avgReplyHeader')}
                </div>
                <div style={{
                  width: '80px',
                  textAlign: 'center',
                  ...theme.typography.body.medium,
                  fontWeight: theme.typography.fontWeight.semibold,
                  color: theme.colors.text.tertiary,
                  textTransform: 'uppercase' as const,
                  flexShrink: 0,
                }}>
                  {t('stats.repliedHeader')}
                </div>
              </div>

              {stats.categoryStats.length > 0 ? (
                stats.categoryStats.map(stat => (
                  <CategoryRow key={stat.category} stat={stat} maxEmails={maxEmails} />
                ))
              ) : (
                <p style={{ color: theme.colors.text.tertiary, ...theme.typography.body.large, padding: theme.spacing.md }}>
                  {t('stats.noData')}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Stats;
