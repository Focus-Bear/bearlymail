/**
 * Constants for LLM operation types used for token usage tracking.
 * Each operation represents a distinct use case for LLM calls.
 */

// Context and pattern analysis
export const LLM_OP_ANALYZE_EMAIL_PATTERNS = "analyze_email_patterns";

// Email summarization
export const LLM_OP_SUMMARIZE_EMAIL = "summarize_email";

// Email summarization with LLM phishing check piggybacked (single email)
export const LLM_OP_SUMMARIZE_EMAIL_WITH_PHISHING =
  "summarize_email_with_phishing_check";

// Email summarization (batch)
export const LLM_OP_SUMMARIZE_EMAIL_BATCH = "summarize_email_batch";

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

// Priority calculation/analysis (batch)
export const LLM_OP_ANALYZE_PRIORITY_BATCH = "analyze_priority_batch";

// Auto-responder: email classification
export const LLM_OP_CLASSIFY_EMAIL = "classify_email_type";

// Auto-responder: Q&A answer generation
export const LLM_OP_GENERATE_QA_ANSWER = "generate_qa_answer";

// Auto-responder: opt-out detection
export const LLM_OP_DETECT_OPT_OUT = "detect_opt_out";

// Auto-responder: check custom exclusion rules
export const LLM_OP_CHECK_CUSTOM_EXCLUSION_RULES =
  "check_custom_exclusion_rules";

// Name redaction for privacy
export const LLM_OP_REDACT_NAMES = "redact_names";

// Validate and clean writing style examples
export const LLM_OP_VALIDATE_WRITING_EXAMPLE = "validate_writing_example";

// Tone check dispute evaluation
export const LLM_OP_DISPUTE_TONE_CHECK = "dispute_tone_check";

// Email category consolidation
export const LLM_OP_CONSOLIDATE_CATEGORIES = "consolidate_categories";

// Family-scoped de-duplication of existing categories (manual "Consolidate" button)
export const LLM_OP_MERGE_DUPLICATE_CATEGORIES = "merge_duplicate_categories";

// Generate new categories from "Other" emails
export const LLM_OP_GENERATE_CATEGORIES_FROM_OTHER =
  "generate_categories_from_other";

// Identify custom labels for category generation
export const LLM_OP_IDENTIFY_CUSTOM_LABELS = "identify_custom_labels";

// Incremental priority check (assesses if full recalc needed)
export const LLM_OP_INCREMENTAL_PRIORITY_CHECK = "incremental_priority_check";

// Incremental summary update (updates summary with new message)
export const LLM_OP_INCREMENTAL_SUMMARY = "incremental_summary";

// CRM: Contact type classification
export const LLM_OP_CLASSIFY_CONTACT_TYPE = "classify_contact_type";

// Context compression
export const LLM_OP_COMPRESS_CONTEXT = "compress_context";

// Phishing-only check (used when summarisation uses a custom prompt)
export const LLM_OP_CHECK_PHISHING_ONLY = "check_phishing_only";
export const LLM_OP_CONFIRM_PHISHING = "confirm_phishing";

// Workflows: evaluate natural-language condition against an email
export const LLM_OP_EVALUATE_WORKFLOW_CONDITION = "evaluate_workflow_condition";

// Workflows: resolve {{ai:...}} template variables from email context
export const LLM_OP_RESOLVE_WORKFLOW_VARIABLES = "resolve_workflow_variables";

// Booking meeting title generation from agenda
export const LLM_OP_GENERATE_BOOKING_TITLE = "generate_booking_title";

// Category shortlisting: pre-filter full category list to top-N candidates (cheap model)
export const LLM_OP_CATEGORY_SHORTLIST = "category_shortlist";

// Category shortlisting via embedding similarity (replaces the chat-model shortlist)
export const LLM_OP_CATEGORY_EMBEDDING = "category_embedding";

// Suggest generic composite category rules from email samples
export const LLM_OP_SUGGEST_CATEGORY_RULES = "suggest_category_rules";

// Incremental re-categorisation of a thread from its updated summary
export const LLM_OP_CATEGORISE_SUMMARY = "categorise_summary";

// Derive not-contains exclusions for an auto-rule from real false positives
export const LLM_OP_DERIVE_RULE_EXCLUSIONS = "derive_rule_exclusions";

