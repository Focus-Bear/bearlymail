import React, { useState } from 'react';

import { ONBOARDING_TOKENS as TOK } from './onboarding-tokens';

/**
 * A batch delivery-time picker built from two native `<select>` controls — a
 * single hour:minute dropdown in 30-minute steps, plus AM/PM — instead of
 * `<input type="time">`.
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
const MINUTE_STEP = 30;
const HALF_HOUR_MINUTES = [0, MINUTE_STEP];
// 12-hour clock order (12 first, then 1–11) so the dropdown reads naturally.
const CLOCK_HOURS = Array.from({ length: NOON_HOUR }, (_unused, idx) => (idx === 0 ? NOON_HOUR : idx));

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

interface HourMinute {
  hour12: number;
  minute: number;
}

const slotValue = ({ hour12, minute }: HourMinute): string =>
  `${hour12}:${String(minute).padStart(TIME_PART_PAD, '0')}`;

/**
 * Every 30-minute slot on a 12-hour clock, plus the current value if it happens
 * to fall off the half-hour grid, so an existing time is never unrepresentable.
 */
function timeSlots(current: HourMinute): HourMinute[] {
  const slots: HourMinute[] = [];
  for (const hour12 of CLOCK_HOURS) {
    for (const minute of HALF_HOUR_MINUTES) {
      slots.push({ hour12, minute });
    }
  }
  if (!slots.some(slot => slot.hour12 === current.hour12 && slot.minute === current.minute)) {
    slots.push(current);
  }
  return slots;
}

interface BatchTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  timeLabel: string;
  meridiemLabel: string;
}

export const BatchTimeInput: React.FC<BatchTimeInputProps> = ({ value, onChange, timeLabel, meridiemLabel }) => {
  const [focused, setFocused] = useState(false);
  const parts = parseTimeParts(value);
  const current: HourMinute = { hour12: parts.hour12, minute: parts.minute };

  const handleTimeChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const [hour12, minute] = event.target.value.split(':').map(Number);
    onChange(buildTimeValue({ hour12, minute, meridiem: parts.meridiem }));
  };

  const handleMeridiemChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    onChange(buildTimeValue({ ...parts, meridiem: event.target.value as Meridiem }));
  };

  const timeStyle = focused ? timeFocusStyle : timeSelectStyle;
  const meridiemStyle = focused ? meridiemFocusStyle : meridiemSelectStyle;

  return (
    <div style={wrapStyle} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
      <select value={slotValue(current)} onChange={handleTimeChange} style={timeStyle} aria-label={timeLabel}>
        {timeSlots(current).map(slot => {
          const optionValue = slotValue(slot);
          return (
            <option key={optionValue} value={optionValue}>
              {optionValue}
            </option>
          );
        })}
      </select>
      <select value={parts.meridiem} onChange={handleMeridiemChange} style={meridiemStyle} aria-label={meridiemLabel}>
        <option value={MERIDIEM_AM}>{MERIDIEM_AM}</option>
        <option value={MERIDIEM_PM}>{MERIDIEM_PM}</option>
      </select>
    </div>
  );
};

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};

const baseSelectStyle: React.CSSProperties = {
  appearance: 'auto',
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
  padding: '8px 4px',
  borderRadius: '8px',
  fontFamily: TOK.fontMono,
  cursor: 'pointer',
  transition: 'background 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
};

const focusOverlay: React.CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${TOK.sun}`,
  boxShadow: `0 0 0 3px ${TOK.sunPale}`,
};

const timeSelectStyle: React.CSSProperties = { ...baseSelectStyle, width: '68px' };
const meridiemSelectStyle: React.CSSProperties = { ...baseSelectStyle, width: '58px' };
const timeFocusStyle: React.CSSProperties = { ...timeSelectStyle, ...focusOverlay };
const meridiemFocusStyle: React.CSSProperties = { ...meridiemSelectStyle, ...focusOverlay };
