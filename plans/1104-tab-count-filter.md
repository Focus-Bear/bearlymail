# Plan: fix(#1104) — Tab counts should respect active filters

## Issue Summary

The Triage tab shows "580" while the inbox accordion only shows 3 emails under an active
priority filter. The root cause: **the tab-count API call ignores `categories` and `accountIds`
filters** — only `minPriority` is wired up. This means badge numbers are always total-inbox counts
regardless of which category or account filters are active.

---

## Root Cause

Three layers all have the same gap:

### 1. Client — `client/src/hooks/useTabCounts.ts`

**`fetchTabCounts` signature (line 37):**
```ts
const fetchTabCounts = useCallback(async (force = false, minPriority?: number | null) => {
```

Only `minPriority` is accepted as a parameter. `categories` and `accountIds` are never passed in.

**API call construction (lines 62–65):**
```ts
const params = minPriority !== null && minPriority !== undefined
  ? `?minPriority=${minPriority}`
  : '';
const response = await axios.get(`${API_URL}/emails/tab-counts${params}`);
```

Only `minPriority` is serialized to the query string. `categories` and `accountIds` are never sent.

**Cache key (lines 40–42):**
```ts
const cacheKey = minPriority !== undefined && minPriority !== null
  ? `${TAB_COUNTS_CACHE_KEY}_p${minPriority}`
  : TAB_COUNTS_CACHE_KEY;
```

Cache is only keyed by `minPriority`, so different `accountIds`/`categories` combinations would
return the same cached result.

**`updateTabCountsOptimistically` (lines 104–112):**
Uses hardcoded `TAB_COUNTS_CACHE_KEY` instead of the computed `cacheKey`, so optimistic updates
always write to the un-filtered cache regardless of which filter was active. This is a secondary
bug that will need fixing alongside the main one.

### 2. Client — `client/src/hooks/useInboxState.ts`

**Filter-change effect (lines 164–178):**
```ts
useEffect(() => {
  if (prevMinPriorityRef.current === undefined) {
    prevMinPriorityRef.current = inboxFilters.filters.minPriority;
    return;
  }
  if (prevMinPriorityRef.current !== inboxFilters.filters.minPriority) {
    prevMinPriorityRef.current = inboxFilters.filters.minPriority;
    fetchTabCounts(true, inboxFilters.filters.minPriority).catch(err => ...);
  }
}, [inboxFilters.filters.minPriority, fetchTabCounts]);
```

Only watches `minPriority`. Changes to `filters.categories` or `filters.accountIds` do NOT trigger
a tab count refresh. The effect dependency array and the data passed to `fetchTabCounts` both omit
the other two filter dimensions.

Similarly, `useInboxInitialization.ts` (lines 85, 106) and `useInboxModeChanges.ts` (line 74) call
`fetchTabCounts(force, minPriority)` — both also only pass `minPriority`.

### 3. Server — `server/src/emails/emails.controller.ts`

**`getTabCounts` handler (lines 213–238):**
```ts
@Get("tab-counts")
async getTabCounts(
  @Request() req,
  @Query("minPriority") minPriority?: string,
) {
  const filters = minPriority !== undefined
    ? { minPriority: parseInt(minPriority, 10) }
    : undefined;
  ...
}
```

The endpoint only accepts `minPriority`. It does not declare `@Query("categories")` or
`@Query("accountIds")` params, so even if the client sent them they would be silently ignored.

The underlying `emailsService.getInboxSummary()` already supports both `categoryIds` and
`accountIds` in its `filters` parameter (see `emails.service.ts` lines 310–315, 502–513). The
fix only needs to plumb those through the controller and the client hook.

---

## Fix Plan

### Server changes

#### `server/src/emails/emails.controller.ts` — lines 213–238

Add `@Query` decorators for `categories` and `accountIds`, parse them, and pass to `getInboxSummary`:

