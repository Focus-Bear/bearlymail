import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { ONBOARDING_TOKENS as TOK } from 'components/setup-wizard/onboarding-tokens';
import { MS_PER_SECOND } from 'constants/numbers';
import { HOLD_PROGRESS_TICK_MS, HOLD_TO_CONFIRM_DEFAULT_MS, useHoldToConfirm } from 'hooks/useHoldToConfirm';
import { usePrefersReducedMotion } from 'hooks/usePrefersReducedMotion';

const PERCENT = 100;
const WEIGHT_REGULAR = 400;
const WEIGHT_SEMIBOLD = 600;

interface PermissionsHoldButtonProps {
  label: string;
  onConfirm: () => void;
  durationMs?: number;
}

function secondsRemaining(progress: number, durationMs: number): number {
  return Math.ceil(((1 - progress) * durationMs) / MS_PER_SECOND);
}

/**
 * The permissions screen's continue control: the user must press and hold
 * (pointer, or Space/Enter) for the full duration before we redirect to the
 * provider's consent screen. The pause is the point — people were clicking
 * straight past the explanation. With reduced motion the fill is dropped and
 * the countdown text alone shows progress.
 */
export const PermissionsHoldButton: React.FC<PermissionsHoldButtonProps> = ({
  label,
  onConfirm,
  durationMs = HOLD_TO_CONFIRM_DEFAULT_MS,
}) => {
  const { t } = useTranslation();
  const hintId = useId();
  const prefersReducedMotion = usePrefersReducedMotion();
  const { progress, isHolding, holdHandlers } = useHoldToConfirm({ onConfirm, durationMs });
  const totalSeconds = Math.round(durationMs / MS_PER_SECOND);
  const percent = Math.round(progress * PERCENT);
  const hint = isHolding
    ? t('auth.permissions.hold.keepHolding', { count: secondsRemaining(progress, durationMs) })
    : t('auth.permissions.hold.hint', { count: totalSeconds });

  return (
    <div style={wrapStyle}>
      <button
        type="button"
        className="permissions-hold-button"
        aria-label={t('auth.permissions.hold.ariaLabel', { label, count: totalSeconds })}
        aria-describedby={hintId}
        data-holding={isHolding}
        style={buttonStyle(isHolding)}
        {...holdHandlers}
      >
        {!prefersReducedMotion && <span aria-hidden data-testid="hold-fill" style={fillStyle(percent)} />}
        <span style={labelStyle}>{label}</span>
      </button>
      <div
        role="progressbar"
        aria-label={t('auth.permissions.hold.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={PERCENT}
        aria-valuenow={percent}
        style={visuallyHiddenStyle}
      />
      <p id={hintId} role="status" aria-live="polite" style={hintStyle(isHolding)}>
        {hint}
      </p>
    </div>
  );
};

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: '8px',
  minWidth: '240px',
};

const buttonStyle = (isHolding: boolean): React.CSSProperties => ({
  position: 'relative',
  overflow: 'hidden',
  height: '52px',
  padding: '0 24px',
  borderRadius: '12px',
  border: `1.5px solid ${TOK.sun}`,
  background: TOK.sun,
  color: '#fff',
  fontSize: '15px',
  fontWeight: WEIGHT_SEMIBOLD,
  cursor: 'pointer',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  boxShadow: isHolding ? `0 0 0 4px ${TOK.sunPale}` : 'inset 0 -1px 0 rgba(0,0,0,.12)',
  transition: 'box-shadow .15s ease',
});

const fillStyle = (percent: number): React.CSSProperties => ({
  position: 'absolute',
  inset: 0,
  width: `${percent}%`,
  background: TOK.sunDark,
  transition: percent === 0 ? 'none' : `width ${HOLD_PROGRESS_TICK_MS}ms linear`,
  pointerEvents: 'none',
});

const labelStyle: React.CSSProperties = { position: 'relative' };

const hintStyle = (isHolding: boolean): React.CSSProperties => ({
  margin: 0,
  fontSize: '12.5px',
  textAlign: 'center',
  color: isHolding ? TOK.sunDark : TOK.ink3,
  fontWeight: isHolding ? WEIGHT_SEMIBOLD : WEIGHT_REGULAR,
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
