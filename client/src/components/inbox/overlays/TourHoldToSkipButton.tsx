import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MS_PER_SECOND } from 'constants/numbers';
import { KEY_ENTER, KEY_SPACE } from 'constants/strings';
import { TOUR_HOLD_TO_SKIP_ATTRIBUTE, TOUR_SKIP_HOLD_DURATION_MS } from 'constants/tour';
import { HOLD_PROGRESS_TICK_MS, useHoldToConfirm } from 'hooks/useHoldToConfirm';
import { usePrefersReducedMotion } from 'hooks/usePrefersReducedMotion';

const PERCENT = 100;
const HOLD_KEYS = new Set<string>([KEY_SPACE, KEY_ENTER]);

interface TourHoldToSkipButtonProps {
  onSkip: () => void;
  /** Id of the "we recommend the tour" message, read with the button. */
  describedById: string;
  durationMs?: number;
}

function secondsRemaining(progress: number, durationMs: number): number {
  return Math.ceil(((1 - progress) * durationMs) / MS_PER_SECOND);
}

/**
 * Tracks whether the last hold ended before it completed, so the live region
 * can tell a screen-reader user that letting go cancelled the skip.
 */
function useReleasedEarly(isHolding: boolean): boolean {
  const [wasHolding, setWasHolding] = useState(isHolding);
  const [isReleasedEarly, setIsReleasedEarly] = useState(false);
  if (isHolding !== wasHolding) {
    setWasHolding(isHolding);
    // A completed hold unmounts the tour, so any hold that ends while this is
    // still mounted was released early.
    setIsReleasedEarly(!isHolding);
  }
  return isReleasedEarly;
}

/**
 * Skips the onboarding tour only after a press-and-hold (pointer, or Space /
 * Enter held for keyboard users). The fill shows progress (dropped under
 * reduced motion, where the countdown text alone carries it), and the
 * countdown sits in a polite live region so screen-reader users hear it.
 * Releasing early cancels and resets.
 */
export const TourHoldToSkipButton: React.FC<TourHoldToSkipButtonProps> = ({
  onSkip,
  describedById,
  durationMs = TOUR_SKIP_HOLD_DURATION_MS,
}) => {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const { progress, isHolding, holdHandlers } = useHoldToConfirm({ onConfirm: onSkip, durationMs });
  const isReleasedEarly = useReleasedEarly(isHolding);
  const totalSeconds = Math.round(durationMs / MS_PER_SECOND);
  const percent = Math.round(progress * PERCENT);

  // The prompt opens from a click (or Esc), so hand focus to the control the
  // user now has to hold — keyboard users can hold Space/Enter straight away.
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (HOLD_KEYS.has(event.key)) {
      // Keep the hold keys away from the inbox shortcuts underneath the tour.
      event.stopPropagation();
    }
    holdHandlers.onKeyDown(event);
  };

  const status = buildStatus(isHolding, isReleasedEarly, progress, durationMs, t);

  return (
    <div style={wrapStyle}>
      <button
        ref={buttonRef}
        type="button"
        {...{ [TOUR_HOLD_TO_SKIP_ATTRIBUTE]: true }}
        aria-label={t('onboarding.tourSkipPrompt.ariaLabel', { count: totalSeconds })}
        aria-describedby={describedById}
        data-holding={isHolding}
        style={buttonStyle(isHolding)}
        {...holdHandlers}
        onKeyDown={handleKeyDown}
      >
        {!prefersReducedMotion && <span aria-hidden data-testid="tour-skip-hold-fill" style={fillStyle(percent)} />}
        <span style={labelStyle}>{t('onboarding.tourSkipPrompt.holdButton')}</span>
      </button>
      <div
        role="progressbar"
        aria-label={t('onboarding.tourSkipPrompt.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={PERCENT}
        aria-valuenow={percent}
        style={visuallyHiddenStyle}
      />
      <p role="status" aria-live="polite" style={statusStyle(isHolding)}>
        {status}
      </p>
    </div>
  );
};

function buildStatus(
  isHolding: boolean,
  isReleasedEarly: boolean,
  progress: number,
  durationMs: number,
  translate: (key: string, options?: Record<string, unknown>) => string
): string {
  if (isHolding) {
    return translate('onboarding.tourSkipPrompt.keepHolding', { count: secondsRemaining(progress, durationMs) });
  }
  if (isReleasedEarly) {
    return translate('onboarding.tourSkipPrompt.releasedEarly');
  }
  return '';
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: theme.spacing.xs,
};

const buttonStyle = (isHolding: boolean): React.CSSProperties => ({
  position: 'relative',
  overflow: 'hidden',
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  backgroundColor: theme.colors.background.paper,
  color: theme.colors.text.primary,
  border: `1px solid ${isHolding ? theme.colors.primary.main : theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontWeight: theme.typography.fontWeight.semibold,
  cursor: 'pointer',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
});

const fillStyle = (percent: number): React.CSSProperties => ({
  position: 'absolute',
  inset: 0,
  width: `${percent}%`,
  backgroundColor: theme.colors.primary.light,
  transition: percent === 0 ? 'none' : `width ${HOLD_PROGRESS_TICK_MS}ms linear`,
  pointerEvents: 'none',
});

const labelStyle: React.CSSProperties = { position: 'relative' };

const statusStyle = (isHolding: boolean): React.CSSProperties => ({
  margin: 0,
  minHeight: '1.2em',
  fontSize: theme.typography.fontSize.sm,
  textAlign: 'center',
  color: isHolding ? theme.colors.primary.dark : theme.colors.text.tertiary,
  fontVariantNumeric: 'tabular-nums',
});

const visuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
