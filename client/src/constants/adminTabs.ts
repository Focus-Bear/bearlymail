export const ADMIN_TAB_WAITLIST = 'waitlist' as const;
export const ADMIN_TAB_SUBSCRIPTIONS = 'subscriptions' as const;
export const ADMIN_TAB_JOBS = 'jobs' as const;
export const ADMIN_TAB_TOKEN_USAGE = 'token-usage' as const;
export const ADMIN_TAB_LOCAL_MODEL = 'local-model' as const;
export const ADMIN_TAB_QUEUE_DASHBOARD = 'queue-dashboard' as const;
export const ADMIN_TAB_GITHUB_DEBUG = 'github-debug' as const;
export const ADMIN_TAB_CONTEXT_ANALYSIS = 'context-analysis' as const;
export const ADMIN_TAB_FEEDBACK = 'feedback' as const;
export const ADMIN_TAB_EMAIL_DECRYPT = 'email-decrypt' as const;
export const ADMIN_TAB_REENCRYPTION = 'reencryption' as const;
export const ADMIN_TAB_CONTACTS_DEBUG = 'contacts-debug' as const;

export type AdminTab =
  | typeof ADMIN_TAB_WAITLIST
  | typeof ADMIN_TAB_SUBSCRIPTIONS
  | typeof ADMIN_TAB_JOBS
  | typeof ADMIN_TAB_TOKEN_USAGE
  | typeof ADMIN_TAB_LOCAL_MODEL
  | typeof ADMIN_TAB_QUEUE_DASHBOARD
  | typeof ADMIN_TAB_GITHUB_DEBUG
  | typeof ADMIN_TAB_CONTEXT_ANALYSIS
  | typeof ADMIN_TAB_FEEDBACK
  | typeof ADMIN_TAB_EMAIL_DECRYPT
  | typeof ADMIN_TAB_REENCRYPTION
  | typeof ADMIN_TAB_CONTACTS_DEBUG;