```ts
@Get("tab-counts")
async getTabCounts(
  @Request() req,
  @Query("minPriority") minPriority?: string,
  @Query("categories") categories?: string,     // comma-separated category IDs
  @Query("accountIds") accountIds?: string,     // comma-separated account IDs
) {
  const { userId } = req.user;
  const filters: {
    minPriority?: number;
    categoryIds?: string[];
    accountIds?: string[];
  } = {};

  if (minPriority !== undefined) {
    filters.minPriority = parseInt(minPriority, 10);
  }
  if (categories) {
    filters.categoryIds = categories.split(",").filter(Boolean);
  }
  if (accountIds) {
    filters.accountIds = accountIds.split(",").filter(Boolean);
  }

  const hasFilters = Object.keys(filters).length > 0;

  const [triageSummary, actionSummary, followUpSummary] = await Promise.all([
    this.emailsService.getInboxSummary(userId, "triage", hasFilters ? filters : undefined),
    this.emailsService.getInboxSummary(userId, "action", hasFilters ? filters : undefined),
    this.emailsService.getInboxSummary(userId, "follow-up", hasFilters ? filters : undefined),
  ]);

  return {
    triage: triageSummary.total,
    action: actionSummary.total,
    followUp: followUpSummary.total,
  };
}
```

No changes needed to `emails.service.ts` — `getInboxSummary` already handles all three filters.

---

### Client changes

#### `client/src/hooks/useTabCounts.ts`

**1. Update the `fetchTabCounts` signature** to accept the full filter set:

```ts
interface TabCountFilters {
  minPriority?: number | null;
  categories?: string[];
  accountIds?: string[];
}
```

Change:
```ts
fetchTabCounts: (force?: boolean, minPriority?: number | null) => Promise<void>;
```
To:
```ts
fetchTabCounts: (force?: boolean, filters?: TabCountFilters) => Promise<void>;
```

**2. Update the `fetchTabCounts` implementation** (lines 37–82):
- Build a stable cache key from all active filters (serialize the full filter object).
- Build the query string from all active filters.
- Pass `categories` and `accountIds` as comma-joined query params.

Example implementation:
```ts
const fetchTabCounts = useCallback(async (force = false, filters?: TabCountFilters) => {
  const { minPriority, categories, accountIds } = filters ?? {};

  // Stable cache key from all active filter dimensions
  const cacheKeyParts = [TAB_COUNTS_CACHE_KEY];
  if (minPriority !== null && minPriority !== undefined) cacheKeyParts.push(`p${minPriority}`);
  if (categories?.length) cacheKeyParts.push(`c${categories.sort().join('-')}`);
  if (accountIds?.length) cacheKeyParts.push(`a${accountIds.sort().join('-')}`);
  const cacheKey = cacheKeyParts.join('_');

  // ...cache check...

  const urlParams = new URLSearchParams();
  if (minPriority !== null && minPriority !== undefined) urlParams.set('minPriority', String(minPriority));
  if (categories?.length) urlParams.set('categories', categories.join(','));
  if (accountIds?.length) urlParams.set('accountIds', accountIds.join(','));
  const paramStr = urlParams.toString() ? `?${urlParams.toString()}` : '';

  const response = await axios.get(`${API_URL}/emails/tab-counts${paramStr}`);
  // ...rest unchanged...
}, []);
```

**3. Fix `updateTabCountsOptimistically`** (lines 99–115):

The optimistic updater needs to know the current cache key to update the right entry. Add a
`currentCacheKeyRef` (or a state variable) that is updated whenever `fetchTabCounts` runs, and
use that ref in `updateTabCountsOptimistically`.

```ts
const currentCacheKeyRef = useRef<string>(TAB_COUNTS_CACHE_KEY);
// Inside fetchTabCounts, after computing cacheKey:
currentCacheKeyRef.current = cacheKey;

// Inside updateTabCountsOptimistically:
const cached = localStorage.getItem(currentCacheKeyRef.current);
// ...write back to currentCacheKeyRef.current...
```

---

#### `client/src/hooks/useInboxState.ts`

**Update the filter-change effect** (lines 164–178) to:
- Watch all three filter dimensions, not just `minPriority`
- Pass the full `filters` object to `fetchTabCounts`

Change:
```ts
const prevMinPriorityRef = useRef<number | null | undefined>(undefined);
useEffect(() => {
  if (prevMinPriorityRef.current === undefined) {
    prevMinPriorityRef.current = inboxFilters.filters.minPriority;
    return;
  }
  if (prevMinPriorityRef.current !== inboxFilters.filters.minPriority) {
    prevMinPriorityRef.current = inboxFilters.filters.minPriority;
    fetchTabCounts(true, inboxFilters.filters.minPriority).catch(...);
  }
}, [inboxFilters.filters.minPriority, fetchTabCounts]);
```

