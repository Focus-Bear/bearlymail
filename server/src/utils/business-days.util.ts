import { DAYS, EASTER_ALGORITHM, MONTHS } from "../constants/time-constants";

/**
 * Business days utility for calculating working days excluding weekends and holidays
 * Supports both Australia and US holidays
 */

// Australia holidays (fixed and calculated dates)
const AUSTRALIA_HOLIDAYS = {
  // Fixed dates
  NEW_YEARS_DAY: { month: MONTHS.JANUARY, day: 1 },
  AUSTRALIA_DAY: { month: MONTHS.JANUARY, day: 26 },
  ANZAC_DAY: { month: MONTHS.APRIL, day: 25 },
  CHRISTMAS: { month: MONTHS.DECEMBER, day: 25 },
  BOXING_DAY: { month: MONTHS.DECEMBER, day: 26 },
};

// US holidays (fixed and calculated dates)
const US_HOLIDAYS = {
  // Fixed dates
  NEW_YEARS_DAY: { month: MONTHS.JANUARY, day: 1 },
  INDEPENDENCE_DAY: { month: MONTHS.JULY, day: 4 },
  VETERANS_DAY: { month: MONTHS.NOVEMBER, day: 11 },
  CHRISTMAS: { month: MONTHS.DECEMBER, day: 25 },
};

/**
 * Calculate Easter Sunday for a given year (using anonymous Gregorian algorithm)
 * Variable names follow the standard Computus algorithm notation
 */
function calculateEaster(year: number): Date {
  const itemA = year % EASTER_ALGORITHM.METONIC_CYCLE;
  const itemB = Math.floor(year / EASTER_ALGORITHM.CENTURY_DIVISOR);
  const item = year % EASTER_ALGORITHM.CENTURY_DIVISOR;
  const date = Math.floor(itemB / 4);
  const err = itemB % 4;
  const field = Math.floor(
    (itemB + EASTER_ALGORITHM.LUNAR_CORRECTION_OFFSET) /
      EASTER_ALGORITHM.LUNAR_CORRECTION_DIVISOR,
  );
  const group = Math.floor(
    (itemB - field + 1) / EASTER_ALGORITHM.SOLAR_CORRECTION_DIVISOR,
  );
  const header =
    (EASTER_ALGORITHM.METONIC_CYCLE * itemA +
      itemB -
      date -
      group +
      EASTER_ALGORITHM.PASCHAL_FULL_MOON_OFFSET) %
    EASTER_ALGORITHM.PASCHAL_FULL_MOON_MOD;
  const i = Math.floor(item / 4);
  const key = item % 4;
  const label =
    (EASTER_ALGORITHM.DOMINICAL_OFFSET + 2 * err + 2 * i - header - key) %
    EASTER_ALGORITHM.DOMINICAL_MOD;
  const match = Math.floor(
    (itemA +
      EASTER_ALGORITHM.EPACT_MULTIPLIER_A * header +
      EASTER_ALGORITHM.EPACT_MULTIPLIER_L * label) /
      EASTER_ALGORITHM.EPACT_DIVISOR,
  );
  const month = Math.floor(
    (header +
      label -
      EASTER_ALGORITHM.DOMINICAL_MOD * match +
      EASTER_ALGORITHM.MONTH_CALCULATION_OFFSET) /
      EASTER_ALGORITHM.MONTH_DIVISOR,
  );
  const day =
    ((header +
      label -
      EASTER_ALGORITHM.DOMINICAL_MOD * match +
      EASTER_ALGORITHM.MONTH_CALCULATION_OFFSET) %
      EASTER_ALGORITHM.MONTH_DIVISOR) +
    1;
  return new Date(year, month - 1, day);
}

/**
 * Get the nth Monday of a month (for MLK Day, Presidents Day, Labor Day, etc.)
 */
function getNthWeekday(
  year: number,
  month: number,
  weekday: number,
  weekOrdinal: number,
): Date {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();
  let offset = weekday - firstWeekday;
  if (offset < 0) offset += DAYS.WEEK;
  const date = new Date(
    year,
    month,
    1 + offset + (weekOrdinal - 1) * DAYS.WEEK,
  );
  return date;
}

/**
 * Get the last Monday of a month (for Memorial Day)
 */
function getLastMonday(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const lastWeekday = lastDay.getDay();
  let offset: number;
  if (lastWeekday === DAYS.MONDAY) {
    offset = 0;
  } else if (lastWeekday === DAYS.SUNDAY) {
    offset = DAYS.SATURDAY;
  } else {
    offset = DAYS.WEEK - lastWeekday;
  }
  return new Date(year, month, lastDay.getDate() - offset);
}

/**
 * Get the 4th Thursday of November (Thanksgiving)
 */
function getThanksgiving(year: number): Date {
  const THURSDAY = 4;
  const FOURTH_OCCURRENCE = 4;
  return getNthWeekday(year, MONTHS.NOVEMBER, THURSDAY, FOURTH_OCCURRENCE);
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
  const SECOND_OCCURRENCE = 2;
  holidays.push(
    getNthWeekday(year, MONTHS.JUNE, DAYS.MONDAY, SECOND_OCCURRENCE),
  );

  // Labour Day (1st Monday in October in most states)
  const FIRST_OCCURRENCE = 1;
  holidays.push(
    getNthWeekday(year, MONTHS.OCTOBER, DAYS.MONDAY, FIRST_OCCURRENCE),
  );

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
  const THIRD_OCCURRENCE = 3;
  holidays.push(
    getNthWeekday(year, MONTHS.JANUARY, DAYS.MONDAY, THIRD_OCCURRENCE),
  );

  // Presidents Day (3rd Monday in February)
  holidays.push(
    getNthWeekday(year, MONTHS.FEBRUARY, DAYS.MONDAY, THIRD_OCCURRENCE),
  );

  // Memorial Day (last Monday in May)
  holidays.push(getLastMonday(year, MONTHS.MAY));

  // Labor Day (1st Monday in September)
  holidays.push(
    getNthWeekday(year, MONTHS.SEPTEMBER, DAYS.MONDAY, FIRST_OCCURRENCE),
  );

  // Columbus Day (2nd Monday in October)
  holidays.push(
    getNthWeekday(year, MONTHS.OCTOBER, DAYS.MONDAY, SECOND_OCCURRENCE),
  );

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

  const pad = (dval: number) => (dval < 10 ? `0${dval}` : `${dval}`);
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
