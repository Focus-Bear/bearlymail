# Plan: Introduce TanStack Query (React Query) for Data Fetching

**Issue:** #1225 (Critical Issue #2 + #3) | #1224 (Duplicate Requests)
**Planned by:** Monk of Modularity 🧘
**Phase:** 1.1 (Foundation — Must Do First)

## Problem

BearlyMail has a manual 3-layer cache (localStorage → Redux → server) implemented in `useEmailFetching` (720 lines). This causes:

1. **3 code paths for the same data**: `useInboxInitialization` checks Redux freshness → falls back to localStorage → falls back to fetch
2. **Stale data served silently**: `serveCategoryFromCacheAndRefresh` dispatches cached data then fires an untracked `.then()` background refresh — failures leave stale data on screen with no indication
3. **Manual session tracking**: `fetchSessionRef` silently abandons in-flight requests by incrementing a counter
4. **10+ Redux dispatches per fetch**: `setFetchError`, `clearCategoryState`, `setEmails`, `setCurrentOffset`, `setHasMore`, `setTotalCount`, `setCategorySummary`, `setDecrypting`, `setLoading`, etc.
5. **Thundering herd on `/contacts/types`**: 5 independent callers, 15+ requests per page load (#1224)
6. **No request deduplication**: Each hook/component makes its own `axios.get`

## Current Architecture

```
useEmailFetching (720 lines)
├── fetchInboxSummary() → axios.get → dispatch 10+ actions → localStorage.setItem
├── fetchCategoryEmailsImpl() → axios.get → dispatch 5+ actions → localStorage.setItem  
├── serveCategoryFromCacheAndRefresh() → localStorage.getItem → dispatch → silent background fetch
├── serveSummaryFromCacheAndRefresh() → localStorage.getItem → dispatch → silent background fetch
├── refreshInPlace() → iterate all loaded categories → parallel fetches → unstable_batchedUpdates
├── usePollingWithBackoff() → custom backoff/retry logic
└── fetchSessionRef → manual request abandonment
```

## Proposed Solution: TanStack Query

### Step 1: Install and configure

```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

```typescript
// providers/QueryProvider.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,       // 1 min default
      gcTime: 5 * 60_000,      // 5 min garbage collection
      retry: 2,
      refetchOnWindowFocus: false, // BearlyMail already handles this
    },
  },
});
```

### Step 2: Define query keys

```typescript
// queries/queryKeys.ts
export const emailKeys = {
  all: ['emails'] as const,
  summary: (mode: InboxMode) => [...emailKeys.all, 'summary', mode] as const,
  category: (mode: InboxMode, category: string, filters: FilterParams) => 
    [...emailKeys.all, 'category', mode, category, filters] as const,
  detail: (threadId: string) => [...emailKeys.all, 'detail', threadId] as const,
};

export const contactKeys = {
  types: ['contact-types'] as const,
  typesByEmails: (emails: string[]) => ['contact-types-by-emails', emails.sort().join(',')] as const,
  frequent: (limit: number) => ['contacts', 'frequent', limit] as const,
};

export const settingsKeys = {
  connectedAccounts: ['connected-accounts'] as const,
  batchStatus: ['batch-status'] as const,
  onboardingStatus: ['onboarding-status'] as const,
  userProfile: ['user-profile'] as const,
};
```

### Step 3: Create query hooks (replacing useEmailFetching)

```typescript
// queries/useInboxSummaryQuery.ts
export function useInboxSummaryQuery(mode: InboxMode, filters: FilterParams) {
  return useQuery({
    queryKey: emailKeys.summary(mode),
    queryFn: () => fetchInboxSummaryAPI(mode, filters),
    staleTime: 60_000,
    placeholderData: keepPreviousData, // replaces SWR pattern
  });
}

// queries/useCategoryEmailsQuery.ts  
export function useCategoryEmailsQuery(mode: InboxMode, category: string, filters: FilterParams) {
  return useInfiniteQuery({
    queryKey: emailKeys.category(mode, category, filters),
    queryFn: ({ pageParam = 0 }) => fetchCategoryEmailsAPI(mode, category, filters, pageParam),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
    staleTime: 60_000,
    enabled: !!category, // only fetch when category is expanded
  });
}