// Assess whether a draft composite rule adds value over existing same-category rules
export const LLM_OP_ASSESS_CATEGORY_RULE_VALUE = "assess_category_rule_value";

// Batch priority triage: lightweight check if category/priority needs reanalysis (cheap model)
export const LLM_OP_BATCH_PRIORITY_TRIAGE = "batch_priority_triage";

// Detect whether an email proposes a specific meeting time and extract details
export const LLM_OP_DETECT_MEETING_PROPOSAL = "detect_meeting_proposal";

// Check whether two category names are duplicates (Levenshtein near-match confirmation)
export const LLM_OP_CHECK_CATEGORY_DUPLICATE = "check_category_duplicate";

// Sender context: pick which MCP tool + arg looks up a person by email
export const LLM_OP_DERIVE_MCP_SENDER_TOOL = "derive_mcp_sender_tool";

// Ask AI: free-form question answering grounded in the open email/thread
export const LLM_OP_ASK_AI_EMAIL = "ask_ai_email";

// Ask AI (agentic): tool-using assistant that can search the user's emails and
// call connected MCP tools (e.g. Google Drive) to answer a question
export const LLM_OP_ASK_AI_AGENT = "ask_ai_agent";

// Triage distraction tax: verify the spoken confession phrase to unlock lower-priority emails
export const LLM_OP_VERIFY_DISTRACTION_PHRASE = "verify_distraction_phrase";

// Generic/unknown operation (fallback)
export const LLM_OP_UNKNOWN = "unknown";

/**
 * Type for all valid LLM operation values
 */
export type LLMOperation =
  | typeof LLM_OP_EVALUATE_WORKFLOW_CONDITION
  | typeof LLM_OP_RESOLVE_WORKFLOW_VARIABLES
  | typeof LLM_OP_ANALYZE_EMAIL_PATTERNS
  | typeof LLM_OP_SUMMARIZE_EMAIL
  | typeof LLM_OP_SUMMARIZE_EMAIL_WITH_PHISHING
  | typeof LLM_OP_SUMMARIZE_EMAIL_BATCH
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
  | typeof LLM_OP_ANALYZE_PRIORITY_BATCH
  | typeof LLM_OP_CLASSIFY_EMAIL
  | typeof LLM_OP_GENERATE_QA_ANSWER
  | typeof LLM_OP_DETECT_OPT_OUT
  | typeof LLM_OP_CHECK_CUSTOM_EXCLUSION_RULES
  | typeof LLM_OP_REDACT_NAMES
  | typeof LLM_OP_VALIDATE_WRITING_EXAMPLE
  | typeof LLM_OP_DISPUTE_TONE_CHECK
  | typeof LLM_OP_CONSOLIDATE_CATEGORIES
  | typeof LLM_OP_MERGE_DUPLICATE_CATEGORIES
  | typeof LLM_OP_GENERATE_CATEGORIES_FROM_OTHER
  | typeof LLM_OP_IDENTIFY_CUSTOM_LABELS
  | typeof LLM_OP_INCREMENTAL_PRIORITY_CHECK
  | typeof LLM_OP_INCREMENTAL_SUMMARY
  | typeof LLM_OP_CLASSIFY_CONTACT_TYPE
  | typeof LLM_OP_COMPRESS_CONTEXT
  | typeof LLM_OP_CHECK_PHISHING_ONLY
  | typeof LLM_OP_CONFIRM_PHISHING
  | typeof LLM_OP_GENERATE_BOOKING_TITLE
  | typeof LLM_OP_CATEGORY_SHORTLIST
  | typeof LLM_OP_CATEGORY_EMBEDDING
  | typeof LLM_OP_SUGGEST_CATEGORY_RULES
  | typeof LLM_OP_CATEGORISE_SUMMARY
  | typeof LLM_OP_DERIVE_RULE_EXCLUSIONS
  | typeof LLM_OP_ASSESS_CATEGORY_RULE_VALUE
  | typeof LLM_OP_BATCH_PRIORITY_TRIAGE
  | typeof LLM_OP_DETECT_MEETING_PROPOSAL
  | typeof LLM_OP_CHECK_CATEGORY_DUPLICATE
  | typeof LLM_OP_DERIVE_MCP_SENDER_TOOL
  | typeof LLM_OP_ASK_AI_EMAIL
  | typeof LLM_OP_ASK_AI_AGENT
  | typeof LLM_OP_VERIFY_DISTRACTION_PHRASE
  | typeof LLM_OP_UNKNOWN;

