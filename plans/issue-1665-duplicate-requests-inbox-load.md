# Plan: Fix Duplicate Requests During Inbox Load (#1665)

## Problem

When the inbox loads, several API endpoints are called **twice** (or more). This wastes bandwidth, increases server load, and can cause race conditions where stale responses overwrite fresh data. The duplicates stem from overlapping initialization paths and React StrictMode double-mounting in development.

## Root Cause Analysis

### 1. Overlapping initialization paths: `useInboxInitialization` + `useInboxModeChanges`

**Primary culprit.** Both hooks independently call `fetchEmails()`, `fetchBatchStatus()`, and `fetchTabCounts()` during the initial inbox load.

- **`useInboxInitialization`** (lines 97-117): Fires when `authLoading` becomes false and `user` is set. Calls `fetchEmails()` (or `refreshInPlace()`), `fetchBatchStatus()`, and `fetchTabCounts()` inside `Promise.all`.

- **`useInboxModeChanges`** (lines 52-75): Fires when `mode` changes AND `hasInitiallyLoaded` is true. On the very first load, after `useInboxInitialization` sets `hasInitiallyLoaded = true`, this effect runs. If the `prevModeForFetchRef` hasn't been set yet (race with `hasSetInitialModeRef`), it may fire a second round of the same three calls.

**The race window:** `useInboxInitialization` sets `hasInitiallyLoaded = true` *after* its fetches complete. `useInboxModeChanges`'s first guard (`hasSetInitialModeRef`) is supposed to skip the first run, but because both effects depend on the same external signals (`mode`, `hasInitiallyLoaded`, `user`), React can batch state updates in a way that both fire in the same commit cycle when `hasInitiallyLoaded` flips.

### 2. `useTabCounts` mount-time fetch + initialization fetch

`useTabCounts` has its own `useEffect` on mount (line 142 of `useTabCounts.ts`):
```ts
useEffect(() => {
  fetchTabCounts();
}, [fetchTabCounts]);
```

This fires independently of `useInboxInitialization`, which also calls `fetchTabCounts(false, filters)`. Result: **two** tab-count requests on every inbox mount — one unfiltered (from `useTabCounts` mount), one filtered (from initialization).

### 3. `useInboxCategorySync` → `updateStableCategoryOrder` → auto-expand → category fetch cascade

When `categorySummary` arrives, `useInboxCategorySync` calls `onUpdateStableCategoryOrder(summaryKeys)`. Inside `useCategoryFetch.updateStableCategoryOrder`, this auto-expands the first 3 categories (setting `expandedCategories`). The expansion effect in `useCategoryFetch` then fires `fetchCategoryEmails` for each.

If `refreshInPlace` (from the stale-while-revalidate path in `useInboxInitialization`) returns a fresh summary, `useInboxCategorySync` fires again, potentially re-triggering category fetches. The `loadedCategoryNamesRef` guard usually prevents duplicates, but there's a timing window during the first load where the ref hasn't been updated yet.

### 4. React StrictMode double-mount (development only)

`React.StrictMode` in `index.tsx` causes all effects to run twice in development. This doubles every unguarded fetch in `useInboxInitialization`, `useTabCounts`, and `useInboxModeChanges`. While this is dev-only, it makes the problem appear worse and masks the real production duplicates.

### 5. `refreshInPlace` during stale-while-revalidate + `fetchEmails` during no-cache path

In `useInboxInitialization`, the cached path calls `refreshInPlace()` while the non-cached path calls `fetchEmails()`. Both ultimately hit `/emails/inbox-summary`. If the cache expires between the cache-check and the actual request (unlikely but possible under slow networks), both paths could run, causing duplicate summary fetches.

## Proposed Fix

### Phase 1: Deduplicate initialization fetches (High Impact)

**File: `client/src/hooks/useInboxInitialization.ts`**

1. Add an `AbortController`-based guard: create an abort controller in the effect, pass its signal to all fetch calls, and abort on cleanup. This prevents StrictMode double-fetches and stale concurrent runs.

2. Replace the `isInitializingRef` boolean with the abort controller pattern — the controller itself serves as the "in-flight" guard.

```ts
useEffect(() => {
  if (authLoading || !user || hasInitiallyLoaded) return;
  const controller = new AbortController();
  runInitialization(controller.signal);
  return () => controller.abort();
}, [authLoading, user, hasInitiallyLoaded]);
```

