import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';

const TRACK_WIDTH_PX = 44;
const TRACK_HEIGHT_PX = 24;
const KNOB_SIZE_PX = 20;
const KNOB_INSET_PX = 2;

interface ToggleSwitchProps {
  isOn: boolean;
  onToggle: (next: boolean) => void;
  ariaLabel: string;
  isDisabled?: boolean;
  testId?: string;
}

/** Accessible on/off switch (a real button with role="switch"). */
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ isOn, onToggle, ariaLabel, isDisabled, testId }) => (
  <button
    type="button"
    role="switch"
    aria-checked={isOn}
    aria-label={ariaLabel}
    disabled={isDisabled}
    data-testid={testId}
    onClick={() => onToggle(!isOn)}
    style={{
      position: 'relative',
      flexShrink: 0,
      width: `${TRACK_WIDTH_PX}px`,
      height: `${TRACK_HEIGHT_PX}px`,
      padding: 0,
      border: 'none',
      borderRadius: `${TRACK_HEIGHT_PX / 2}px`,
      backgroundColor: isOn ? theme.colors.primary.main : theme.colors.greyscale[400],
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      opacity: isDisabled ? OPACITY_DISABLED : OPACITY_FULL,
      transition: theme.transitions.fast,
    }}
  >
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: `${KNOB_INSET_PX}px`,
        left: isOn ? `${TRACK_WIDTH_PX - KNOB_SIZE_PX - KNOB_INSET_PX}px` : `${KNOB_INSET_PX}px`,
        width: `${KNOB_SIZE_PX}px`,
        height: `${KNOB_SIZE_PX}px`,
        borderRadius: '50%',
        backgroundColor: COLOR_NAMED_WHITE,
        boxShadow: theme.shadows.md,
        transition: theme.transitions.fast,
      }}
    />
  </button>
);
