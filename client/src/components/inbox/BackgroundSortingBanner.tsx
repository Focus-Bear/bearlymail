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
  return (
    <div data-tour={TOUR_TARGETS.BACKGROUND_SORTING} style={bannerStyle} data-testid="background-sorting-banner">
      <div style={labelRowStyle}>
        <span style={titleStyle}>{t('inbox.backgroundSorting.title')}</span>
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
        style={trackStyle}
      >
        <div style={fillStyle(percent)} />
      </div>
    </div>
  );
};

const bannerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.xs,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  backgroundColor: theme.colors.primary.subtle,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.lg,
  color: theme.colors.text.secondary,
};

const labelRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  gap: theme.spacing.sm,
};

const titleStyle: React.CSSProperties = {
  color: theme.colors.text.primary,
  fontWeight: theme.typography.fontWeight.semibold,
};

const trackStyle: React.CSSProperties = {
  height: `${PROGRESS_TRACK_HEIGHT_PX}px`,
  borderRadius: theme.borderRadius.full,
  backgroundColor: theme.colors.background.paper,
  overflow: 'hidden',
};

const fillStyle = (percent: number): React.CSSProperties => ({
  width: `${percent}%`,
  height: '100%',
  backgroundColor: theme.colors.primary.main,
  transition: 'width 0.4s ease',
});
