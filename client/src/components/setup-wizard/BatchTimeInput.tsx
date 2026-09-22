import React, { useState } from 'react';

import { ONBOARDING_TOKENS as TOK } from './onboarding-tokens';

/**
 * A batch delivery-time picker built from three native `<select>` controls
 * (hour, minute, AM/PM) instead of `<input type="time">`.
 *
 * Safari renders the native time input WITHOUT a clickable AM/PM stepper, so
 * the meridiem could only be changed with the keyboard — a visible control was
 * missing entirely (issue #295). Native selects give a visible, mouse- and
 * keyboard-accessible dropdown on every browser.
 *
 * The value is exchanged as a 24-hour `"HH:MM"` string so the parent (and the
 * batch-schedule API) are unchanged.
 */

const NOON_HOUR = 12;
const HOUR_WRAP_OFFSET = 11;
const TIME_PART_PAD = 2;
const MINUTE_STEP = 5;
const MINUTES_IN_HOUR = 60;

export type Meridiem = 'AM' | 'PM';

const MERIDIEM_AM: Meridiem = 'AM';
const MERIDIEM_PM: Meridiem = 'PM';

export interface TimeParts {
  hour12: number;
  minute: number;
  meridiem: Meridiem;
}

/** Parses a 24-hour `"HH:MM"` string into 12-hour display parts; invalid input falls back to 12:00 AM. */
export function parseTimeParts(value: string): TimeParts {
  const [hhStr, mmStr] = (value ?? '').split(':');
  const hour24 = Number(hhStr);
  const minute = Number(mmStr);
  if (isNaN(hour24) || isNaN(minute)) {
    return { hour12: NOON_HOUR, minute: 0, meridiem: MERIDIEM_AM };
  }
  return {
    hour12: ((hour24 + HOUR_WRAP_OFFSET) % NOON_HOUR) + 1,
    minute,
    meridiem: hour24 >= NOON_HOUR ? MERIDIEM_PM : MERIDIEM_AM,
  };
}

/** Rebuilds a zero-padded 24-hour `"HH:MM"` string from 12-hour display parts. */
export function buildTimeValue({ hour12, minute, meridiem }: TimeParts): string {
  const base = hour12 % NOON_HOUR;
  const hour24 = meridiem === MERIDIEM_PM ? base + NOON_HOUR : base;
  return `${String(hour24).padStart(TIME_PART_PAD, '0')}:${String(minute).padStart(TIME_PART_PAD, '0')}`;
}

const HOUR_OPTIONS = Array.from({ length: NOON_HOUR }, (_unused, idx) => idx + 1);

/** 5-minute steps, but always include the current minute so an existing value is never silently rounded. */
function minuteOptions(current: number): number[] {
  const steps: number[] = [];
  for (let minute = 0; minute < MINUTES_IN_HOUR; minute += MINUTE_STEP) {
    steps.push(minute);
  }
  if (!steps.includes(current)) {
    steps.push(current);
    steps.sort((first, second) => first - second);
  }
  return steps;
}

interface BatchTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  hourLabel: string;
  minuteLabel: string;
  meridiemLabel: string;
}

export const BatchTimeInput: React.FC<BatchTimeInputProps> = ({
  value,
  onChange,
  hourLabel,
  minuteLabel,
  meridiemLabel,
}) => {
  const [focused, setFocused] = useState(false);
  const parts = parseTimeParts(value);

  const emit = (next: Partial<TimeParts>): void => {
    onChange(buildTimeValue({ ...parts, ...next }));
  };

  const selectStyle = focused ? selectFocusStyle : baseSelectStyle;

  return (
    <div
      style={wrapStyle}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <select
        value={parts.hour12}
        onChange={event => emit({ hour12: Number(event.target.value) })}
        style={selectStyle}
        aria-label={hourLabel}
      >
        {HOUR_OPTIONS.map(hour => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </select>
      <span style={colonStyle}>:</span>
      <select
        value={parts.minute}
        onChange={event => emit({ minute: Number(event.target.value) })}
        style={selectStyle}
        aria-label={minuteLabel}
      >
        {minuteOptions(parts.minute).map(minute => (
          <option key={minute} value={minute}>
            {String(minute).padStart(TIME_PART_PAD, '0')}
          </option>
        ))}
      </select>
      <select
        value={parts.meridiem}
        onChange={event => emit({ meridiem: event.target.value as Meridiem })}
        style={selectStyle}
        aria-label={meridiemLabel}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
};

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};

// Every segment shows at most two characters (12 / 55 / PM), so a single fixed
// width keeps the three dropdowns identical instead of the hour box growing
// wider for 10/11/12 (issue #295 follow-up).
const SELECT_WIDTH = '58px';

const baseSelectStyle: React.CSSProperties = {
  appearance: 'auto',
  width: SELECT_WIDTH,
  boxSizing: 'border-box',
  textAlign: 'center',
  textAlignLast: 'center',
  border: `1px solid ${TOK.line2}`,
  outline: 0,
  background: TOK.cream,
  font: 'inherit',
  fontSize: '14px',
  fontWeight: 600,
  color: TOK.ink,
  padding: '8px 6px',
  borderRadius: '8px',
  fontFamily: TOK.fontMono,
  cursor: 'pointer',
  transition: 'background 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
};

const selectFocusStyle: React.CSSProperties = {
  ...baseSelectStyle,
  background: '#FFFFFF',
  border: `1px solid ${TOK.sun}`,
  boxShadow: `0 0 0 3px ${TOK.sunPale}`,
};

const colonStyle: React.CSSProperties = {
  fontFamily: TOK.fontMono,
  fontWeight: 600,
  color: TOK.ink3,
};
