/**
 * Queue monitoring constants
 * Use these instead of magic numbers for queue monitoring and management
 */

export const QUEUE_CONSTANTS = {
  // Monitor interval in milliseconds
  MONITOR_INTERVAL: 3000,
  // Health check timeout in seconds
  HEALTH_CHECK_TIMEOUT: 90,
  // Thread ID preview length for logging
  THREAD_ID_PREVIEW_LENGTH: 12,
  // Days to keep logs
  DAYS_TO_KEEP_LOGS: 7,
  // Cleanup interval in milliseconds
  CLEANUP_INTERVAL: 300,
  // Maximum queue size
  MAX_QUEUE_SIZE: 800,
} as const;
