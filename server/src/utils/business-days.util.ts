/**
 * Business days utility for calculating working days excluding weekends and holidays
 * Supports both Australia and US holidays
 */

// Australia holidays (fixed and calculated dates)
const AUSTRALIA_HOLIDAYS = {
  // Fixed dates
  NEW_YEARS_DAY: { month: 0, day: 1 }, // January 1
  AUSTRALIA_DAY: { month: 0, day: 26 }, // January 26
  ANZAC_DAY: { month: 3, day: 25 }, // April 25
  CHRISTMAS: { month: 11, day: 25 }, // December 25
  BOXING_DAY: { month: 11, day: 26 }, // December 26
};

// US holidays (fixed and calculated dates)
const US_HOLIDAYS = {
  // Fixed dates
  NEW_YEARS_DAY: { month: 0, day: 1 }, // January 1
  INDEPENDENCE_DAY: { month: 6, day: 4 }, // July 4
  VETERANS_DAY: { month: 10, day: 11 }, // November 11
  CHRISTMAS: { month: 11, day: 25 }, // December 25
};

/**
 * Calculate Easter Sunday for a given year (using anonymous Gregorian algorithm)
 */
function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
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
  if (offset < 0) offset += 7;
  const date = new Date(year, month, 1 + offset + (n - 1) * 7);
  return date;
}

/**
 * Get the last Monday of a month (for Memorial Day)
 */
function getLastMonday(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const lastWeekday = lastDay.getDay();
  const offset =
    lastWeekday === 1 ? 0 : lastWeekday === 0 ? 6 : 7 - lastWeekday;
  return new Date(year, month, lastDay.getDate() - offset);
}

/**
 * Get the 4th Thursday of November (Thanksgiving)
 */
function getThanksgiving(year: number): Date {
  return getNthWeekday(year, 10, 4, 4); // November (10), Thursday (4), 4th occurrence
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
  holidays.push(getNthWeekday(year, 5, 1, 2)); // June (5), Monday (1), 2nd occurrence

  // Labour Day (1st Monday in October in most states)
  holidays.push(getNthWeekday(year, 9, 1, 1)); // October (9), Monday (1), 1st occurrence

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
  holidays.push(getNthWeekday(year, 0, 1, 3)); // January (0), Monday (1), 3rd occurrence

  // Presidents Day (3rd Monday in February)
  holidays.push(getNthWeekday(year, 1, 1, 3)); // February (1), Monday (1), 3rd occurrence

  // Memorial Day (last Monday in May)
  holidays.push(getLastMonday(year, 4)); // May (4)

  // Labor Day (1st Monday in September)
  holidays.push(getNthWeekday(year, 8, 1, 1)); // September (8), Monday (1), 1st occurrence

  // Columbus Day (2nd Monday in October)
  holidays.push(getNthWeekday(year, 9, 1, 2)); // October (9), Monday (1), 2nd occurrence

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
  if (dayOfWeek === 0 || dayOfWeek === 6) {
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
    allHolidays.map((h) => {
      const d = new Date(h);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }),
  );

  // Count business days
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const currentTime = current.getTime();

    // Check if it's a weekday and not a holiday
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(currentTime)) {
      businessDays++;
    }

    current.setDate(current.getDate() + 1);
  }

  return businessDays;
}
