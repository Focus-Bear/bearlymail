/**
 * Performance budget constants (in milliseconds)
 * Use these instead of magic numbers for performance budgets
 */

export const PERFORMANCE_BUDGETS = {
  DECRYPTION: 100,
  LABEL_CONVERT: 100,
  PRIORITY_CALC: 200,
  PRIORITY_EXPLANATION: 3000,
  SLOW_QUERY_THRESHOLD: 1000,
  EMAIL_CONTENT_CLEAN: 3000,
  CONTEXT_ANALYSIS_TIMEOUT: 30000,
  THREAD_QUERY_PROCESS: 300,
  LLM_REQUEST_TIMEOUT: 3000,
  INBOX_TOTAL: 500,
  INBOX_PROCESS_TOTAL: 1000,
  THREAD_QUERY: 100,
  EMAIL_QUERY: 100,
  // Inbox category accordion: loading one category's threads. A category is a
  // subset of the inbox, so it gets the same totals as a full inbox load
  // (action mode is the slower "process" path), but is tracked under its own
  // operation name so category loads are visible separately from full loads.
  INBOX_CATEGORY_FETCH: 500,
  INBOX_CATEGORY_FETCH_PROCESS: 1000,
  // Resolving the requested category UUIDs (load + decrypt the user's categories)
  CATEGORY_SCOPE_RESOLVE: 50,
  // /emails/inbox-batch: the top accordions' category fetches, run in parallel
  INBOX_BATCH_PRELOAD: 1000,
  // Search relevance explanations budget (3 seconds for all search explanations)
  SEARCH_RELEVANCE_EXPLANATIONS: 3000,
  // Job performance budgets (in milliseconds)
  // 10 seconds (target from issue #34)
  JOB_REFINE_PRIORITY: 10000,
  // 15 seconds for batch of 5 emails
  JOB_REFINE_PRIORITY_BATCH: 15000,
  // 5 seconds per thread
  JOB_GENERATE_SUMMARY: 5000,
  // 5 seconds
  JOB_SYNC_EMAILS: 5000,
  // 10 seconds (queues multiple jobs)
  JOB_QUEUE_USER_SYNCS: 10000,
  // 5 seconds
  JOB_SCAN_HISTORY: 5000,
  // 2 seconds per email
  JOB_SCAN_HISTORY_EMAIL: 2000,
  // 2 seconds
  JOB_LEARN_FROM_STAR: 2000,
  // 5 seconds
  JOB_ANALYZE_CONTEXT: 5000,
  // 5 seconds
  JOB_ANALYZE_EMAIL_BATCH: 5000,
  // 5 seconds
  JOB_FINALIZE_CONTEXT_ANALYSIS: 5000,
  // Batch analysis operation budgets (10s total per batch)
  // 3 seconds - fetch threads from provider
  BATCH_FETCH_THREADS: 3000,
  // 1 second - process threads into payloads
  BATCH_PROCESS_THREADS: 1000,
  // 5 seconds - LLM call
  BATCH_LLM_ANALYSIS: 5000,
  // 1 second - save to database
  BATCH_SAVE_RESULTS: 1000,
  // 10 seconds total per batch
  BATCH_TOTAL: 10000,
} as const;
