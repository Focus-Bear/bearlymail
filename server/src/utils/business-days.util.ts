import { DAYS } from "../constants/time-constants";

/**
 * Business days utility for calculating working days excluding weekends and holidays
 * Supports both Australia and US holidays
 */

// Australia holidays (fixed and calculated dates)
const AUSTRALIA_HOLIDAYS = {
  // Fixed dates
  // January 1
  NEW_YEARS_DAY: { month: 0, day: 1 },
  // January 26
  AUSTRALIA_DAY: { month: 0, day: 26 },
  // April 25
  ANZAC_DAY: { month: 3, day: 25 },
  // December 25
  CHRISTMAS: { month: 11, day: 25 },
  // December 26
  BOXING_DAY: { month: 11, day: 26 },
};

// US holidays (fixed and calculated dates)
const US_HOLIDAYS = {
  // Fixed dates
  // January 1
  NEW_YEARS_DAY: { month: 0, day: 1 },
  // July 4
  INDEPENDENCE_DAY: { month: 6, day: 4 },
  // November 11
  VETERANS_DAY: { month: 10, day: 11 },
  // December 25
  CHRISTMAS: { month: 11, day: 25 },
};

/**
 * Calculate Easter Sunday for a given year (using anonymous Gregorian algorithm)
 */
