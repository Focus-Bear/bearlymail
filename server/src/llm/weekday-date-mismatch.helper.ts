/**
 * Deterministic pre-send check for a written weekday that contradicts the
 * written date, e.g. "Tuesday 7th December" when 7 December is a Monday. The
 * LLM tone check misses these (it does not do calendar arithmetic reliably),
 * and a wrong day in a meeting proposal is exactly the kind of slip that
 * causes a missed call, so this runs on every send regardless of tone rules.
 * Reads English and Spanish ("martes 7 de diciembre") dates.
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

/** Spanish spellings, accents removed (see `foldAccents`) → weekday index, Sunday = 0. */
const SPANISH_WEEKDAY_LOOKUP: Record<string, number> = {
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  mie: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sab: 6,
};

/** Spanish spellings → month index, January = 0. Spanish writes months in lower case. */
const SPANISH_MONTH_LOOKUP: Record<string, number> = {
  enero: 0,
  ene: 0,
  febrero: 1,
  feb: 1,
  marzo: 2,
  mar: 2,
  abril: 3,
  abr: 3,
  mayo: 4,
  may: 4,
  junio: 5,
  jun: 5,
  julio: 6,
  jul: 6,
  agosto: 7,
  ago: 7,
  septiembre: 8,
  setiembre: 8,
  sept: 8,
  sep: 8,
  octubre: 9,
  oct: 9,
  noviembre: 10,
  nov: 10,
  diciembre: 11,
  dic: 11,
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

const SPANISH_WEEKDAY_PATTERN =
  "(domingo|lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|dom|lun|mar|mi[ée]|jue|vie|s[áa]b)\\.?";
const SPANISH_MONTH_PATTERN =
  "(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic)\\.?";
const SPANISH_YEAR_PATTERN = "(?:,?\\s+(?:del?\\s+)?((?:19|20)\\d{2}))?";

/** "martes 7 de diciembre", "mié, 9 dic", "martes 7 de diciembre de 2026" */
const SPANISH_DAY_FIRST = new RegExp(
  `(?<![\\p{L}\\p{N}])${SPANISH_WEEKDAY_PATTERN},?\\s+${DAY_PATTERN}\\s+(?:de\\s+)?${SPANISH_MONTH_PATTERN}${SPANISH_YEAR_PATTERN}(?![\\p{L}\\p{N}])`,
  "giu",
);

/**
 * "may" is also an everyday English word ("Friday 5 may work"), so in English
 * text it counts as the month only when written with a capital, as months are.
 */
function isLowercaseMay(monthToken: string): boolean {
  return monthToken.replace(/\.$/, "") === "may";
}

/** "miércoles" → "miercoles", so lookups don't depend on accents being typed. */
function foldAccents(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

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
    .replace(/<[^<>]*>/g, " ")
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
    if (isLowercaseMay(match[3])) continue;
    found.push({
      phrase: match[0],
      weekday: WEEKDAY_LOOKUP[match[1].toLowerCase()],
      day: Number(match[2]),
      month: MONTH_LOOKUP[match[3].toLowerCase()],
      year: match[4] ? Number(match[4]) : null,
    });
  }
  for (const match of text.matchAll(MONTH_FIRST)) {
    if (isLowercaseMay(match[2])) continue;
    found.push({
      phrase: match[0],
      weekday: WEEKDAY_LOOKUP[match[1].toLowerCase()],
      month: MONTH_LOOKUP[match[2].toLowerCase()],
      day: Number(match[3]),
      year: match[4] ? Number(match[4]) : null,
    });
  }
  for (const match of text.matchAll(SPANISH_DAY_FIRST)) {
    found.push({
      phrase: match[0],
      weekday: SPANISH_WEEKDAY_LOOKUP[foldAccents(match[1])],
      day: Number(match[2]),
      month: SPANISH_MONTH_LOOKUP[foldAccents(match[3])],
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
