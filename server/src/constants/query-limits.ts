/**
 * Query limit constants
 * Use these instead of magic numbers for database and API query limits
 */

/**
 * Inbox mode constants
 * Use these instead of magic strings for inbox mode comparisons
 */
export const INBOX_MODES = {
  TRIAGE: "triage",
  ACTION: "action",
  FOLLOW_UP: "follow-up",
  BLOCKED: "blocked",
} as const;

export type InboxMode = (typeof INBOX_MODES)[keyof typeof INBOX_MODES];

export const QUERY_LIMITS = {
  INBOX_TOTAL: 500,
  /**
   * Sync-window policy (see emails/sync-window-policy.ts): the initial sync
   * caps at this many most-recent emails.
   */
  INITIAL_SYNC_MAX_EMAILS: 500,
  /**
   * Sync-window policy: after the initial sync, ongoing syncs only fetch
   * emails at most this many days old (starred emails are fetched regardless
   * of age).
   */
  ONGOING_SYNC_WINDOW_DAYS: 7,
  INBOX_PROCESS_TOTAL: 1000,
  INBOX_PAGE_SIZE: 50,
  THREAD_QUERY: 100,
  EMAIL_QUERY: 100,
  MAX_CONTACTS: 5000,
  CONTACTS_API_PAGE_SIZE: 1000,
  MAX_SENT_EMAILS: 150,
  MAX_SENT_EMAILS_FOR_STYLE: 50,
  MAX_THREADS_FOR_ANALYSIS: 200,
  MAX_ISSUES_SEARCH: 30,
  MAX_RESULTS_DEFAULT: 20,
  MAX_RESULTS_MULTIPLIER: 2,
  CONTACTS_SEARCH_LIMIT: 50,
  CONTACTS_SEARCH_OFFSET: 20,
  CONTACTS_PAGE_SIZE: 20,
  /**
   * Candidate rows fetched (ranked by token-match relevance) before the
   * visible-field filter and final truncation to the caller's `limit` in
   * `ContactsService.searchContacts`. A blind-index LIKE matches on any single
   * shared trigram, so a popular query yields hundreds of weak candidates;
   * fetching a generous relevance-ranked pool ensures a genuine exact match
   * isn't truncated below incidental matches before the filter runs (#2030).
   */
  CONTACTS_SEARCH_CANDIDATE_POOL: 200,
  /**
   * Maximum rows the admin contact-search diagnostic will materialise via
   * `.getMany()` for inspection. Keeps memory + per-row KMS decrypt cost
   * bounded on accounts with very large contact lists or broad queries.
   * The total candidate count is reported separately via `.getCount()`.
   */
  CONTACTS_DEBUG_SCAN_CAP: 500,
  SEARCH_INDEX_TRIGRAM_PAD: 16,
  SUBSTRING_PREVIEW_LENGTH: 50,
  SUBSTRING_PREVIEW_LONG: 150,
  SUBSTRING_BODY_PREVIEW: 500,
  SUBSTRING_SUBJECT_SHORT: 30,
  SUBSTRING_SNIPPET_LENGTH: 200,
  SUBSTRING_EXPLANATION_MAX: 100,
  SUBSTRING_EXPLANATION_TRUNCATE: 97,
  THREAD_ID_PREVIEW: 12,
  PHISHING_CACHE_KEY_PART_LENGTH: 40,
  LLM_MAX_TOKENS: 500,
  LLM_TEMPERATURE: 0.3,
  LLM_CHUNK_SIZE: 8,
  LLM_CONTEXT_WINDOW: 2048,
  LLM_SENT_EMAILS_LIMIT: 30,
  LLM_QUICK_REPLY_MINUTES: 30,
  THREAD_ID_SHORT: 8,
  PRIORITY_LEARNING_SAMPLE_SIZE: 50,
  PRIORITY_LEARNING_MIN_SAMPLES: 15,
  PRIORITY_LEARNING_MAX_SAMPLES: 20,
  LLM_MAX_TOKENS_LARGE: 3000,
  LLM_MAX_TOKENS_MEDIUM: 2000,
  LLM_MAX_TOKENS_SMALL: 500,
  LLM_MAX_TOKENS_TINY: 400,
  LLM_MAX_TOKENS_EXPLANATION: 200,
  LLM_BODY_PREVIEW_LENGTH: 2000,
  LLM_MAX_TOKENS_VERY_SMALL: 150,
  LLM_REASONING_MAX_LENGTH: 200,
  LLM_BATCH_EXPLANATION_BASE: 3000,
  LLM_BATCH_EXPLANATION_PER_EMAIL: 200,
  // Max emails per batch LLM call for search relevance explanations
  LLM_BATCH_EXPLANATION_CHUNK_SIZE: 5,
  SUBJECT_WORDS_TOP_COUNT: 10,
  // Gmail/provider API batch sizes
  GMAIL_BATCH_SIZE: 50,
  PROVIDER_BATCH_SIZE: 50,
  // Email fetch limits for context analysis
  CONTEXT_RECENT_EMAILS: 300,
  CONTEXT_SENT_EMAILS: 150,
  // Writing style sample size
  WRITING_STYLE_SAMPLE: 20,
  // Email address preview length for message IDs
  MESSAGE_ID_LENGTH: 36,
  MESSAGE_ID_SUFFIX: 15,
  // Search relevance boost
  SEARCH_RELEVANCE_MULTIPLIER: 1.5,
  // CloudWatch dimensions limit
  CLOUDWATCH_MAX_DIMENSIONS: 8,
  // Random string generation
  RANDOM_BASE_36: 36,
  RANDOM_STRING_START: 2,
  RANDOM_STRING_LENGTH: 9,
  // LLM response preview length for error logging
  LLM_RESPONSE_PREVIEW_LENGTH: 300,
  // Default max results for email search across providers
  SEARCH_DEFAULT_RESULTS: 50,
  CONTEXT_COMPRESSION_TOTAL_THRESHOLD: 25,
  CONTEXT_COMPRESSION_PER_KEY_THRESHOLD: 8,
  CONTEXT_COMPRESSION_MAX_ITEMS_PER_KEY: 8,
  // Safety cap for CI local-DB search fallback (small seed datasets only)
  CI_LOCAL_DB_SEARCH_MAX: 500,
  // Base relevance score for the top local-DB search result
  CI_LOCAL_DB_BASE_SCORE: 80,
  // Score step reduction per result position
  CI_LOCAL_DB_SCORE_STEP: 5,
  // Minimum score for local-DB search results
  CI_LOCAL_DB_MIN_SCORE: 10,
  // How many of the most-recent emails to scan when building the contact thread list.
  // Covers most active inboxes without a full table scan.
  CONTACT_THREAD_EMAIL_SCAN: 1000,
  // Max existing action items to include in the prompt context for deduplication.
  LLM_EXISTING_ACTIONS_CAP: 20,
} as const;
