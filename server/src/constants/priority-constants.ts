/**
 * Priority-related constants
 * Use these instead of magic numbers for priority calculations
 */

/** Maximum number of times a thread may be re-queued for priority calculation before giving up. */
export const MAX_PRIORITY_RETRIES = 3;

export const PRIORITY_SCORES = {
  MIN: 0,
  MAX: 100,
  URGENT_THRESHOLD: 90,
  HIGH_THRESHOLD: 75,
  MEDIUM_THRESHOLD: 50,
  LOW_THRESHOLD: 25,
  VERY_HIGH: 95,
  HIGH: 80,
  NEUTRAL: 50,
  /**
   * LLM urgency dimension score (0–100) at or above which an email is
   * time-critical and escapes batching for immediate delivery, even when the
   * composite priority score stays below HIGH_THRESHOLD. Matches the
   * prioritise-email prompt's "critical/immediate" band (90–100).
   */
  CRITICAL_URGENCY_THRESHOLD: 90,
  /**
   * When priority is decided WITHOUT the LLM (a deterministic rule, or in future
   * an authoritative ML model), threads scoring at or below this are not
   * summarised automatically in the background — that LLM cost is reserved for
   * threads the user is likely to act on; lower-priority threads summarise
   * lazily when the user opens them. The LLM priority path always summarises,
   * since the pipeline and the prioritisation prompt depend on the summary.
   */
  BACKGROUND_SUMMARY_MIN: 30,
} as const;

export const STAR_COUNTS = {
  MIN: 0,
  MAX: 3,
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
} as const;

export const PRIORITY_BOOSTS = {
  VIP_CONTACT: 25,
  GOAL_ALIGNMENT: 15,
  PROJECT_PRIORITY_1: 15,
  PROJECT_PRIORITY_2: 10,
  PROJECT_PRIORITY_3: 5,
  URGENT_KEYWORD: 25,
  LOW_INTEREST_PENALTY: -20,
  DONT_CARE_PENALTY: -20,
  READ_NOT_STARRED_PENALTY: -15,
  RECENCY_TODAY: 30,
  RECENCY_24H: 25,
  RECENCY_7D: 20,
  RECENCY_30D: 5,
  RECENCY_60D_PENALTY: -30,
  RECENCY_30D_PENALTY: -20,
  RELEVANCE_THRESHOLD: 40,
  MAX_DAYS_BOOST: 30,
  JOB_TITLE_MULTIPLIER: 10,
} as const;

export const PRIORITY_WEIGHTS = {
  GOAL_ALIGNMENT: 0.4,
  SENTIMENT: 0.3,
  DAYS_EXPONENT: 1.5,
  DAYS_MULTIPLIER: 2,
} as const;

export const SENTIMENT_THRESHOLDS = {
  NEGATIVE: -0.3,
  POSITIVE: 0.3,
  NEUTRAL_CONTRIBUTION: 15,
  URGENCY_BOOST: 1,
  UPSET_BOOST: 1.5,
  LOW_PRIORITY_PENALTY: -1,
  NORMALIZATION_DIVISOR: 10,
} as const;

export const JOB_TITLE_SCORES = {
  HIGH_PRIORITY: 1,
  DEFAULT: 0.5,
} as const;

export const TRIAGE_THRESHOLDS = {
  PRIORITY_HIGH: 80,
  PRIORITY_MEDIUM: 60,
  PRIORITY_LOW: 40,
  DEFAULT_PRIORITY: 50,
  VIP_CONFIDENCE: 90,
  PATTERN_CONFIDENCE: 75,
  ARCHIVE_CONFIDENCE: 70,
  DEFAULT_CONFIDENCE: 65,
  FALLBACK_CONFIDENCE: 50,
  HIGH_STAR_AVG: 2.5,
  HIGH_ARCHIVE_RATE: 0.7,
  MIN_PATTERN_EMAILS: 2,
} as const;

// Priority factor types used in priority calculations
export const PRIORITY_FACTOR_TYPES = {
  VIP_CONTACT: "VIP_CONTACT",
  GOAL_ALIGNMENT: "GOAL_ALIGNMENT",
  CURRENT_PROJECT: "CURRENT_PROJECT",
  NOT_IMPORTANT: "NOT_IMPORTANT",
  SENTIMENT: "SENTIMENT",
  SENDER_ROLE: "SENDER_ROLE",
  RECENCY: "RECENCY",
  URGENT_KEYWORDS: "URGENT_KEYWORDS",
  USER_OVERRIDE: "USER_OVERRIDE",
  READ_STATUS: "READ_STATUS",
} as const;

// Display names for priority factors (with emojis for UI)
export const PRIORITY_FACTOR_DISPLAY_NAMES: Record<string, string> = {
  [PRIORITY_FACTOR_TYPES.VIP_CONTACT]: "⭐ VIP Contact",
  [PRIORITY_FACTOR_TYPES.GOAL_ALIGNMENT]: "🎯 Goal Alignment",
  [PRIORITY_FACTOR_TYPES.CURRENT_PROJECT]: "📋 Current Project",
  [PRIORITY_FACTOR_TYPES.NOT_IMPORTANT]: "❌ Not Important",
  [PRIORITY_FACTOR_TYPES.SENTIMENT]: "😊 Sentiment",
  [PRIORITY_FACTOR_TYPES.SENDER_ROLE]: "👔 Sender Role",
  [PRIORITY_FACTOR_TYPES.RECENCY]: "⏰ Recency",
  [PRIORITY_FACTOR_TYPES.URGENT_KEYWORDS]: "🚨 Urgent Keywords",
  [PRIORITY_FACTOR_TYPES.USER_OVERRIDE]: "✏️ User Override",
  [PRIORITY_FACTOR_TYPES.READ_STATUS]: "📖 Read Status",
};

// Sentiment types
export const SENTIMENT_TYPES = {
  NEGATIVE: "negative",
  POSITIVE: "positive",
  NEUTRAL: "neutral",
} as const;

// Newsletter/mass-email category discount
// Newsletters should have their urgency and goal alignment scores heavily reduced
// because they are informational background reading, not actionable personal emails
export const NEWSLETTER_DISCOUNT = {
  URGENCY_MULTIPLIER: 0.25,
  GOAL_ALIGNMENT_MULTIPLIER: 0.25,
  CATEGORY_PATTERNS: ["newsletter", "digest", "marketing", "promotional"],
} as const;
