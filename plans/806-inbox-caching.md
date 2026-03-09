# Plan: #806 — Use caching for inbox — avoid full refresh on archive/navigation

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/806

---

## Problem Analysis

Every time the user navigates away from the inbox and returns (or performs an action like archive), the entire email list is re-fetched from the server. This causes:

1. A loading spinner/blank state even though the data hasn't changed.
2. Slow perceived performance — especially on mobile or slow connections.
3. Disrupted UX: user loses their scroll position and category state.

The desired behaviour:
- Returning to inbox shows the cached list instantly (stale-while-revalidate pattern).
- Archiving an email removes it locally (optimistic update) without triggering a full re-fetch.
- Incremental updates instead of full re-fetch on navigation.

---

## Root Cause Hypothesis

The inbox currently fetches emails via a Redux thunk (or direct axios call) on component mount. There is no caching layer — each mount triggers a fresh API call. The Redux store holds emails, but the fetch is triggered on mount regardless of what's already in the store.

Key files to investigate:
- `client/src/hooks/useInboxState.ts` — manages email fetch
- `client/src/store/slices/emailSlice.ts` — Redux store for emails
- `client/src/pages/Inbox.tsx` — triggers fetch on mount

---

## Implementation Steps

### Step 1: Cache emails in Redux with a "last fetched" timestamp

**File:** `client/src/store/slices/emailSlice.ts`
- Add `lastFetchedAt: number | null` to the slice state (Unix timestamp ms).
- Update it when emails are successfully loaded.

**File:** `client/src/hooks/useInboxState.ts` (or wherever fetch is triggered)
- Before fetching, check: `if (lastFetchedAt && Date.now() - lastFetchedAt < CACHE_TTL_MS) return;`
- Define `CACHE_TTL_MS = 60_000` (1 minute) as the staleness threshold.
- On return navigation, if cache is fresh, skip the fetch and use the cached data (instant render).
- After the skip, trigger a background revalidation (silent fetch, merge results).

### Step 2: Incremental update after archive

**File:** `client/src/store/slices/emailSlice.ts`
- The `removeEmail` and `addOptimisticArchive` actions already exist — these update the store without a full re-fetch.
- Ensure these are the only mutations triggered on archive (no full re-fetch on archive action).

**File:** `client/src/hooks/useInboxState.ts`
- Remove any `fetchEmails()` call triggered by archive events.
- Trust the optimistic update as the source of truth until the next background sync.

### Step 3: Stale-while-revalidate on navigation

**File:** `client/src/hooks/useInboxState.ts`
- When the inbox mounts and cache exists (even if stale):
  1. Immediately render the cached data (no spinner).
  2. Fire a background fetch to get fresh data.
  3. When the background fetch completes, merge: add new emails, update modified ones, but do **not** add back emails that were optimistically archived.
  4. Update `lastFetchedAt`.

**File:** `client/src/store/slices/emailSlice.ts`
- Add a `mergeEmails(newEmails)` action that merges server emails with the current state while respecting `optimisticArchives` (don't restore archived emails).

### Step 4: Persist cache across page refreshes (optional, phase 2)

- Consider using `redux-persist` or `sessionStorage` to persist the email list across page refreshes.
- Only implement if the team decides this is worth the complexity.
- Scope for this issue: in-memory Redux cache is sufficient for navigation caching.

### Step 5: Cache invalidation

The cache should be invalidated (force re-fetch) on:
- Email delivery (new emails arrive via polling/webhook).
- Manual "Refresh" action by user.
- After a configurable TTL (1 minute).
- After re-categorise or re-analyse operations complete.

**File:** `client/src/hooks/useInboxState.ts`
- Add a `refreshInbox()` function that clears `lastFetchedAt` and triggers a full fetch.
- Expose this via context or hook for use by delivery and other operations.

---

## Files to Modify

| File | Change |
|------|--------|
| `client/src/store/slices/emailSlice.ts` | Add `lastFetchedAt`, `mergeEmails` action |
| `client/src/hooks/useInboxState.ts` | Implement cache check, background revalidation, incremental merge |
| `client/src/pages/Inbox.tsx` | Remove any full-fetch on archive; use `refreshInbox()` for explicit refreshes only |
| `client/src/store/selectors/emailSelectors.ts` | Add `selectLastFetchedAt` selector |

---

## Testing Approach

1. **Functional test — cache hit:**
   - Load inbox → emails appear. Navigate away, come back immediately.
   - Assert: no loading spinner, emails appear instantly.
   - Assert: background fetch fires silently (check network tab).

2. **Functional test — cache miss:**
   - Wait > 1 minute, navigate back.
   - Assert: loading state shows briefly, new data is fetched.

3. **Functional test — optimistic archive preserved:**
   - Archive email A. Background fetch returns email A in the response.
   - Assert: email A does NOT reappear in the list (optimistic archive takes precedence).

4. **Unit test:**
   - `mergeEmails`: given current state with optimisticArchives = [A], and new server emails including A, verify A is not in the merged result.
   - Cache TTL: mock `Date.now()`, verify fetch fires after TTL expires.

---

## Notes

- React Query or SWR would be ideal for this pattern (stale-while-revalidate is built-in), but migrating to these libraries is out of scope for this issue. This plan works within the existing Redux architecture.
- The `deliveredEmailIds` / delivery mechanism should also call `refreshInbox()` to ensure new emails appear promptly.
- Test on mobile: the perceived performance improvement should be most noticeable on mobile where fetches take longer.