To:
```ts
const prevFiltersRef = useRef<InboxFilter | undefined>(undefined);
useEffect(() => {
  const { minPriority, categories, accountIds } = inboxFilters.filters;
  if (prevFiltersRef.current === undefined) {
    prevFiltersRef.current = inboxFilters.filters;
    return;
  }
  const prev = prevFiltersRef.current;
  const filtersChanged =
    prev.minPriority !== minPriority ||
    JSON.stringify(prev.categories) !== JSON.stringify(categories) ||
    JSON.stringify(prev.accountIds) !== JSON.stringify(accountIds);

  if (filtersChanged) {
    prevFiltersRef.current = inboxFilters.filters;
    fetchTabCounts(true, { minPriority, categories, accountIds }).catch(...);
  }
}, [inboxFilters.filters, fetchTabCounts]);
```

**Update all other `fetchTabCounts` call sites** in `useInboxState.ts` to use the new signature:
- Line 137: `fetchTabCounts` passed to `useInboxInitialization` — update prop types
- Line 154: passed to `useInboxModeChanges` — update prop types
- Line 174: direct call (covered by the effect above)
- Line 317: return value — no change needed

---

#### `client/src/hooks/useInboxInitialization.ts`

**Update the `UseInboxInitializationProps` interface** (line 19):
```ts
// Before:
fetchTabCounts: (force?: boolean, minPriority?: number | null) => Promise<void>;
minPriority?: number | null;

// After:
fetchTabCounts: (force?: boolean, filters?: TabCountFilters) => Promise<void>;
filters?: TabCountFilters;
```

Update the two call sites (lines 85, 106):
```ts
// Before:
fetchTabCounts(false, minPriority).catch(...)
fetchTabCounts(true, minPriority).catch(...)

// After:
fetchTabCounts(false, filters).catch(...)
fetchTabCounts(true, filters).catch(...)
```

---

#### `client/src/hooks/useInboxModeChanges.ts`

**Update the `UseInboxModeChangesProps` interface** (line 13):
```ts
// Before:
fetchTabCounts: (force?: boolean, minPriority?: number | null) => Promise<void>;
minPriority?: number | null;

// After:
fetchTabCounts: (force?: boolean, filters?: TabCountFilters) => Promise<void>;
filters?: TabCountFilters;
```

Update the call site (line 74):
```ts
// Before:
fetchTabCounts(true, minPriority).catch(...)

// After:
fetchTabCounts(true, filters).catch(...)
```

---

## Files to Change — Summary

| File | Change |
|------|--------|
| `server/src/emails/emails.controller.ts` | Add `@Query("categories")` and `@Query("accountIds")` to `getTabCounts`; parse and pass to `getInboxSummary` |
| `client/src/hooks/useTabCounts.ts` | Expand `fetchTabCounts` to accept full filter object; build query params and cache key from all three dimensions; fix `updateTabCountsOptimistically` to use current cache key |
| `client/src/hooks/useInboxState.ts` | Update filter-change effect to watch all filters and pass full filter object; thread updated types through |
| `client/src/hooks/useInboxInitialization.ts` | Update prop interface and call sites |
| `client/src/hooks/useInboxModeChanges.ts` | Update prop interface and call site |

No changes needed to:
- `server/src/emails/emails.service.ts` — `getInboxSummary` already accepts all filter fields
- `client/src/pages/Inbox.tsx` — passes `inboxState.tabCounts` which is already wired
- `client/src/components/inbox/InboxHeader.tsx` — renders `tabCounts` as-is

---

## Testing

1. Apply a category filter → tab counts should drop to match only emails in that category
2. Apply an account filter → tab counts should drop to match that account's emails
3. Apply a priority filter → existing behaviour preserved
4. Combine category + account + priority filters → tab counts should reflect intersection
5. Clear all filters → tab counts return to full totals
6. Navigate between tabs with filters active → counts remain correct after mode switch
7. Archive an email with filters active → optimistic decrement hits the correct (filtered) cache entry
