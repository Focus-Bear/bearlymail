export const ADMIN_TAB_WAITLIST = 'waitlist' as const;
export const ADMIN_TAB_SUBSCRIPTIONS = 'subscriptions' as const;
export const ADMIN_TAB_JOBS = 'jobs' as const;

export type AdminTab = typeof ADMIN_TAB_WAITLIST | typeof ADMIN_TAB_SUBSCRIPTIONS | typeof ADMIN_TAB_JOBS;





