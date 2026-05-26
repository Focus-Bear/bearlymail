import * as chrono from "chrono-node";

import { SNOOZE_CONSTANTS } from "../constants/snooze-constants";
import { MILLISECONDS } from "../constants/time-constants";

const DAY_NAME_TO_INDEX: { [key: string]: number } = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const RELATIVE_DURATION_REGEX = /^(\d+)\s*(m|min|h|hr|d|w)$/;

/**
 * Parses a free-text duration/time into an absolute Date.
 *
 * Supports the same syntax as the snooze input so that snooze and reply
 * follow-up reminders behave identically:
 *   - day names ("mon", "wed") → next occurrence at the default snooze hour
 *   - natural language ("tomorrow", "5pm", "next Monday") via chrono
 *   - relative durations ("4h", "90m", "3d", "2w")
 *
 * Falls back to one hour from `now` when the input cannot be parsed.
 *
 * @param duration Raw user-entered duration string.
 * @param now Reference time; injectable for deterministic tests.
 */
export function parseDurationToDate(
  duration: string,
  now: Date = new Date(),
): Date {
  const normalized = duration.toLowerCase().trim();

  if (DAY_NAME_TO_INDEX[normalized] !== undefined) {
    const targetDay = DAY_NAME_TO_INDEX[normalized];
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;

    if (daysUntil <= 0) {
      daysUntil += SNOOZE_CONSTANTS.DAYS_IN_WEEK;
    }

    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntil);
    nextDate.setHours(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR, 0, 0, 0);

    return nextDate;
  }

  const parsed = chrono.parseDate(normalized, now);
  if (parsed) {
    return parsed;
  }

  const match = normalized.match(RELATIVE_DURATION_REGEX);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "m":
      case "min":
        return new Date(now.getTime() + value * MILLISECONDS.MINUTE);
      case "h":
      case "hr":
        return new Date(now.getTime() + value * MILLISECONDS.HOUR);
      case "d":
        return new Date(now.getTime() + value * MILLISECONDS.DAY);
      case "w":
        return new Date(
          now.getTime() +
            value * SNOOZE_CONSTANTS.DAYS_IN_WEEK * MILLISECONDS.DAY,
        );
    }
  }

  return new Date(now.getTime() + MILLISECONDS.HOUR);
}

/**
 * Converts a free-text duration into a whole number of hours from `now`,
 * for use as an expected-reply / follow-up window.
 *
 * Always returns at least 1 (a past or sub-hour target still schedules a
 * follow-up an hour out), matching the integer-hours contract the reply
 * follow-up pipeline expects.
 *
 * @param duration Raw user-entered duration string.
 * @param now Reference time; injectable for deterministic tests.
 */
export function durationToHours(
  duration: string,
  now: Date = new Date(),
): number {
  const target = parseDurationToDate(duration, now);
  const hours = Math.ceil(
    (target.getTime() - now.getTime()) / MILLISECONDS.HOUR,
  );
  return Math.max(1, hours);
}
