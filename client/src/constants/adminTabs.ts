export const ADMIN_TAB_WAITLIST = 'waitlist' as const;
export const ADMIN_TAB_SUBSCRIPTIONS = 'subscriptions' as const;
export const ADMIN_TAB_JOBS = 'jobs' as const;
export const ADMIN_TAB_TOKEN_USAGE = 'token-usage' as const;
export const ADMIN_TAB_QUEUE_DASHBOARD = 'queue-dashboard' as const;
export const ADMIN_TAB_GITHUB_DEBUG = 'github-debug' as const;

export type AdminTab = typeof ADMIN_TAB_WAITLIST | typeof ADMIN_TAB_SUBSCRIPTIONS | typeof ADMIN_TAB_JOBS | typeof ADMIN_TAB_TOKEN_USAGE | typeof ADMIN_TAB_QUEUE_DASHBOARD | typeof ADMIN_TAB_GITHUB_DEBUG;





