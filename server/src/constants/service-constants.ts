/**
 * General service constants
 * Use these instead of magic numbers for common service operations
 */

// Token generation constants
export const TOKEN_CONSTANTS = {
  // Number of random bytes for secure tokens
  TOKEN_BYTES: 32,
  // Password setup token validity in days
  PASSWORD_SETUP_TOKEN_DAYS: 7,
  // Trial period length in days
  TRIAL_PERIOD_DAYS: 7,
} as const;

// Display and logging constants
export const DISPLAY_CONSTANTS = {
  // Maximum items to display before showing "...and X more"
  MAX_DISPLAY_ITEMS: 10,
  // Substring preview length for log messages
  LOG_PREVIEW_LENGTH: 50,
} as const;

// Resource monitor constants for byte conversions
export const BYTE_CONVERSIONS = {
  // Bytes per kilobyte
  KB: 1024,
  // Bytes per megabyte
  MB: 1024 * 1024,
  // Bytes per gigabyte
  GB: 1024 * 1024 * 1024,
} as const;

// HTTP status codes
export const HTTP_STATUS = {
  // Rate limit exceeded
  TOO_MANY_REQUESTS: 429,
} as const;

// Priority learning thresholds
export const LEARNING_THRESHOLDS = {
  // Star count for high priority detection
  HIGH_PRIORITY_STARS: 3,
  // Minimum occurrences to suggest VIP
  MIN_VIP_OCCURRENCES: 2,
  // Minimum data points for category-specific response times
  MIN_CATEGORY_DATA_POINTS: 3,
} as const;
