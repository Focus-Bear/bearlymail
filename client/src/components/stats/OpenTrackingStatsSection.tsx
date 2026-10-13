import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';
import { formatDurationMinutes } from 'utils/formatDuration';

import { StatCard } from 'components/stats/StatCard';
import { MAX_PERCENTAGE } from 'constants/numbers';
import { OPEN_TRACKING_SETTINGS_ANCHOR } from 'constants/openTracking';
import { OpenTrackingStats } from 'hooks/useEmailStats';

const SETTINGS_PATH = `/settings#${OPEN_TRACKING_SETTINGS_ANCHOR}`;

interface OpenTrackingStatsSectionProps {
  stats: OpenTrackingStats | null;
}

const sectionStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  borderRadius: theme.borderRadius.lg,
  padding: theme.spacing.lg,
  border: `1px solid ${theme.colors.border.light}`,
  marginBottom: theme.spacing.xl,
};

const noteStyle: React.CSSProperties = {
  ...theme.typography.body.medium,
  color: theme.colors.text.tertiary,
  margin: `${theme.spacing.md} 0 0`,
};

/**
 * Open-rate section of the Stats page: how many of the user's sent emails were
 * tracked, how many were opened, and how quickly — over the selected period.
 */
export const OpenTrackingStatsSection: React.FC<OpenTrackingStatsSectionProps> = ({ stats }) => {
  const { t } = useTranslation();
  const hasTrackedMail = !!stats && stats.trackedCount > 0;

  return (
    <section data-testid="open-tracking-stats" style={sectionStyle}>
      <h2 style={{ ...theme.typography.heading.h6, color: theme.colors.text.primary, margin: 0 }}>
        {t('stats.openTracking.title')}
      </h2>
      <p style={{ ...noteStyle, marginTop: theme.spacing.xs }}>{t('stats.openTracking.description')}</p>

      {hasTrackedMail ? (
        <>
          <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap', marginTop: theme.spacing.md }}>
            <StatCard
              label={t('stats.openTracking.openRate')}
              value={`${Math.round((stats.openRate ?? 0) * MAX_PERCENTAGE)}%`}
              subtext={t('stats.openTracking.openedOfTracked', {
                opened: stats.openedCount,
                count: stats.trackedCount,
              })}
            />
            <StatCard label={t('stats.openTracking.trackedSent')} value={stats.trackedCount.toLocaleString()} />
            <StatCard
              label={t('stats.openTracking.medianTimeToOpen')}
              value={formatDurationMinutes(stats.medianMinutesToFirstOpen)}
            />
            <StatCard
              label={t('stats.openTracking.maybeAutomatic')}
              value={stats.automaticOnlyCount.toLocaleString()}
              subtext={t('stats.openTracking.maybeAutomaticHint')}
            />
          </div>
          {stats.sentCount > stats.trackedCount && (
            <p style={noteStyle}>
              {t('stats.openTracking.untrackedNote', {
                count: stats.sentCount - stats.trackedCount,
                total: stats.sentCount,
              })}
            </p>
          )}
        </>
      ) : (
        <p style={noteStyle}>
          {t('stats.openTracking.empty')}{' '}
          <Link to={SETTINGS_PATH} style={{ color: theme.colors.text.secondary, textDecoration: 'underline' }}>
            {t('stats.openTracking.manageSetting')}
          </Link>
        </p>
      )}
    </section>
  );
};
