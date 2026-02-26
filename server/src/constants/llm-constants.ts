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

// Email classification score thresholds
export const EMAIL_CLASSIFICATION = {
  // Cold outreach confidence threshold
  COLD_OUTREACH_HIGH: 0.7,
  // Cold outreach detection threshold
  COLD_OUTREACH_MEDIUM: 0.5,
  // Default personalization score
  DEFAULT_PERSONALIZATION: 0.5,
  // Generic greeting score
  GENERIC_GREETING_SCORE: 1.5,
  // Single phrase match score
  SINGLE_PHRASE_SCORE: 0.5,
  // Writing style confidence
  WRITING_STYLE_CONFIDENCE: 0.6,
  // Cost per token (approximate)
  COST_PER_TOKEN: 0.17,
} as const;

// Context analysis constants
export const CONTEXT_ANALYSIS = {
  // Days lookback for recent context
  LOOKBACK_DAYS: -10,
  // Slice index to get last N thread emails for summarization (negative = from end)
  // Using -5 instead of -3 to capture more recent conversation context
  LAST_THREAD_EMAILS_SLICE: -5,
  // Max emails to analyze for category generation
  MAX_EMAILS_FOR_CATEGORY_ANALYSIS: 30,
  // Summarization lookback days (kept for backward compatibility)
  SUMMARIZATION_LOOKBACK_DAYS: -3,
  // Batch explanation timeout in ms
  BATCH_TIMEOUT_MS: 60000,
  // Context progress score threshold
  PROGRESS_THRESHOLD: 85,
  // Context timeout seconds
  CONTEXT_TIMEOUT_SECONDS: 450,
  // High score threshold for context
  HIGH_SCORE: 10000,
  // Days threshold for analysis
  ANALYSIS_DAYS: 90,
  // Max items to analyze per batch
  BATCH_ITEMS: 20,
  // Learning sample min
  LEARNING_MIN_SAMPLE: 15,
  // Hour in ms
  HOUR_MS: 3600000,
  // Token usage reporting days
  TOKEN_USAGE_DAYS: 30,
} as const;

// Suggested replies constants
export const SUGGESTED_REPLIES = {
  // Thread messages to include
  THREAD_MESSAGES: 8,
  // Reply draft max tokens
  REPLY_MAX_TOKENS: 25,
} as const;