/**
 * Human-readable labels for operations (used in admin UI)
 */
export const LLM_OPERATION_LABELS: Record<LLMOperation, string> = {
  [LLM_OP_EVALUATE_WORKFLOW_CONDITION]: "Evaluate Workflow Condition",
  [LLM_OP_RESOLVE_WORKFLOW_VARIABLES]: "Resolve Workflow Variables",
  [LLM_OP_ANALYZE_EMAIL_PATTERNS]: "Analyze Email Patterns",
  [LLM_OP_SUMMARIZE_EMAIL]: "Summarize Email",
  [LLM_OP_SUMMARIZE_EMAIL_WITH_PHISHING]: "Summarize Email + Phishing Check",
  [LLM_OP_SUMMARIZE_EMAIL_BATCH]: "Summarize Email (Batch)",
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
  [LLM_OP_ANALYZE_PRIORITY_BATCH]: "Analyze Priority (Batch)",
  [LLM_OP_CLASSIFY_EMAIL]: "Classify Email Type",
  [LLM_OP_GENERATE_QA_ANSWER]: "Generate Q&A Answer",
  [LLM_OP_DETECT_OPT_OUT]: "Detect Opt-Out",
  [LLM_OP_CHECK_CUSTOM_EXCLUSION_RULES]: "Check Custom Exclusion Rules",
  [LLM_OP_REDACT_NAMES]: "Redact Names",
  [LLM_OP_VALIDATE_WRITING_EXAMPLE]: "Validate Writing Example",
  [LLM_OP_DISPUTE_TONE_CHECK]: "Dispute Tone Check",
  [LLM_OP_CONSOLIDATE_CATEGORIES]: "Consolidate Categories",
  [LLM_OP_MERGE_DUPLICATE_CATEGORIES]: "Merge Duplicate Categories",
  [LLM_OP_GENERATE_CATEGORIES_FROM_OTHER]: "Generate Categories from Other",
  [LLM_OP_IDENTIFY_CUSTOM_LABELS]: "Identify Custom Labels",
  [LLM_OP_INCREMENTAL_PRIORITY_CHECK]: "Incremental Priority Check",
  [LLM_OP_INCREMENTAL_SUMMARY]: "Incremental Summary Update",
  [LLM_OP_CLASSIFY_CONTACT_TYPE]: "Classify Contact Type",
  [LLM_OP_COMPRESS_CONTEXT]: "Compress Context",
  [LLM_OP_CHECK_PHISHING_ONLY]: "Check Phishing Only",
  [LLM_OP_CONFIRM_PHISHING]: "Confirm Phishing (second opinion)",
  [LLM_OP_GENERATE_BOOKING_TITLE]: "Generate Booking Title",
  [LLM_OP_CATEGORY_SHORTLIST]: "Category Shortlist",
  [LLM_OP_CATEGORY_EMBEDDING]: "Category Embedding",
  [LLM_OP_SUGGEST_CATEGORY_RULES]: "Suggest Category Rules",
  [LLM_OP_CATEGORISE_SUMMARY]: "Categorise From Summary",
  [LLM_OP_DERIVE_RULE_EXCLUSIONS]: "Derive Rule Exclusions",
  [LLM_OP_ASSESS_CATEGORY_RULE_VALUE]: "Assess Category Rule Value",
  [LLM_OP_BATCH_PRIORITY_TRIAGE]: "Batch Priority Triage",
  [LLM_OP_DETECT_MEETING_PROPOSAL]: "Detect Meeting Proposal",
  [LLM_OP_CHECK_CATEGORY_DUPLICATE]: "Check Category Duplicate",
  [LLM_OP_DERIVE_MCP_SENDER_TOOL]: "Derive MCP Sender Tool",
  [LLM_OP_ASK_AI_EMAIL]: "Ask AI (Email Assistant)",
  [LLM_OP_ASK_AI_AGENT]: "Ask AI (Agentic Assistant)",
  [LLM_OP_VERIFY_DISTRACTION_PHRASE]: "Verify Distraction Phrase",
  [LLM_OP_UNKNOWN]: "Unknown Operation",
};
