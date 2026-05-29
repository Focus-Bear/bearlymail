import * as chrono from "chrono-node";

import { SNOOZE_CONSTANTS } from "../constants/snooze-constants";
import { MILLISECONDS } from "../constants/time-constants";

// Day names (accent-stripped, lowercase) per supported UI language. English is
// the default; Spanish mirrors the locales the client ships translations for.
const DAY_NAMES_BY_LOCALE: { [locale: string]: { [day: string]: number } } = {
  en: { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 },
  es: { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 },
};

// chrono ships locale-specific parsers; fall back to the default (English) one.
const CHRONO_BY_LOCALE: { [locale: string]: chrono.Chrono } = {
  en: chrono.en.casual,
  es: chrono.es.casual,
};

const RELATIVE_DURATION_REGEX = /^(\d+)\s*(m|min|h|hr|d|w)$/;

function baseLocale(locale: string): string {
  return locale.toLowerCase().split("-")[0];
}

/** Strips diacritics so "mié"/"sáb" match the accent-free day-name keys. */
function deaccent(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Parses a free-text duration/time into an absolute Date.
 *
 * Supports the same syntax as the snooze input so that snooze and reply
 * follow-up reminders behave identically:
 *   - day names ("mon"/"lun", "wed"/"mié") → next occurrence at the default hour
 *   - natural language ("tomorrow", "5pm", "next Monday" / "mañana", "próximo lunes")
 *     via chrono's locale-specific parser
 *   - relative durations ("4h", "90m", "3d", "2w")
 *
 * Falls back to one hour from `now` when the input cannot be parsed.
 *
 * @param duration Raw user-entered duration string.
 * @param now Reference time; injectable for deterministic tests.
 * @param locale UI language (e.g. "en", "es"); selects day names + chrono parser.
 */
export function parseDurationToDate(
  duration: string,
  now: Date = new Date(),
  locale = "en",
): Date {
  const normalized = duration.toLowerCase().trim();
  const base = baseLocale(locale);
  const dayNames = DAY_NAMES_BY_LOCALE[base] ?? DAY_NAMES_BY_LOCALE.en;

  const targetDay = dayNames[deaccent(normalized)];
  if (targetDay !== undefined) {
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

  // Match shorthand durations before chrono so "3d" / "2w" aren't
  // interpreted as ordinal day-of-month ("3rd" / "2nd").
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

  const parser = CHRONO_BY_LOCALE[base] ?? CHRONO_BY_LOCALE.en;
  const parsed = parser.parseDate(normalized, now);
  if (parsed) {
    return parsed;
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
 * @param locale UI language (e.g. "en", "es"); selects day names + chrono parser.
 */
export function durationToHours(
  duration: string,
  now: Date = new Date(),
  locale = "en",
): number {
  const target = parseDurationToDate(duration, now, locale);
  const hours = Math.ceil(
    (target.getTime() - now.getTime()) / MILLISECONDS.HOUR,
  );
  return Math.max(1, hours);
}