function calculateEaster(year: number): Date {
  // eslint-disable-next-line id-length, @typescript-eslint/no-magic-numbers
  const a = year % 19;
  // eslint-disable-next-line id-length
  const b = Math.floor(year / 100);
  // eslint-disable-next-line id-length
  const c = year % 100;
  // eslint-disable-next-line id-length
  const d = Math.floor(b / 4);
  // eslint-disable-next-line id-length
  const e = b % 4;
  // eslint-disable-next-line id-length, @typescript-eslint/no-magic-numbers
  const f = Math.floor((b + 8) / 25);
  // eslint-disable-next-line id-length, @typescript-eslint/no-magic-numbers
  const g = Math.floor((b - f + 1) / 3);
  // eslint-disable-next-line id-length, @typescript-eslint/no-magic-numbers
  const h = (19 * a + b - d - g + 15) % 30;
  // eslint-disable-next-line id-length
  const i = Math.floor(c / 4);
  // eslint-disable-next-line id-length
  const k = c % 4;
  // eslint-disable-next-line id-length, @typescript-eslint/no-magic-numbers
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  // eslint-disable-next-line id-length, @typescript-eslint/no-magic-numbers
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Get the nth Monday of a month (for MLK Day, Presidents Day, Labor Day, etc.)
 */
function getNthWeekday(
  year: number,
  month: number,
  weekday: number,
  n: number,
): Date {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  let offset = weekday - firstWeekday;
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  if (offset < 0) offset += 7;
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  const date = new Date(year, month, 1 + offset + (n - 1) * 7);
  return date;
}

/**
 * Get the last Monday of a month (for Memorial Day)
 */
function getLastMonday(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const lastWeekday = lastDay.getDay();
  let offset: number;
  if (lastWeekday === 1) {
    offset = 0;
  } else if (lastWeekday === 0) {
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    offset = 6;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    offset = 7 - lastWeekday;
  }
  return new Date(year, month, lastDay.getDate() - offset);
}

/**
 * Get the 4th Thursday of November (Thanksgiving)
 */
function getThanksgiving(year: number): Date {
  // November (10), Thursday (4), 4th occurrence
  return getNthWeekday(year, 10, 4, 4);
}

/**
 * Get all holidays for a given year (both AU and US)
 */
function getHolidaysForYear(year: number): Date[] {
  const holidays: Date[] = [];

  // Australia holidays
  holidays.push(
    new Date(
      year,
      AUSTRALIA_HOLIDAYS.NEW_YEARS_DAY.month,
      AUSTRALIA_HOLIDAYS.NEW_YEARS_DAY.day,
    ),
  );
  holidays.push(
    new Date(
      year,
      AUSTRALIA_HOLIDAYS.AUSTRALIA_DAY.month,
      AUSTRALIA_HOLIDAYS.AUSTRALIA_DAY.day,
    ),
  );
  holidays.push(
    new Date(
      year,
      AUSTRALIA_HOLIDAYS.ANZAC_DAY.month,
      AUSTRALIA_HOLIDAYS.ANZAC_DAY.day,
    ),
  );
  holidays.push(
    new Date(
      year,
      AUSTRALIA_HOLIDAYS.CHRISTMAS.month,
      AUSTRALIA_HOLIDAYS.CHRISTMAS.day,
    ),
  );
  holidays.push(
    new Date(
      year,
      AUSTRALIA_HOLIDAYS.BOXING_DAY.month,
      AUSTRALIA_HOLIDAYS.BOXING_DAY.day,
    ),
  );

  // Easter-based holidays (Good Friday, Easter Monday)
  const easter = calculateEaster(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  holidays.push(goodFriday);

  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);
  holidays.push(easterMonday);

  // Queen's Birthday (2nd Monday in June in most states)
  // June (5), Monday (1), 2nd occurrence
  holidays.push(getNthWeekday(year, 5, 1, 2));

  // Labour Day (1st Monday in October in most states)
  // October (9), Monday (1), 1st occurrence
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  holidays.push(getNthWeekday(year, 9, 1, 1));

  // US holidays
  holidays.push(
    new Date(
      year,
      US_HOLIDAYS.NEW_YEARS_DAY.month,
      US_HOLIDAYS.NEW_YEARS_DAY.day,
    ),
  );
  holidays.push(
    new Date(
      year,
      US_HOLIDAYS.INDEPENDENCE_DAY.month,
      US_HOLIDAYS.INDEPENDENCE_DAY.day,
    ),
  );
  holidays.push(
    new Date(
      year,
      US_HOLIDAYS.VETERANS_DAY.month,
      US_HOLIDAYS.VETERANS_DAY.day,
    ),
  );
  holidays.push(
    new Date(year, US_HOLIDAYS.CHRISTMAS.month, US_HOLIDAYS.CHRISTMAS.day),
  );

  // MLK Day (3rd Monday in January)
  // January (0), Monday (1), 3rd occurrence
  holidays.push(getNthWeekday(year, 0, 1, 3));

  // Presidents Day (3rd Monday in February)
  // February (1), Monday (1), 3rd occurrence
  holidays.push(getNthWeekday(year, 1, 1, 3));

  // Memorial Day (last Monday in May)
  // May (4)
  holidays.push(getLastMonday(year, 4));

  // Labor Day (1st Monday in September)
  // September (8), Monday (1), 1st occurrence
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  holidays.push(getNthWeekday(year, 8, 1, 1));

  // Columbus Day (2nd Monday in October)
  // October (9), Monday (1), 2nd occurrence
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  holidays.push(getNthWeekday(year, 9, 1, 2));

  // Thanksgiving (4th Thursday in November)
  holidays.push(getThanksgiving(year));

  return holidays;
}

/**
 * Check if a date is a business day (not weekend, not holiday)
 */
export function isBusinessDay(date: Date): boolean {
  const dayOfWeek = date.getDay();

  // Check if weekend
  if (dayOfWeek === DAYS.SUNDAY || dayOfWeek === DAYS.SATURDAY) {
    return false;
  }

  // Check if holiday
  const year = date.getFullYear();
  const holidays = getHolidaysForYear(year);

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  return !holidays.some((holiday) => {
    const holidayStr = `${holiday.getFullYear()}-${pad(holiday.getMonth() + 1)}-${pad(holiday.getDate())}`;
    return holidayStr === dateStr;
  });
}

/**
 * Get the next business day from a given date
 */
export function getNextBusinessDay(date: Date): Date {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  while (!isBusinessDay(nextDay)) {
    nextDay.setDate(nextDay.getDate() + 1);
  }

  return nextDay;
}

/**
 * Calculate the number of business days between two dates (inclusive)
 * Excludes weekends and holidays (AU and US)
 */
export function calculateBusinessDays(startDate: Date, endDate: Date): number {
  // Normalize dates to start of day
  let start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  let end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  // Swap if start is after end
  if (start > end) {
    [start, end] = [end, start];
  }

  let businessDays = 0;
  const current = new Date(start);

  // Get all holidays for the years in range
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const allHolidays: Date[] = [];
  for (let year = startYear; year <= endYear; year++) {
    allHolidays.push(...getHolidaysForYear(year));
  }

  // Create a Set of holiday date strings for fast lookup
  const holidaySet = new Set(
    allHolidays.map((holiday) => {
      const holidayDate = new Date(holiday);
      holidayDate.setHours(0, 0, 0, 0);
      return holidayDate.getTime();
    }),
  );

  // Count business days
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const currentTime = current.getTime();

    // Check if it's a weekday and not a holiday
    if (
      dayOfWeek !== DAYS.SUNDAY &&
      dayOfWeek !== DAYS.SATURDAY &&
      !holidaySet.has(currentTime)
    ) {
      businessDays++;
    }

    current.setDate(current.getDate() + 1);
  }

  return businessDays;
}