**File: `client/src/hooks/useInboxModeChanges.ts`**

3. Remove the duplicate `fetchBatchStatus()` and `fetchTabCounts()` calls from the mode-change effect's initial-load path. The initialization hook already handles these. Only call them on *actual* mode changes (when `prevModeForFetchRef.current !== mode` AND `hasSetInitialModeRef.current === true`).

4. Tighten the `hasSetInitialModeRef` guard: set it synchronously on first render (via `useRef(true)` initialized to `true` if `hasInitiallyLoaded` is already true), not after the first effect run.

### Phase 2: Eliminate redundant `useTabCounts` self-fetch (Medium Impact)

**File: `client/src/hooks/useTabCounts.ts`**

5. Remove the mount-time `useEffect` that calls `fetchTabCounts()` unconditionally. Tab counts are already fetched by `useInboxInitialization` and `useInboxModeChanges`. The standalone mount fetch is redundant and produces an unfiltered request that returns wrong counts when filters are active.

### Phase 3: Guard category fetch cascade (Low-Medium Impact)

**File: `client/src/hooks/useCategoryFetch.ts`**

6. Add a `fetchSessionRef` pattern (similar to `useEmailFetching`) to `useCategoryFetch` so that when `categorySummary` changes (due to `refreshInPlace`), stale expansion effects don't re-trigger fetches for already-loaded categories. The current `loadedCategoryNamesRef` guard is almost sufficient, but reads from a ref that may not yet reflect the latest Redux state during the same render cycle.

7. In the expansion effect, skip categories where `loadedCategoryNamesRef.current` OR `loadingCategoryNamesRef.current` already contains the key — this is already done but should also check the `categorySlice` status (which is the newer source of truth) to avoid dual-write inconsistencies.

### Phase 4: Add request deduplication utility (Optional, Future-Proof)

8. Create a `useDeduplicatedFetch` utility or integrate a lightweight request-deduplication layer (e.g., a pending-request map keyed by URL+params) in the axios instance. This provides defense-in-depth: even if effect orchestration has bugs, identical concurrent requests are collapsed into one.

```ts
// utils/deduplicateFetch.ts
const pending = new Map<string, Promise<any>>();
export function deduplicatedGet(url: string): Promise<any> {
  if (pending.has(url)) return pending.get(url)!;
  const p = axios.get(url).finally(() => pending.delete(url));
  pending.set(url, p);
  return p;
}
```

## Files to Modify

| File | Change |
|------|--------|
| `client/src/hooks/useInboxInitialization.ts` | AbortController guard, remove `isInitializingRef` |
| `client/src/hooks/useInboxModeChanges.ts` | Remove duplicate initial-load fetches, tighten guard |
| `client/src/hooks/useTabCounts.ts` | Remove mount-time `useEffect` self-fetch |
| `client/src/hooks/useCategoryFetch.ts` | Add fetch-session guard for expansion effect |
| `client/src/utils/deduplicateFetch.ts` | **New file** — request deduplication utility (Phase 4) |

## Testing Strategy

1. **Network tab audit**: Open Chrome DevTools Network tab, navigate to inbox. Verify each endpoint is called exactly once during initial load (filter by `/emails/inbox-summary`, `/emails/tab-counts`, `/batch-schedule/status`, `/context`).

2. **Mode switch test**: Switch between Triage → Action → Follow Up. Verify `fetchEmails` fires once per switch, not on initial load repeat.

3. **Filter change test**: Apply a priority filter. Verify `tab-counts` is fetched once with the new filter params, not twice.

4. **StrictMode resilience**: Keep StrictMode enabled in dev. Verify no duplicate network requests despite double-mount.

5. **Existing tests**: Run `useInboxInitialization.test.ts`, `useEmailFetching.test.ts`, `useEmailManagement.test.ts` — ensure no regressions.

## Risks & Mitigations

- **AbortController may abort legitimate in-flight requests on fast re-renders**: Mitigated by only aborting on cleanup (unmount or dep change), which is the intended React pattern.
- **Removing `useTabCounts` mount fetch could break pages that use tab counts outside the inbox**: Audit all consumers of `useTabCounts` — if any exist outside InboxProvider, they'll need their own fetch trigger.
- **Phase 4 deduplication cache could serve stale data if the same URL is called with different auth state**: Key the dedup map on URL + auth token hash, or clear on auth changes.
