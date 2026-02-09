/**
 * Snooze-related constants
 * Use these instead of magic numbers for snooze durations
 */

export const SNOOZE_CONSTANTS = {
  // Default snooze duration in minutes
  DEFAULT_SNOOZE_MINUTES: 50,
  // Short snooze duration in minutes
  SHORT_SNOOZE_MINUTES: 25,
  // Medium snooze duration in minutes
  MEDIUM_SNOOZE_MINUTES: 75,
  // Long snooze duration in minutes
  LONG_SNOOZE_MINUTES: 90,
  // Maximum snooze duration in days
  MAX_SNOOZE_DAYS: 20,
  // Days in a week (for calculating next week's date)
  DAYS_IN_WEEK: 7,
  // Default hour for day-name snooze (9 AM)
  DEFAULT_SNOOZE_HOUR: 9,
} as const;
