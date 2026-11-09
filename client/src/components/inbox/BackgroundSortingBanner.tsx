import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { TOUR_TARGETS } from 'constants/tour';
import { useBackgroundSortingProgress } from 'hooks/useBackgroundSortingProgress';

const PERCENT_MAX = 100;
const PROGRESS_TRACK_HEIGHT_PX = 6;

function toPercent(categorised: number, total: number): number {
  if (total <= 0) {
    return PERCENT_MAX;
  }
  return Math.min(PERCENT_MAX, Math.round((categorised / total) * PERCENT_MAX));
}

/**
 * Shows the inbox sort onboarding left running in the background (Continue
 * unlocks after the newest emails are sorted), so emails moving between
 * categories reads as progress rather than a glitch. Hides itself when done.
 */
export const BackgroundSortingBanner: React.FC = () => {
  const { t } = useTranslation();
  const progress = useBackgroundSortingProgress();
  if (!progress) {
    return null;
  }
  const percent = toPercent(progress.categorised, progress.total);
  const styles = buildStyles();
  return (
    <div data-tour={TOUR_TARGETS.BACKGROUND_SORTING} style={styles.banner} data-testid="background-sorting-banner">
      <div style={styles.labelRow}>
        <span style={styles.title}>{t('inbox.backgroundSorting.title')}</span>
        <span>
          {t('inbox.backgroundSorting.progress', { categorised: progress.categorised, total: progress.total })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t('inbox.backgroundSorting.title')}
        aria-valuemin={0}
        aria-valuemax={PERCENT_MAX}
        aria-valuenow={percent}
        style={styles.track}
      >
        <div style={fillStyle(percent)} />
      </div>
    </div>
  );
};

/**
 * Built at render rather than import: the banner sits inside InboxContentParts,
 * whose tests mock a partial theme, and reading it at import time would break them.
 */
function buildStyles(): Record<'banner' | 'labelRow' | 'title' | 'track', React.CSSProperties> {
  return {
    banner: {
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.xs,
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      backgroundColor: theme.colors.primary.subtle,
      borderRadius: theme.borderRadius.md,
      fontSize: theme.typography.fontSize.lg,
      color: theme.colors.text.secondary,
    },
    labelRow: {
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    title: {
      color: theme.colors.text.primary,
      fontWeight: theme.typography.fontWeight.semibold,
    },
    track: {
      height: `${PROGRESS_TRACK_HEIGHT_PX}px`,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.background.paper,
      overflow: 'hidden',
    },
  };
}

const fillStyle = (percent: number): React.CSSProperties => ({
  width: `${percent}%`,
  height: '100%',
  backgroundColor: theme.colors.primary.main,
  transition: 'width 0.4s ease',
});
