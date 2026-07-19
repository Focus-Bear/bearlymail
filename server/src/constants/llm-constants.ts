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

// QA keyword scanning constants
export const QA_KEYWORD_SCAN = {
  // Number of chars from the start of the body to scan for QA-related keywords
  QA_KEYWORD_BODY_SCAN_CHARS: 500,
} as const;

// Shared regex for detecting QA-related keywords in subject/body
export const QA_KEYWORD_REGEX = /QA\s*(Status|pass|fail|result)/i;

// Shared regex for detecting time-critical schedule changes (cancellations,
// reschedules, postponements) in subject/body. These emails bypass the stored
// summary for priority analysis — summaries may drop the event date/time the
// urgency scorer needs to detect an imminent event (e.g. a session cancelled
// the night before).
export const TIME_SENSITIVE_KEYWORD_REGEX =
  /\b(cancel(?:led|ed|lation|ling|ing)?|reschedul\w*|postpon\w*|no longer (?:going ahead|happening|running)|new (?:date|time) for)\b/i;

// Body preview lengths for different contexts
export const BODY_PREVIEW_LENGTHS = {
  // Body preview length for batch explanations (slightly shorter)
  BATCH_PREVIEW: 300,
  // Body preview length for single email context
  SINGLE_PREVIEW: 500,
  // Length of the deterministic (non-LLM) summary written for low-priority
  // threads that skip background summarisation — short enough to read as an
  // inbox preview, long enough to capture the opening sentence or two.
  DETERMINISTIC_SUMMARY: 280,
  // Debug log preview length
  DEBUG_LOG_PREVIEW: 800,
  // Body preview length for email classification
  CLASSIFICATION_PREVIEW: 1000,
  // Body length for deterministic composite-rule matching. Much larger than the
  // classification preview so that body "contains" / "NOT contains" phrases deep
  // in a long message (e.g. a QA "Pass"/"Fail" verdict at the end) are still
  // seen — substring matching has no token cost, unlike the LLM classification.
  RULE_MATCH: 50000,
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
  // Default max length for short email previews/snippets
  EMAIL_PREVIEW_MAX: 150,
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

// Sentinel category value written to triage-preserved results.
// Downstream logic uses this to distinguish preserved results from real LLM-assigned categories.
export const TRIAGE_PRESERVED_CATEGORY = "__TRIAGE_PRESERVED__";

// Explanation strings used when triage determines an email needs no reanalysis.
export const TRIAGE_PRESERVED_EXPLANATIONS = {
  URGENCY: "Triage: no reanalysis needed",
  GOAL_ALIGNMENT: "Triage: no reanalysis needed",
  CATEGORY: "Triage: existing analysis preserved",
  REASONING: "Batch triage determined no reanalysis needed",
} as const;
