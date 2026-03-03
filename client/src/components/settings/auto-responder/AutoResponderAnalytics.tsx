import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { AutoResponderAnalytics as AnalyticsData } from './types';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface AutoResponderAnalyticsProps {
  analytics: AnalyticsData | null;
  onRefresh: () => void;
}

export const AutoResponderAnalytics: React.FC<AutoResponderAnalyticsProps> = ({
  analytics,
  onRefresh,
}) => {
  const { t } = useTranslation();

  if (!analytics) {
    return (
      <div style={{
        marginTop: theme.spacing.lg,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.xl,
        textAlign: 'center',
      }}>
        <p style={{
          ...theme.typography.body.large,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.md,
        }}>
          {t('settings.autoResponder.analytics.noData')}
        </p>
        <button
          onClick={onRefresh}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            ...theme.typography.body.large,
          }}
        >
          {t('settings.autoResponder.analytics.loadAnalytics')}
        </button>
      </div>
    );
  }

  const { totalSent, byPriority, qaAnswerRate, escalationRate, templateBreakdown } = analytics;

  return (
    <div style={{
      marginTop: theme.spacing.lg,
      backgroundColor: theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.md,
      }}>
          <h3 style={{
            ...theme.typography.heading.h6,
            color: theme.colors.text.primary,
            margin: 0,
          }}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            📊 {t('settings.autoResponder.analytics.title')}
          </h3>
          <button
            onClick={onRefresh}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: theme.colors.primary.main,
              border: `1px solid ${theme.colors.primary.main}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              ...theme.typography.body.medium,
            }}
          >
            {t('settings.autoResponder.analytics.refresh')}
          </button>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.lg,
      }}>
        <StatCard
          label="Total Sent"
          value={totalSent.toString()}
          emoji="📤"
        />
        <StatCard
          label="Q&A Answer Rate"
          value={`${Math.round(qaAnswerRate * 100)}%`}
          emoji="🧠"
          subtext="of responses included AI answers"
        />
        <StatCard
          label="Escalation Rate"
          value={`${Math.round(escalationRate * 100)}%`}
          emoji="⚡"
          subtext="of senders requested priority bump"
        />
      </div>

      {/* Priority Breakdown */}
      <div style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        border: `1px solid ${theme.colors.border.light}`,
        marginBottom: theme.spacing.md,
      }}>
        <h4 style={{
          ...theme.typography.body.xLarge,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginTop: 0,
          marginBottom: theme.spacing.md,
        }}>
          {t('settings.autoResponder.analytics.responsesByPriority')}
        </h4>
        <div style={{ display: 'flex', gap: theme.spacing.lg }}>
          <PriorityBar label="High" count={byPriority.high} total={totalSent} color="#EF4444" />
          <PriorityBar label="Medium" count={byPriority.medium} total={totalSent} color={theme.colors.primary.main} />
          <PriorityBar label="Low" count={byPriority.low} total={totalSent} color={theme.colors.greyscale[400]} />
        </div>
      </div>

      {/* Template Usage */}
      {Object.keys(templateBreakdown).length > 0 && (
        <div style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.md,
          border: `1px solid ${theme.colors.border.light}`,
        }}>
          <h4 style={{
            ...theme.typography.body.xLarge,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
            marginTop: 0,
            marginBottom: theme.spacing.md,
          }}>
            {t('settings.autoResponder.analytics.templateUsage')}
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {Object.entries(templateBreakdown).map(([template, count]) => (
              <div
                key={template}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  backgroundColor: theme.colors.background.subtle,
                  borderRadius: theme.borderRadius.sm,
                  ...theme.typography.body.large,
                  color: theme.colors.text.secondary,
                }}
              >
                {template}: <strong>{count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string;
  emoji: string;
  subtext?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, emoji, subtext }) => (
  <div style={{
    backgroundColor: theme.colors.background.paper,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    border: `1px solid ${theme.colors.border.light}`,
    textAlign: 'center',
  }}>
    <div style={{ fontSize: '1.5rem', marginBottom: theme.spacing.xs }}>{emoji}</div>
    <div style={{
      ...theme.typography.heading.h4,
      color: theme.colors.text.primary,
    }}>
      {value}
    </div>
    <div style={{
      ...theme.typography.body.medium,
      color: theme.colors.text.secondary,
    }}>
      {label}
    </div>
    {subtext && (
      <div style={{
        ...theme.typography.body.small,
        color: theme.colors.text.tertiary,
        marginTop: theme.spacing.xs,
      }}>
        {subtext}
      </div>
    )}
  </div>
);

interface PriorityBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

const PriorityBar: React.FC<PriorityBarProps> = ({ label, count, total, color }) => {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div style={{ flex: 1 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.xs,
      }}>
        <span style={{
          ...theme.typography.body.large,
          color: theme.colors.text.secondary,
        }}>
          {label}
        </span>
        <span style={{
          ...theme.typography.body.large,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}>
          {count}
        </span>
      </div>
      <div style={{
        height: '8px',
        backgroundColor: theme.colors.greyscale[300],
        borderRadius: theme.borderRadius.full,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${percentage}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: theme.borderRadius.full,
          transition: theme.transitions.default,
        }} />
      </div>
    </div>
  );
};
