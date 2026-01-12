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
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  WEEK: 7,
  MONTH: 30,
  YEAR: 365,
  SIX: 6,
  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  TWELVE: 12,
  NINETY: 90,
  SUNDAY: 0,
  SATURDAY: 6,
} as const;
