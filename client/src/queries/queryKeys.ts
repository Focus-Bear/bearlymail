/**
 * Centralised query key factory for TanStack Query.
 *
 * All query keys live here so that invalidation and cache reads
 * are consistent across the codebase.
 *
 * Introduced in: plan #1225 / PR #1236 — Wave 1 (static endpoints)
 */

export const contactKeys = {
  all: ['contacts'] as const,
  types: ['contact-types'] as const,
  typesByEmails: (emails: string[]) => ['contact-types-by-emails', [...emails].sort().join(',')] as const,
  frequent: (limit: number) => ['contacts', 'frequent', limit] as const,
} as const;

export const settingsKeys = {
  connectedAccounts: ['connected-accounts'] as const,
  batchStatus: ['batch-status'] as const,
  onboardingStatus: ['onboarding-status'] as const,
  userProfile: ['user-profile'] as const,
} as const;

export const emailKeys = {
  all: ['emails'] as const,
  summary: (mode: string) => [...emailKeys.all, 'summary', mode] as const,
  category: (mode: string, category: string, filters: Record<string, unknown>) =>
    [...emailKeys.all, 'category', mode, category, filters] as const,
  detail: (threadId: string) => [...emailKeys.all, 'detail', threadId] as const,
} as const;
