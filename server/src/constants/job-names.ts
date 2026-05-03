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
  CLEANUP_STUCK_ANALYSES: "cleanup-stuck-analyses",

  // Priority retry / stuck detection
  DETECT_STUCK_PRIORITIES: "detect-stuck-priorities",
  FINALIZE_STALLED_PRIORITY_RUNS: "finalize-stalled-priority-runs",

  // Writing style & learning
  CHECK_WRITING_STYLE_LEARNING: "check-writing-style-learning",
  LEARN_FROM_STAR: "learn-from-star",

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

  // GitHub metadata
  FETCH_GITHUB_METADATA: "fetch-github-metadata",

  // Automated email workflows (#1483)
  EVALUATE_WORKFLOWS: "evaluate-workflows",

  // Data retention
  CLEANUP_INACTIVE_ACCOUNTS: "cleanup-inactive-accounts",

  // Encryption migration (admin-triggered, idempotent)
  REENCRYPT_USER_DATA: "reencrypt-user-data",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
