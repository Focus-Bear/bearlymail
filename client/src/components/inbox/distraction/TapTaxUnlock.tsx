import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { DISTRACTION_TAP_MILESTONES, DISTRACTION_TAP_TARGET } from 'constants/distractionFriction';

interface TapTaxUnlockProps {
  /** Called once the user completes the full tap tax. */
  onUnlocked: () => void;
}

/**
 * Resolve the highest milestone whose threshold the current tap count has reached.
 */
function currentMilestone(taps: number): (typeof DISTRACTION_TAP_MILESTONES)[number] {
  let milestone = DISTRACTION_TAP_MILESTONES[0];
  for (const candidate of DISTRACTION_TAP_MILESTONES) {
    if (taps >= candidate.at) {
      milestone = candidate;
    }
  }
  return milestone;
}

/**
 * The "30-tap tax": the user must tap a button 30 times in a row to unlock
 * lower-priority emails. Pure client-side — no network. Shows a live counter and
 * playful, changing feedback as the count climbs.
 */
export const TapTaxUnlock: React.FC<TapTaxUnlockProps> = ({ onUnlocked }) => {
  const { t } = useTranslation();
  const [taps, setTaps] = useState(0);

  const remaining = Math.max(0, DISTRACTION_TAP_TARGET - taps);
  const milestone = useMemo(() => currentMilestone(taps), [taps]);
  const progressPct = Math.min(100, (taps / DISTRACTION_TAP_TARGET) * 100);

  const handleTap = () => {
    // Keep the side effect out of the state updater (React anti-pattern): the
    // updater must stay pure, so fire onUnlocked from the handler instead.
    setTaps(prev => prev + 1);
    if (taps + 1 >= DISTRACTION_TAP_TARGET) {
      onUnlocked();
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ margin: 0, marginBottom: theme.spacing.sm, color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
        {t('inbox.distractionTax.tap.instructions', { count: DISTRACTION_TAP_TARGET })}
      </p>

      <div style={{ fontSize: '2.5rem', marginBottom: theme.spacing.xs }} aria-hidden="true">
        {milestone.emoji}
      </div>
      <p
        aria-live="polite"
        style={{
          margin: 0,
          marginBottom: theme.spacing.md,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}
      >
        {t(`inbox.distractionTax.tapMilestone.${milestone.messageKey}`)}
      </p>

      <div
        style={{
          height: 8,
          borderRadius: theme.borderRadius.full,
          background: theme.colors.border.light,
          overflow: 'hidden',
          marginBottom: theme.spacing.md,
        }}
      >
        <div
          style={{
            width: `${progressPct}%`,
            height: '100%',
            background: theme.colors.primary.main,
            transition: theme.transitions.default,
          }}
        />
      </div>

      <button
        type="button"
        onClick={handleTap}
        data-testid="distraction-tap-button"
        style={{
          width: '100%',
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          borderRadius: theme.borderRadius.md,
          border: 'none',
          background: theme.colors.primary.main,
          color: theme.colors.text.inverse,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.md,
          fontWeight: theme.typography.fontWeight.bold,
        }}
      >
        {t('inbox.distractionTax.tap.button', { count: remaining })}
      </button>

      <p
        data-testid="distraction-tap-counter"
        style={{ margin: 0, marginTop: theme.spacing.sm, color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}
      >
        {t('inbox.distractionTax.tap.counter', { taps, total: DISTRACTION_TAP_TARGET })}
      </p>
    </div>
  );
};
