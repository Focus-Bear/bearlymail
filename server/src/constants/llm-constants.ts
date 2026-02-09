/**
 * LLM-related constants
 * Use these instead of magic numbers for LLM operations
 */

// Time formatting constants
export const TIME_FORMATTING = {
  // Hour threshold for AM/PM (12-hour clock)
  NOON_HOUR: 12,
  // Hours in a half day (for 12-hour format)
  HOURS_IN_HALF_DAY: 12,
} as const;

// Recent email thresholds
export const RECENCY_THRESHOLDS = {
  // Days for considering an email "recent" (for search relevance)
  RECENT_DAYS: 7,
} as const;

// Q&A extraction constants
export const QA_EXTRACTION = {
  // Minimum frequency for a Q&A pattern to be extracted
  MIN_FREQUENCY: 3,
} as const;

// Body preview lengths for different contexts
export const BODY_PREVIEW_LENGTHS = {
  // Body preview length for batch explanations (slightly shorter)
  BATCH_PREVIEW: 300,
  // Body preview length for single email context
  SINGLE_PREVIEW: 500,
  // Debug log preview length
  DEBUG_LOG_PREVIEW: 800,
  // Body preview length for email classification
  CLASSIFICATION_PREVIEW: 1000,
} as const;

// Email content cleaner constants
export const CONTENT_CLEANER = {
  // Minimum characters before a signature pattern to consider cutting
  MIN_CONTENT_BEFORE_SIGNATURE: 50,
  // Search region size for sentence boundary truncation
  SENTENCE_BOUNDARY_SEARCH_REGION: 200,
  // Word boundary threshold for truncation (chars from end)
  WORD_BOUNDARY_THRESHOLD: 50,
  // Extra buffer for preview length calculations
  PREVIEW_BUFFER: 50,
} as const;

// Priority analysis fallback values
export const PRIORITY_ANALYSIS_FALLBACK = {
  // Default urgency score when keywords are detected
  URGENCY_KEYWORDS_DETECTED: 90,
  // Default urgency score when no keywords detected
  URGENCY_NO_KEYWORDS: 0,
} as const;

// LLM processor constants
export const LLM_PROCESSOR_CONSTANTS = {
  // Sentiment score threshold for negative classification
  SENTIMENT_NEGATIVE_THRESHOLD: -0.3,
  // Sentiment score threshold for positive classification
  SENTIMENT_POSITIVE_THRESHOLD: 0.3,
  // Multiplier for sentiment contribution to priority
  SENTIMENT_MULTIPLIER: 30,
  // Neutral urgency baseline (50 = no contribution)
  URGENCY_NEUTRAL: 50,
  // Weight for goal alignment in priority calculation
  GOAL_ALIGNMENT_WEIGHT: 0.4,
} as const;

// Thread message limits
export const THREAD_LIMITS = {
  // Maximum number of messages to include from thread
  LAST_MESSAGES: 5,
} as const;
