/**
 * Deterministic pre-send check for a written weekday that contradicts the
 * written date, e.g. "Tuesday 7th December" when 7 December is a Monday. The
 * LLM tone check misses these (it does not do calendar arithmetic reliably),
 * and a wrong day in a meeting proposal is exactly the kind of slip that
 * causes a missed call, so this runs on every send regardless of tone rules.
 */

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Lower-case spellings (full and abbreviated) → weekday index, Sunday = 0. */
const WEEKDAY_LOOKUP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  weds: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/** Lower-case spellings (full and abbreviated) → month index, January = 0. */
const MONTH_LOOKUP: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const WEEKDAY_PATTERN =
  "(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|weds|wed|thurs|thur|thu|fri|sat)\\.?";
const MONTH_PATTERN =
  "(january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\\.?";
const DAY_PATTERN = "(\\d{1,2})(?:st|nd|rd|th)?";
const YEAR_PATTERN = "(?:,?\\s+((?:19|20)\\d{2}))?";

/** "Tuesday 7th December", "Tue, the 7th of Dec 2026" */
const DAY_FIRST = new RegExp(
  `\\b${WEEKDAY_PATTERN},?\\s+(?:the\\s+)?${DAY_PATTERN}\\s+(?:of\\s+)?${MONTH_PATTERN}${YEAR_PATTERN}\\b`,
  "gi",
);
/** "Tuesday, December 7th", "Tue Dec 7, 2026" */
const MONTH_FIRST = new RegExp(
  `\\b${WEEKDAY_PATTERN},?\\s+${MONTH_PATTERN}\\s+${DAY_PATTERN}${YEAR_PATTERN}\\b`,
  "gi",
);

const MS_PER_DAY = 86_400_000;
/** How far either side of the written date to look for the written weekday. */
const NEAREST_WEEKDAY_SPAN = 3;

interface WrittenDate {
  phrase: string;
  weekday: number;
  day: number;
  month: number;
  year: number | null;
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}

function parseReferenceDate(currentTime?: string | null): Date {
  const match = currentTime?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * A date written without a year means the occurrence nearest to today:
 * "7th December" in late November is this December, in early January last one.
 */
function resolveYear(day: number, month: number, reference: Date): number {
  const thisYear = reference.getUTCFullYear();
  const candidates = [thisYear - 1, thisYear, thisYear + 1].filter(
    (year) => day <= daysInMonth(year, month),
  );
  if (candidates.length === 0) {
    return thisYear;
  }
  return candidates.reduce((best, year) => {
    const distance = Math.abs(Date.UTC(year, month, day) - reference.getTime());
    const bestDistance = Math.abs(
      Date.UTC(best, month, day) - reference.getTime(),
    );
    return distance < bestDistance ? year : best;
  });
}

function collectWrittenDates(text: string): WrittenDate[] {
  const found: WrittenDate[] = [];
  for (const match of text.matchAll(DAY_FIRST)) {
    found.push({
      phrase: match[0],
      weekday: WEEKDAY_LOOKUP[match[1].toLowerCase()],
      day: Number(match[2]),
      month: MONTH_LOOKUP[match[3].toLowerCase()],
      year: match[4] ? Number(match[4]) : null,
    });
  }
  for (const match of text.matchAll(MONTH_FIRST)) {
    found.push({
      phrase: match[0],
      weekday: WEEKDAY_LOOKUP[match[1].toLowerCase()],
      month: MONTH_LOOKUP[match[2].toLowerCase()],
      day: Number(match[3]),
      year: match[4] ? Number(match[4]) : null,
    });
  }
  return found;
}

function formatDate(date: Date, includeWeekday: boolean): string {
  const dayMonth = `${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
  return includeWeekday
    ? `${WEEKDAY_NAMES[date.getUTCDay()]} ${dayMonth}`
    : dayMonth;
}

function describeMismatch(
  written: WrittenDate,
  reference: Date,
): string | null {
  const year =
    written.year ?? resolveYear(written.day, written.month, reference);
  const monthLength = daysInMonth(year, written.month);
  if (written.day < 1 || written.day > monthLength) {
    return `"${written.phrase}" — ${MONTH_NAMES[written.month]} ${year} only has ${monthLength} days.`;
  }

  const date = new Date(Date.UTC(year, written.month, written.day));
  if (date.getUTCDay() === written.weekday) {
    return null;
  }

  const actualWeekday = WEEKDAY_NAMES[date.getUTCDay()];
  const head = `"${written.phrase}" — ${formatDate(date, false)} ${year} is a ${actualWeekday}.`;
  for (let offset = 1; offset <= NEAREST_WEEKDAY_SPAN; offset++) {
    for (const signed of [offset, -offset]) {
      const candidate = new Date(date.getTime() + signed * MS_PER_DAY);
      if (candidate.getUTCDay() === written.weekday) {
        return `${head} Did you mean ${formatDate(date, true)} or ${formatDate(candidate, true)}?`;
      }
    }
  }
  return head;
}

/**
 * Returns a sender-facing warning for every weekday/date pair in the draft that
 * contradicts the calendar, or null when they all line up (or none are found).
 * `currentTime` is the composer's local ISO time; it decides the year when the
 * draft does not state one.
 */
export function findWeekdayDateMismatch(
  text: string | null | undefined,
  currentTime?: string | null,
): string | null {
  if (!text) {
    return null;
  }
  const reference = parseReferenceDate(currentTime);
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const written of collectWrittenDates(stripHtml(text))) {
    const key = written.phrase.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const warning = describeMismatch(written, reference);
    if (warning) {
      warnings.push(warning);
    }
  }
  return warnings.length > 0 ? warnings.join(" ") : null;
}
