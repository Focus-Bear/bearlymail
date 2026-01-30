/**
 * Constants for LLM operation types used for token usage tracking.
 * Each operation represents a distinct use case for LLM calls.
 */

// Context and pattern analysis
export const LLM_OP_ANALYZE_EMAIL_PATTERNS = "analyze_email_patterns";

// Email summarization
export const LLM_OP_SUMMARIZE_EMAIL = "summarize_email";

// Tone checking for replies
export const LLM_OP_CHECK_TONE = "check_tone";

// Action item extraction
export const LLM_OP_EXTRACT_ACTION_ITEMS = "extract_action_items";

// Suggested actions detection
export const LLM_OP_SUGGEST_ACTIONS = "suggest_actions";

// Reply draft generation (single reply)
export const LLM_OP_GENERATE_REPLY = "generate_reply";

// Multiple reply options generation
export const LLM_OP_GENERATE_REPLY_OPTIONS = "generate_reply_options";

// Meeting response generation
export const LLM_OP_GENERATE_MEETING_REPLY = "generate_meeting_reply";

// Follow-up email generation
export const LLM_OP_GENERATE_FOLLOW_UP = "generate_follow_up";

// Priority override analysis
export const LLM_OP_ANALYZE_OVERRIDE_REASON = "analyze_override_reason";

// Q&A extraction from emails
export const LLM_OP_EXTRACT_QANDA = "extract_qanda";

// Search relevance explanation (single)
export const LLM_OP_SEARCH_RELEVANCE = "search_relevance";

// Search relevance explanation (batch)
export const LLM_OP_SEARCH_RELEVANCE_BATCH = "search_relevance_batch";

// Priority calculation/analysis
export const LLM_OP_ANALYZE_PRIORITY = "analyze_priority";

// Auto-responder: email classification
export const LLM_OP_CLASSIFY_EMAIL = "classify_email_type";

// Auto-responder: Q&A answer generation
export const LLM_OP_GENERATE_QA_ANSWER = "generate_qa_answer";

// Auto-responder: opt-out detection
export const LLM_OP_DETECT_OPT_OUT = "detect_opt_out";

// Name redaction for privacy
export const LLM_OP_REDACT_NAMES = "redact_names";

// Tone check dispute evaluation
export const LLM_OP_DISPUTE_TONE_CHECK = "dispute_tone_check";

// Email category consolidation
export const LLM_OP_CONSOLIDATE_CATEGORIES = "consolidate_categories";

// Generate new categories from "Other" emails
export const LLM_OP_GENERATE_CATEGORIES_FROM_OTHER =
  "generate_categories_from_other";

// Generic/unknown operation (fallback)
export const LLM_OP_UNKNOWN = "unknown";

/**
 * Type for all valid LLM operation values
 */
export type LLMOperation =
  | typeof LLM_OP_ANALYZE_EMAIL_PATTERNS
  | typeof LLM_OP_SUMMARIZE_EMAIL
  | typeof LLM_OP_CHECK_TONE
  | typeof LLM_OP_EXTRACT_ACTION_ITEMS
  | typeof LLM_OP_SUGGEST_ACTIONS
  | typeof LLM_OP_GENERATE_REPLY
  | typeof LLM_OP_GENERATE_REPLY_OPTIONS
  | typeof LLM_OP_GENERATE_MEETING_REPLY
  | typeof LLM_OP_GENERATE_FOLLOW_UP
  | typeof LLM_OP_ANALYZE_OVERRIDE_REASON
  | typeof LLM_OP_EXTRACT_QANDA
  | typeof LLM_OP_SEARCH_RELEVANCE
  | typeof LLM_OP_SEARCH_RELEVANCE_BATCH
  | typeof LLM_OP_ANALYZE_PRIORITY
  | typeof LLM_OP_CLASSIFY_EMAIL
  | typeof LLM_OP_GENERATE_QA_ANSWER
  | typeof LLM_OP_DETECT_OPT_OUT
  | typeof LLM_OP_REDACT_NAMES
  | typeof LLM_OP_DISPUTE_TONE_CHECK
  | typeof LLM_OP_CONSOLIDATE_CATEGORIES
  | typeof LLM_OP_GENERATE_CATEGORIES_FROM_OTHER
  | typeof LLM_OP_UNKNOWN;

/**
 * Human-readable labels for operations (used in admin UI)
 */
export const LLM_OPERATION_LABELS: Record<LLMOperation, string> = {
  [LLM_OP_ANALYZE_EMAIL_PATTERNS]: "Analyze Email Patterns",
  [LLM_OP_SUMMARIZE_EMAIL]: "Summarize Email",
  [LLM_OP_CHECK_TONE]: "Check Tone",
  [LLM_OP_EXTRACT_ACTION_ITEMS]: "Extract Action Items",
  [LLM_OP_SUGGEST_ACTIONS]: "Suggest Actions",
  [LLM_OP_GENERATE_REPLY]: "Generate Reply",
  [LLM_OP_GENERATE_REPLY_OPTIONS]: "Generate Reply Options",
  [LLM_OP_GENERATE_MEETING_REPLY]: "Generate Meeting Reply",
  [LLM_OP_GENERATE_FOLLOW_UP]: "Generate Follow-up",
  [LLM_OP_ANALYZE_OVERRIDE_REASON]: "Analyze Override Reason",
  [LLM_OP_EXTRACT_QANDA]: "Extract Q&A",
  [LLM_OP_SEARCH_RELEVANCE]: "Search Relevance",
  [LLM_OP_SEARCH_RELEVANCE_BATCH]: "Search Relevance (Batch)",
  [LLM_OP_ANALYZE_PRIORITY]: "Analyze Priority",
  [LLM_OP_CLASSIFY_EMAIL]: "Classify Email Type",
  [LLM_OP_GENERATE_QA_ANSWER]: "Generate Q&A Answer",
  [LLM_OP_DETECT_OPT_OUT]: "Detect Opt-Out",
  [LLM_OP_REDACT_NAMES]: "Redact Names",
  [LLM_OP_DISPUTE_TONE_CHECK]: "Dispute Tone Check",
  [LLM_OP_CONSOLIDATE_CATEGORIES]: "Consolidate Categories",
  [LLM_OP_GENERATE_CATEGORIES_FROM_OTHER]: "Generate Categories from Other",
  [LLM_OP_UNKNOWN]: "Unknown Operation",
};
