/**
 * Pure helper functions extracted from DeliveryTimesManager.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */

const HOURS_12_HOUR_FORMAT = 12;
const PADDING_START_2 = 2;
const HOUR_WRAP_OFFSET = 11;
const MINUTES_IN_HOUR = 60;
const HOURS_IN_DAY = 24;

export type Meridiem = 'AM' | 'PM';

export const MERIDIEM_AM: Meridiem = 'AM';
export const MERIDIEM_PM: Meridiem = 'PM';

/** A concrete fallback so the picker always holds a real value (issue #297). */
export const DEFAULT_DELIVERY_TIME_24H = '09:00';

export interface TimeParts {
  hour12: number;
  minute: number;
  meridiem: Meridiem;
}

export function formatTime12h(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= HOURS_12_HOUR_FORMAT ? MERIDIEM_PM : MERIDIEM_AM;
  const hours12 = hours % HOURS_12_HOUR_FORMAT || HOURS_12_HOUR_FORMAT;
  return `${hours12}:${minutes.toString().padStart(PADDING_START_2, '0')} ${period}`;
}

/** True when `time` is a well-formed 24-hour `"HH:MM"` value. */
export function isValidTime24h(time: string): boolean {
  const [hoursStr, minutesStr] = (time ?? '').split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  return (
    hoursStr !== undefined &&
    minutesStr !== undefined &&
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    hours >= 0 &&
    hours < HOURS_IN_DAY &&
    minutes >= 0 &&
    minutes < MINUTES_IN_HOUR
  );
}

/** Splits a 24-hour `"HH:MM"` value into 12-hour display parts; invalid input falls back to the default. */
export function parseTime12h(time24: string): TimeParts {
  const source = isValidTime24h(time24) ? time24 : DEFAULT_DELIVERY_TIME_24H;
  const [hours, minutes] = source.split(':').map(Number);
  return {
    hour12: ((hours + HOUR_WRAP_OFFSET) % HOURS_12_HOUR_FORMAT) + 1,
    minute: minutes,
    meridiem: hours >= HOURS_12_HOUR_FORMAT ? MERIDIEM_PM : MERIDIEM_AM,
  };
}

/** Rebuilds a zero-padded 24-hour `"HH:MM"` value from 12-hour display parts. */
export function buildTime24h({ hour12, minute, meridiem }: TimeParts): string {
  const base = hour12 % HOURS_12_HOUR_FORMAT;
  const hours = meridiem === MERIDIEM_PM ? base + HOURS_12_HOUR_FORMAT : base;
  return `${String(hours).padStart(PADDING_START_2, '0')}:${String(minute).padStart(PADDING_START_2, '0')}`;
}
