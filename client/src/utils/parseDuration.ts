import * as chrono from 'chrono-node';

import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from 'constants/numbers';

// Day names (accent-stripped, lowercase) per supported UI language. Mirrors the
// server's parser (server/src/snooze/parse-duration.ts) so the preview matches
// the follow-up time the backend will schedule.
const DAY_NAMES_BY_LOCALE: { [locale: string]: { [day: string]: number } } = {
  en: { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 },
  es: { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 },
};

// chrono ships locale-specific parsers; fall back to the default (English) one.
const CHRONO_BY_LOCALE: { [locale: string]: chrono.Chrono } = {
  en: chrono.en.casual,
  es: chrono.es.casual,
};

const DAYS_IN_WEEK = 7;
const DEFAULT_SNOOZE_HOUR = 9;
const NOON_HOUR = 12;

const RELATIVE_DURATION_REGEX = /^(\d+)\s*(mo|m|min|h|hr|d|w)$/;

// Common shorthand chrono doesn't recognise on its own. chrono parses
// "tomorrow"/"tmr"/"tmrw" but not "tom"/"tomo", so an unaliased "tom" would
// fall through to the 1-hour fallback and resurface almost immediately. Map
// these to a canonical word chrono understands. Mirrors the server's parser
// (server/src/snooze/parse-duration.ts).
const WORD_ALIASES: { [alias: string]: string } = {
  tom: 'tomorrow',
  tomo: 'tomorrow',
  tomorow: 'tomorrow',
  '2morrow': 'tomorrow',
  '2moro': 'tomorrow',
  tod: 'today',
};

const ALIAS_REGEX = /\b(tom|tomo|tomorow|2morrow|2moro|tod)\b/g;

const UNIT_MONTHS = 'mo';
const UNIT_MINUTES = 'm';
const UNIT_MINUTES_LONG = 'min';
const UNIT_HOURS = 'h';
const UNIT_HOURS_LONG = 'hr';
const UNIT_DAYS = 'd';
const UNIT_WEEKS = 'w';

function baseLocale(locale: string): string {
  return locale.toLowerCase().split('-')[0];
}

function deaccent(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Adds whole calendar months to a date, preserving the time of day. Day-of-month
 * overflow rolls forward (e.g. Jan 31 + 1 month → early March), which is fine for
 * a follow-up reminder.
 */
function addMonths(from: Date, months: number): Date {
  const result = new Date(from);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Mirrors the server's `parseDurationToDate` (server/src/snooze/parse-duration.ts)
 * so the inline preview matches the follow-up time the backend will actually use.
 * Returns null when the input is blank or cannot be parsed (no follow-up).
 */
export function parseDurationToDate(
  duration: string,
  now: Date = new Date(),
  locale = 'en'
): Date | null {
  const trimmed = duration.toLowerCase().trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(ALIAS_REGEX, match => WORD_ALIASES[match] ?? match);

  const base = baseLocale(locale);
  const dayNames = DAY_NAMES_BY_LOCALE[base] ?? DAY_NAMES_BY_LOCALE.en;
  const targetDay = dayNames[deaccent(normalized)];
  if (targetDay !== undefined) {
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) {
      daysUntil += DAYS_IN_WEEK;
    }
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntil);
    nextDate.setHours(DEFAULT_SNOOZE_HOUR, 0, 0, 0);
    return nextDate;
  }

  // Match shorthand durations before chrono so "3d" / "2w" aren't
  // interpreted as ordinal day-of-month ("3rd" / "2nd").
  const match = normalized.match(RELATIVE_DURATION_REGEX);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case UNIT_MONTHS:
        return addMonths(now, value);
      case UNIT_MINUTES:
      case UNIT_MINUTES_LONG:
        return new Date(now.getTime() + value * MS_PER_MINUTE);
      case UNIT_HOURS:
      case UNIT_HOURS_LONG:
        return new Date(now.getTime() + value * MS_PER_HOUR);
      case UNIT_DAYS:
        return new Date(now.getTime() + value * MS_PER_DAY);
      case UNIT_WEEKS:
        return new Date(now.getTime() + value * DAYS_IN_WEEK * MS_PER_DAY);
    }
  }

  const parser = CHRONO_BY_LOCALE[base] ?? CHRONO_BY_LOCALE.en;
  const parsed = parser.parseDate(normalized, now);
  if (parsed) {
    return parsed;
  }

  return null;
}

