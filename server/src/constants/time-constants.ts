/**
 * Time-related constants
 * Use these instead of magic numbers for time calculations
 */

// Milliseconds
export const MILLISECONDS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  WEEK: 7 * 24 * 60 * 60 * 1000,
  // 7 days in a week
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  THIRTY_SECONDS: 30 * 1000,
  THREE_SECONDS: 3 * 1000,
} as const;

// Seconds
export const SECONDS = {
  MINUTE: 60,
  HOUR: 60 * 60,
  DAY: 24 * 60 * 60,
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  WEEK: 7 * 24 * 60 * 60,
  // 7 days in a week
} as const;

// Minutes
export const MINUTES = {
  HOUR: 60,
  DAY: 24 * 60,
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  WEEK: 7 * 24 * 60,
  THIRTY: 30,
  FIVE: 5,
} as const;

// Hours
export const HOURS = {
  DAY: 24,
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  WEEK: 7 * 24,
  EIGHT: 8,
  NINE: 9,
  SIX: 6,
  TWELVE: 12,
  FIFTEEN: 15,
  SEVENTEEN: 17,
} as const;

// Days
export const DAYS = {
  WEEK: 7,
  MONTH: 30,
  YEAR: 365,
  SIX: 6,
  TWELVE: 12,
  NINETY: 90,
  SUNDAY: 0,
  MONDAY: 1,
  SATURDAY: 6,
} as const;

// Calendar months (0-indexed as used by JavaScript Date)
export const MONTHS = {
  JANUARY: 0,
  FEBRUARY: 1,
  MARCH: 2,
  APRIL: 3,
  MAY: 4,
  JUNE: 5,
  JULY: 6,
  AUGUST: 7,
  SEPTEMBER: 8,
  OCTOBER: 9,
  NOVEMBER: 10,
  DECEMBER: 11,
} as const;

// Easter algorithm constants (Computus - Anonymous Gregorian algorithm)
// These are mathematical constants from the algorithm, not arbitrary values
export const EASTER_ALGORITHM = {
  METONIC_CYCLE: 19,
  CENTURY_DIVISOR: 100,
  LUNAR_CORRECTION_DIVISOR: 25,
  LUNAR_CORRECTION_OFFSET: 8,
  SOLAR_CORRECTION_DIVISOR: 3,
  PASCHAL_FULL_MOON_OFFSET: 15,
  PASCHAL_FULL_MOON_MOD: 30,
  DOMINICAL_OFFSET: 32,
  DOMINICAL_MOD: 7,
  EPACT_MULTIPLIER_A: 11,
  EPACT_MULTIPLIER_L: 22,
  EPACT_DIVISOR: 451,
  MONTH_CALCULATION_OFFSET: 114,
  MONTH_DIVISOR: 31,
} as const;
