/**
 * Constants for the auto-responder module
 */

// Priority thresholds for determining email priority level
export const PRIORITY_THRESHOLDS = {
  // Urgency score threshold for high priority (>= this value)
  HIGH_URGENCY: 70,
  // Urgency score threshold for low priority (< this value)
  LOW_URGENCY: 30,
  // Star count for high priority (>= this value)
  HIGH_PRIORITY_STARS: 3,
  // Star count for low priority (exactly this value)
  LOW_PRIORITY_STARS: 1,
} as const;

// Display formatting constants
export const DISPLAY_LIMITS = {
  // Maximum count to display before showing "100+"
  MAX_DISPLAY_COUNT: 100,
} as const;

// LLM configuration for auto-responder
export const LLM_CONFIG = {
  // Maximum body length to send for Q&A generation
  MAX_BODY_LENGTH_FOR_QA: 1500,
  // Maximum tokens for Q&A answer generation
  QA_MAX_TOKENS: 500,
  // Maximum tokens for email classification
  CLASSIFICATION_MAX_TOKENS: 500,
  // Maximum tokens for custom exclusion rules check
  CUSTOM_RULES_MAX_TOKENS: 300,
} as const;

// Sample data for preview functionality
export const PREVIEW_DEFAULTS = {
  // Default action count for preview when no real data
  SAMPLE_ACTION_COUNT: 37,
  // Default triage count for preview when no real data
  SAMPLE_TRIAGE_COUNT: 21,
} as const;

// Queue processing configuration
export const QUEUE_CONFIG = {
  // Retry delay in seconds for failed auto-response jobs
  RETRY_DELAY_SECONDS: 30,
} as const;

// Statistics configuration
export const STATS_CONFIG = {
  // Number of days to look back for response time statistics
  LOOKBACK_DAYS: 30,
} as const;

// Email age configuration
export const EMAIL_AGE_CONFIG = {
  // Maximum age of an email (in hours) that the auto-responder will reply to
  // Emails older than this will be skipped to avoid replying to old/snoozed emails
  MAX_EMAIL_AGE_HOURS: 24,
} as const;

// BearlyMail branding
export const BRANDING = {
  // URL for the BearlyMail marketing/landing page
  WEBSITE_URL: "https://bearlymail.com",
} as const;

/**
 * Determine the priority level for a thread based on star count and urgency score.
 */
export function determinePriorityLevel(
  thread: { starCount: number; urgencyScore: number | null } | null,
): "low" | "medium" | "high" {
  if (!thread) return "medium";
  if (
    thread.starCount >= PRIORITY_THRESHOLDS.HIGH_PRIORITY_STARS ||
    (thread.urgencyScore ?? 0) >= PRIORITY_THRESHOLDS.HIGH_URGENCY
  ) {
    return "high";
  }
  if (
    thread.starCount === PRIORITY_THRESHOLDS.LOW_PRIORITY_STARS ||
    (thread.urgencyScore ?? PRIORITY_THRESHOLDS.LOW_URGENCY) <
      PRIORITY_THRESHOLDS.LOW_URGENCY
  ) {
    return "low";
  }
  return "medium";
}
