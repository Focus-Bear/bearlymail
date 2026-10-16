import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';
import { HOLD_PROGRESS_TICK_MS, HOLD_TO_CONFIRM_DEFAULT_MS, useHoldToConfirm } from 'hooks/useHoldToConfirm';

interface HoldToConfirmButtonProps {
  label: string;
  /** Shown in a small bubble under the button for the duration of the hold. */
  holdMessage: string;
  onConfirm: () => void;
  durationMs?: number;
  disabled?: boolean;
}

const BUTTON_BASE_STYLE: React.CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
  border: STRING_NONE,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
  minWidth: '160px',
  touchAction: 'none',
  userSelect: 'none',
};

const HOLD_MESSAGE_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: theme.spacing.xs,
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.sm,
  boxShadow: theme.shadows.md,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.primary,
  whiteSpace: 'nowrap',
  zIndex: 20,
};

/**
 * A press-and-hold confirmation button: the user must keep the button pressed
 * (pointer or Space/Enter) for `durationMs` before `onConfirm` fires. Releasing
 * early cancels. Used as a deliberate-friction escape hatch, e.g. "send anyway"
 * after a failed tone check.
 */
export const HoldToConfirmButton: React.FC<HoldToConfirmButtonProps> = ({
  label,
  holdMessage,
  onConfirm,
  durationMs = HOLD_TO_CONFIRM_DEFAULT_MS,
  disabled = false,
}) => {
  const { progress, isHolding, holdHandlers } = useHoldToConfirm({ onConfirm, durationMs, disabled });

  const accentColor = theme.colors.accent.warning ?? theme.colors.primary.main;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        {...holdHandlers}
        disabled={disabled}
        aria-label={label}
        style={{
          ...BUTTON_BASE_STYLE,
          backgroundColor: disabled ? theme.colors.background.subtle : accentColor,
          color: disabled ? theme.colors.text.tertiary : COLOR_NAMED_WHITE,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: `${progress * 100}%`,
            backgroundColor: 'rgba(255, 255, 255, 0.35)',
            transition: isHolding ? `width ${HOLD_PROGRESS_TICK_MS}ms linear` : 'none',
            pointerEvents: 'none',
          }}
        />
        <span style={{ position: 'relative' }}>{label}</span>
      </button>
      {isHolding && (
        <div role="status" style={HOLD_MESSAGE_STYLE}>
          {holdMessage}
        </div>
      )}
    </div>
  );
};
