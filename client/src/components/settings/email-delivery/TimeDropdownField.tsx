import React, { useEffect } from 'react';
import { theme } from 'theme/theme';

import {
  buildTime24h,
  DEFAULT_DELIVERY_TIME_24H,
  isValidTime24h,
  type Meridiem,
  MERIDIEM_AM,
  MERIDIEM_PM,
  parseTime12h,
} from './deliveryTimesManager.helpers';

/**
 * A delivery-time picker built from two native `<select>` controls — a single
 * hour:minute dropdown in 30-minute steps, plus AM/PM — instead of
 * `<input type="time">`.
 *
 * Safari renders the native time input without a clickable AM/PM stepper and
 * only reports a value once every segment is committed, so the AM/PM could not
 * be set with the mouse and a time whose default meridiem was kept could not be
 * added at all (issue #297). Native selects are visible and clickable in every
 * browser, and this field always resolves to a concrete value so the parent's
 * "Add" button is enabled without any keyboard interaction.
 *
 * The value is exchanged as a 24-hour `"HH:MM"` string, matching the batch API.
 */

const MINUTES_PAD = 2;
const HOURS_IN_HALF_DAY = 12;
const MINUTE_STEP = 30;
const HALF_HOUR_MINUTES = [0, MINUTE_STEP];
// 12-hour clock order (12 first, then 1–11) so the dropdown reads naturally.
const CLOCK_HOURS = Array.from({ length: HOURS_IN_HALF_DAY }, (_unused, idx) =>
  idx === 0 ? HOURS_IN_HALF_DAY : idx
);

interface HourMinute {
  hour12: number;
  minute: number;
}

const slotValue = ({ hour12, minute }: HourMinute): string =>
  `${hour12}:${String(minute).padStart(MINUTES_PAD, '0')}`;

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

interface TimeDropdownFieldProps {
  value: string;
  onChange: (value: string) => void;
  timeLabel: string;
  meridiemLabel: string;
}

export const TimeDropdownField: React.FC<TimeDropdownFieldProps> = ({
  value,
  onChange,
  timeLabel,
  meridiemLabel,
}) => {
  // Normalise an empty/invalid value up to a concrete default so the parent has
  // a real time to add without the user touching the field first (#297).
  useEffect(() => {
    if (!isValidTime24h(value)) {
      onChange(DEFAULT_DELIVERY_TIME_24H);
    }
  }, [value, onChange]);

  const parts = parseTime12h(value);
  const current: HourMinute = { hour12: parts.hour12, minute: parts.minute };

  const handleTimeChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const [hour12, minute] = event.target.value.split(':').map(Number);
    onChange(buildTime24h({ hour12, minute, meridiem: parts.meridiem }));
  };

  const handleMeridiemChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    onChange(buildTime24h({ ...parts, meridiem: event.target.value as Meridiem }));
  };

  return (
    <div style={wrapStyle}>
      <select value={slotValue(current)} onChange={handleTimeChange} style={timeSelectStyle} aria-label={timeLabel}>
        {timeSlots(current).map(slot => {
          const optionValue = slotValue(slot);
          return (
            <option key={optionValue} value={optionValue}>
              {optionValue}
            </option>
          );
        })}
      </select>
      <select value={parts.meridiem} onChange={handleMeridiemChange} style={meridiemSelectStyle} aria-label={meridiemLabel}>
        <option value={MERIDIEM_AM}>{MERIDIEM_AM}</option>
        <option value={MERIDIEM_PM}>{MERIDIEM_PM}</option>
      </select>
    </div>
  );
};

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.xs,
};

const baseSelectStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  textAlign: 'center',
  textAlignLast: 'center',
  padding: `${theme.spacing.sm} ${theme.spacing.xs}`,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  backgroundColor: theme.colors.background.paper,
  color: theme.colors.text.primary,
  cursor: 'pointer',
};

const timeSelectStyle: React.CSSProperties = { ...baseSelectStyle, width: '64px' };
const meridiemSelectStyle: React.CSSProperties = { ...baseSelectStyle, width: '56px' };