// 11th/12th/13th are exceptions to the "1st/2nd/3rd" pattern (teens always take "th").
const TEEN_ELEVENTH = 11;
const TEEN_TWELFTH = 12;
const TEEN_THIRTEENTH = 13;

function ordinal(day: number): string {
  const onesDigit = day % 10;
  const lastTwoDigits = day % 100;
  if (onesDigit === 1 && lastTwoDigits !== TEEN_ELEVENTH) {
    return `${day}st`;
  }
  if (onesDigit === 2 && lastTwoDigits !== TEEN_TWELFTH) {
    return `${day}nd`;
  }
  if (onesDigit === 3 && lastTwoDigits !== TEEN_THIRTEENTH) {
    return `${day}rd`;
  }
  return `${day}th`;
}

const EN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EN_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function isEnglish(locale: string): boolean {
  return locale.toLowerCase().startsWith('en');
}

/**
 * Formats the time of day. English keeps the compact "2pm" / "2:30pm" style;
 * other locales defer to `Intl` (e.g. Spanish "14:00").
 */
function formatTime(date: Date, locale: string): string {
  if (isEnglish(locale)) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= NOON_HOUR ? 'pm' : 'am';
    const hour12 = hours % NOON_HOUR === 0 ? NOON_HOUR : hours % NOON_HOUR;
    return minutes === 0
      ? `${hour12}${period}`
      : `${hour12}:${minutes.toString().padStart(2, '0')}${period}`;
  }
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formats the calendar date. English keeps the "Wed 23rd Mar" style (ordinal,
 * day before month); other locales defer to `Intl` (e.g. Spanish "mié, 23 mar").
 */
function formatDate(date: Date, locale: string, now: Date): string {
  const includeYear = date.getFullYear() !== now.getFullYear();
  if (isEnglish(locale)) {
    const weekday = EN_WEEKDAYS[date.getDay()];
    const day = ordinal(date.getDate());
    const month = EN_MONTHS[date.getMonth()];
    const yearSuffix = includeYear ? ` ${date.getFullYear()}` : '';
    return `${weekday} ${day} ${month}${yearSuffix}`;
  }
  return date.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: includeYear ? 'numeric' : undefined,
  });
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/**
 * The three i18n keys a preview can resolve to, depending on whether the parsed
 * time lands today, tomorrow, or further out. Callers supply their own set so
 * the wording fits the context (e.g. "Follow up …" vs "Reappears …").
 */
export interface PreviewKeys {
  today: string;
  tomorrow: string;
  date: string;
}

const FOLLOW_UP_PREVIEW_KEYS: PreviewKeys = {
  today: 'emailDetail.expectedReply.previewToday',
  tomorrow: 'emailDetail.expectedReply.previewTomorrow',
  date: 'emailDetail.expectedReply.previewDate',
};

/**
 * An i18n key plus its interpolation values, ready to pass to `t()`. Keeping the
 * connective words ("today at" / "a las") and word order in the translation
 * files lets the preview localize cleanly while the locale-formatted date/time
 * tokens are computed here.
 */
export interface FollowUpPreview {
  i18nKey: string;
  values: { time: string; date?: string };
}

/**
 * Parses and locale-formats a duration relative to `now`, returning an i18n key
 * + values ready for `t()`. Returns null when the input is blank or unparseable.
 *
 * `keys` selects the wording (defaults to the reply follow-up copy); the snooze
 * input passes its own "Reappears …" key set.
 */
export function humanizeDuration(
  duration: string,
  locale = 'en',
  now: Date = new Date(),
  keys: PreviewKeys = FOLLOW_UP_PREVIEW_KEYS,
): FollowUpPreview | null {
  const date = parseDurationToDate(duration, now, locale);
  if (!date) {
    return null;
  }

  const time = formatTime(date, locale);

  if (isSameDay(date, now)) {
    return { i18nKey: keys.today, values: { time } };
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isSameDay(date, tomorrow)) {
    return { i18nKey: keys.tomorrow, values: { time } };
  }

  return { i18nKey: keys.date, values: { date: formatDate(date, locale, now), time } };
}
