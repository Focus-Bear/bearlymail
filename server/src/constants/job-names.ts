export const JOB_NAMES = {
  // Email sync scheduling (cron coordinators)
  SCHEDULE_EMAIL_FETCH_JOBS: "schedule-email-fetch-jobs",
  SCHEDULE_EXTENDED_EMAIL_FETCH_JOBS: "schedule-extended-email-fetch-jobs",
  SCHEDULE_VERIFY_INBOX_STATUS: "schedule-verify-inbox-status",
  SCHEDULE_CONTACT_SYNC_JOBS: "schedule-contact-sync-jobs",

  // Email fetching workers
  FETCH_USER_EMAILS: "fetch-user-emails",
  FETCH_USER_EMAILS_EXTENDED: "fetch-user-emails-extended",
  VERIFY_USER_INBOX_STATUS: "verify-user-inbox-status",

  // Gmail / provider sync
  SYNC_GMAIL: "sync-gmail",
  SYNC_ALL_USERS: "sync-all-users",
  SYNC_ALL_USERS_URGENT: "sync-all-users-urgent",
  QUEUE_USER_SYNCS_URGENT: "queue-user-syncs-urgent",
  SYNC_EMAILS: "sync-emails",

  // Onboarding / history scan
  SCAN_HISTORY: "scan-history",
  SCAN_HISTORY_EMAIL: "scan-history-email",
  ANALYZE_SCAN_RESULTS: "analyze-scan-results",

  // Priority refinement
  REFINE_PRIORITY: "refine-priority",
  REFINE_PRIORITY_BATCH: "refine-priority-batch",
  REFINE_PRIORITY_BACKGROUND: "refine-priority-background",

  // Summary generation
  GENERATE_SUMMARY: "generate-summary",
  GENERATE_SUMMARY_BACKGROUND: "generate-summary-background",

  // Context analysis
  ANALYZE_CONTEXT: "analyze-context",
  ANALYZE_CONTEXT_BATCH: "analyze-context-batch",
  FINALIZE_CONTEXT_ANALYSIS: "finalize-context-analysis",
  COMPRESS_CONTEXT: "compress-context",
  CONSOLIDATE_CATEGORIES: "consolidate-categories",
  CLEANUP_STUCK_ANALYSES: "cleanup-stuck-analyses",

  // Priority retry / stuck detection
  DETECT_STUCK_PRIORITIES: "detect-stuck-priorities",
  FINALIZE_STALLED_PRIORITY_RUNS: "finalize-stalled-priority-runs",
  MINE_PRIORITY_RULES: "mine-priority-rules",

  // Writing style & learning
  CHECK_WRITING_STYLE_LEARNING: "check-writing-style-learning",
  LEARN_FROM_STAR: "learn-from-star",
  // Debounced per-user job (enqueued on reply-send) that batch-extracts
  // common Q&A pairs from the user's recent sent emails.
  LEARN_QA_FROM_SENT: "learn-qa-from-sent",

  // Snooze
  CHECK_EXPIRED_SNOOZES: "check-expired-snoozes",
  UNSNOOZE_THREAD: "unsnooze-thread",

  // Scheduled emails
  SEND_SCHEDULED_EMAILS: "send-scheduled-emails",

  // Follow-ups
  BULK_SEND_FOLLOW_UPS: "bulk-send-follow-ups",
  GENERATE_FOLLOW_UP_DRAFT: "generate-follow-up-draft",

  // Archive
  ARCHIVE_EMAIL: "archive-email",
  ARCHIVE_EMAIL_PROVIDER_SYNC: "archive-email-provider-sync",

  // Auto-responder
  AUTO_RESPONDER: "auto-responder",

  // Suggested replies
  GENERATE_SUGGESTED_REPLIES: "generate-suggested-replies",

  // Contact sync
  SYNC_CONTACTS: "sync-contacts",

  // Contact blind-index backfill (admin-triggered, idempotent). Regenerates
  // searchTokens for every user's contacts with NULL/empty tokens, running
  // under each user's KMS key so encrypted PII decrypts correctly (#2030).
  BACKFILL_CONTACT_SEARCH_TOKENS: "backfill-contact-search-tokens",

  // Category-rule categoryId FK backfill (admin-triggered, idempotent). Links
  // each rule to its UserContext by decrypting categoryName under each user's
  // KMS key, since renaming a category used to silently break name-keyed rules.
  BACKFILL_CATEGORY_RULE_IDS: "backfill-category-rule-ids",

  // GitHub metadata
  FETCH_GITHUB_METADATA: "fetch-github-metadata",

  // Automated email workflows (#1483)
  EVALUATE_WORKFLOWS: "evaluate-workflows",

  // Data retention
  CLEANUP_INACTIVE_ACCOUNTS: "cleanup-inactive-accounts",
  PRUNE_OLD_DATA: "prune-old-data",

  // Encryption migration (admin-triggered, idempotent)
  REENCRYPT_USER_DATA: "reencrypt-user-data",
  // Fan-out job that, in the worker, queries users and bulk-inserts per-user
  // REENCRYPT_USER_DATA jobs. Keeps `/start` off the HTTP request path so
  // enqueueing for thousands of users never 504s.
  REENCRYPT_FANOUT_ALL: "reencrypt-fanout-all",
  // Read-only data-at-rest health scan. A job (not a sync endpoint) because the
  // per-column SQL scans large tables (emails, email_threads) and exceeded the
  // ALB idle timeout, leaving the dashboard stuck loading.
  REENCRYPT_HEALTH_SCAN: "reencrypt-health-scan",

  // Audit log archival (SAQ Q52: nightly export of rows older than 90 days to S3 Glacier)
  AUDIT_LOG_ARCHIVE: "audit-log-archive",

  // Bulk email export (#2024): builds a password-protected ZIP of the user's
  // emails off the HTTP request path and uploads it to S3. The synchronous
  // export used to 504 at the 60s ALB idle timeout for large mailboxes.
  EXPORT_EMAILS: "export-emails",

  // Daily cleanup of expired rows from the debug_data table (see
  // DebugCleanupService). Must be registered here so the queue.module.ts boot
  // loop creates it before DebugCleanupService.onModuleInit tries to schedule.
  DEBUG_DATA_CLEANUP: "debug-data-cleanup",

  // Local-model training data feed: a weekly cron that fans out per-user export
  // jobs writing label-rich JSON to the models bucket's training-data/ prefix
  // for the Fargate trainer to consume.
  SCHEDULE_TRAINING_DATA_EXPORT: "schedule-training-data-export",
  EXPORT_TRAINING_DATA: "export-training-data",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
