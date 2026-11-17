import { HOURS_PER_DAY, MINUTES_PER_HOUR } from 'constants/numbers';

/** The longest task Focus Bear accepts from a link (the Mac's `CreateTaskLink.maxDurationMinutes`). */
export const MAX_TASK_DURATION_MINUTES = HOURS_PER_DAY * MINUTES_PER_HOUR;

const HOUR_UNITS = 'h|hrs?|hours?|horas?';
const MINUTE_UNITS = 'm|mins?|minutes?|minutos?';
// Hours, minutes or both, as typed into a snooze box: "1h", "1.5h", "30m", "1h30", "1 hour 30 minutes",
// and a bare number of minutes ("45").
const HOURS_AND_MINUTES_REGEX = new RegExp(
  `^(?:(\\d+(?:[.,]\\d+)?)\\s*(?:${HOUR_UNITS}))?\\s*(?:(\\d+)\\s*(?:${MINUTE_UNITS})?)?$`
);
const CLOCK_STYLE_REGEX = /^(\d+):([0-5]\d)$/;
const DECIMAL_COMMA = ',';
const DECIMAL_POINT = '.';

function totalMinutes(hours: number, minutes: number): number | null {
  const total = Math.round(hours * MINUTES_PER_HOUR + minutes);
  return total > 0 ? total : null;
}

/**
 * Whole minutes for a task length typed snooze-style ("30m", "1h", "1h30", "1.5h", "1:30", "45").
 * Null when it is blank, zero or not a length; longer than MAX_TASK_DURATION_MINUTES is the caller's to refuse.
 */
export function parseTaskDurationMinutes(input: string): number | null {
  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const clock = normalized.match(CLOCK_STYLE_REGEX);
  if (clock) {
    return totalMinutes(Number(clock[1]), Number(clock[2]));
  }
  const match = normalized.match(HOURS_AND_MINUTES_REGEX);
  if (!match || (match[1] === undefined && match[2] === undefined)) {
    return null;
  }
  const hours = match[1] === undefined ? 0 : Number(match[1].replace(DECIMAL_COMMA, DECIMAL_POINT));
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  return totalMinutes(hours, minutes);
}

/** Splits minutes into whole hours and the minutes left over, for "1 h 30 min" style labels. */
export function splitIntoHoursAndMinutes(minutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minutes / MINUTES_PER_HOUR), minutes: minutes % MINUTES_PER_HOUR };
}