// queries/useContactTypesQuery.ts — fixes #1224
export function useContactTypesQuery() {
  return useQuery({
    queryKey: contactKeys.types,
    queryFn: () => axios.get(`${API_URL}/contacts/types`).then(r => r.data),
    staleTime: 5 * 60_000, // 5 min — configs rarely change
  });
}
```

### Step 4: Replace localStorage cache entirely

**Delete:** `utils/emailCache.ts` (getCachedSummary, setCachedSummary, getCachedCategoryEmails, setCachedCategoryEmails)

TanStack Query replaces ALL of this:
- **Stale-while-revalidate**: Built-in via `staleTime` + `placeholderData: keepPreviousData`
- **Request deduplication**: Automatic — same queryKey = same request
- **Background refresh**: Built-in via `refetchInterval` or `refetchOnWindowFocus`
- **Cache persistence**: Optional `persistQueryClient` plugin if we want to survive page reload (replaces localStorage)
- **Request cancellation**: Built-in via AbortController (replaces `fetchSessionRef`)

### Step 5: Reduce Redux to UI-only state

After React Query owns server state, `emailSlice` shrinks to:
- `optimisticallyArchived` / `optimisticallySnoozed` (optimistic UI)
- `animatingOut` (animation state)
- `loadingModeSwitch` (UI transition flag)

All data fetching state (`emails`, `categorySummary`, `loading`, `decrypting`, `refreshing`, `fetchError`, `hasMore`, `totalCount`, `currentOffset`, `loadedCategoryNames`, `loadingCategoryNames`, `exhaustedCategoryNames`, `lastFetchedAt`, `summaryLoading`) moves to React Query.

### Step 6: Mutation hooks for email actions

```typescript
// queries/useArchiveMutation.ts
export function useArchiveMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emailId: string) => archiveEmailAPI(emailId),
    onMutate: async (emailId) => {
      // Optimistic update — remove from visible list
      await queryClient.cancelQueries({ queryKey: emailKeys.all });
      // snapshot + optimistic remove
    },
    onError: (err, emailId, context) => {
      // Rollback
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.all });
    },
  });
}
```

## Endpoints → Cache Configuration

### Stable Data (long TTL, shared across components)

| Endpoint | Query Key | staleTime | Notes |
|----------|-----------|-----------|-------|
| `GET /contacts/types` | `contactKeys.types` | 5 min | Fixes #1224 — 15 calls → 1 |
| `GET /contacts/contact-types-by-emails` | `contactKeys.typesByEmails(emails)` | 2 min | Batch-keyed |
| `GET /emails/connected-accounts` | `settingsKeys.connectedAccounts` | 5 min | Changes on connect/disconnect only |
| `GET /users/me` | `settingsKeys.userProfile` | 5 min | 4 callers → 1 |
| `GET /summarize/rules` | `['summarize-rules']` | 10 min | Admin-configured |
| `GET /onboarding/status` | `settingsKeys.onboardingStatus` | 5 min | Changes on explicit user action |
| `GET /github/project-status-options` | `['github-project-options']` | 10 min | Near-static |

### Dynamic Data (short TTL, frequently invalidated)

| Endpoint | Query Key | staleTime | Notes |
|----------|-----------|-----------|-------|
| `GET /emails/inbox-summary` | `emailKeys.summary(mode)` | 60s | Replace localStorage SWR |
| `GET /emails/inbox` (category) | `emailKeys.category(mode, cat, filters)` | 60s | `useInfiniteQuery` for pagination |
| `GET /emails/batch-status` | `settingsKeys.batchStatus` | 30s | Quasi-static between deliveries |
| `GET /emails/tab-counts` | `['tab-counts', mode]` | 30s | Invalidate on email actions |

### No Cache (volatile / one-shot)

| Endpoint | Why |
|----------|-----|
| `GET /emails/{id}` | Needs fresh read/unread state |
| `GET /emails/{id}/thread` | Thread changes with replies |
| `GET /suggested-replies/*` | AI-generated, one-shot |
| `POST /emails/*` | Mutations, not queries |

## Migration Plan (Incremental)

### Wave 1: Static endpoints (lowest risk, biggest request reduction)
1. `useContactTypesQuery` — replaces 5 independent callers, fixes #1224
2. `useConnectedAccountsQuery` — replaces 2 callers
3. `useUserProfileQuery` — replaces 4 callers

### Wave 2: Inbox summary
4. `useInboxSummaryQuery` — replaces `serveSummaryFromCacheAndRefresh`
5. Delete `getCachedSummary` / `setCachedSummary` from emailCache

### Wave 3: Category emails
6. `useCategoryEmailsQuery` (useInfiniteQuery) — replaces `fetchCategoryEmailsImpl` + `serveCategoryFromCacheAndRefresh`
7. Delete `getCachedCategoryEmails` / `setCachedCategoryEmails`
8. Delete `utils/emailCache.ts` entirely

### Wave 4: Mutations + optimistic updates
9. `useArchiveMutation`, `useSnoozeMutation`, `useStarMutation`
10. Reduce `emailSlice` to UI-only state

### Wave 5: Cleanup
11. Delete `usePollingWithBackoff` (replaced by `refetchInterval`)
12. Delete `fetchSessionRef` pattern (replaced by AbortController)
13. Decompose remaining `useEmailFetching` into individual query hooks

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Large migration surface | Wave-based approach — each wave is independently shippable |
| React Query + Redux coexistence | During migration, both exist. React Query owns server state, Redux owns UI state. No conflicts |
| Offline/persistence needs | `persistQueryClient` plugin available if needed (currently localStorage serves this) |
| Bundle size increase | @tanstack/react-query is ~13KB gzipped — offset by deleting emailCache.ts + usePollingWithBackoff |

## Estimated Effort
- Wave 1 (static endpoints): **S** (1 day)
- Wave 2 (summary): **M** (2 days)
- Wave 3 (category emails): **L** (3-4 days)
- Wave 4 (mutations): **M** (2-3 days)
- Wave 5 (cleanup): **S** (1 day)
- **Total: L (8-10 days)**

## Dependencies
- None (this is a Phase 1 foundation task)
- Blocks: Phase 2 data pipeline consolidation
