# Plan: Fix #1571 — Priority Filter Issues

**Author:** Monk of Modularity (AI)
**Issue:** [#1571](https://github.com/Focus-Bear/BearlyMail/issues/1571)
**Date:** 2026-03-30

---

## Summary

Three problems reported plus a feature request:

1. **Emails not loading initially** — 114 emails exist but don't show until page reload
2. **Filter UI looks bad** — priority filter dropdown/UI needs visual cleanup
3. **Category and Priority filters need same height** — inconsistent heights
4. **Feature request:** Add a priority debug section in the debug panel

---

## Bug 1: Emails Not Loading Initially (P0)

### Root-Cause Analysis

After thorough investigation, **two likely root causes** have been identified:

#### Root Cause A: Stale localStorage cache serving empty data on first navigation

**Flow:**

1. `InboxProvider` → `useInboxFilters()` → loads filters from localStorage (default: `minPriority: 50, maxPriority: null` = "Very High")
2. `useInboxState` → `useEmailManagement({ filters })` → `useEmailFetching({ mode, filters })`
3. `useInboxInitialization` fires on mount, calls `fetchEmails()` (or `refreshInPlace()`)
4. `fetchEmailsImpl` checks `getCachedSummary(mode, INBOX_CACHE_TTL_MS)` for stale-while-revalidate

**Problem:** The localStorage summary cache (`getCachedSummary`) is keyed **only by mode** (e.g., `"triage"`), NOT by filter params. If a user previously loaded the inbox with different priority filters (e.g., "All"), the cache contains summary data for ALL priorities. On the next visit with the default VH filter (`minPriority: 50`), the stale-while-revalidate path serves this cached summary immediately, then refreshes in background. But the cached summary has categories/counts from the old "All" filter — the category UUIDs and counts don't match what the server would return for VH-only.

When `serveSummaryFromCacheAndRefresh` fires, it:

1. Dispatches the old (wrong-filter) summary to Redux
2. Kicks off `fetchInboxSummary()` in background
3. Meanwhile, `useCategoryFetch` auto-expands the first 3 categories and fetches their emails
4. But the category fetch uses the NEW VH filter params — so it fetches emails filtered by `minPriority=50`
5. The background summary refresh also returns VH-filtered counts

This creates a race where the initial render shows categories from the stale cache (possibly with wrong counts), and the emails within those categories are fetched with different filter params than the summary was built with. If the stale cache had categories that are now empty under the VH filter, you get accordions with 0 emails.

**The page reload works** because:

- On reload, `loadInitialFilters()` reads the same filters from localStorage
- But the summary cache TTL (60s) may have expired, forcing a fresh fetch
- OR the cache was updated by the background refresh from the previous (broken) load
- Either way, summary + category emails are now fetched with consistent filter params

#### Root Cause B: `minPriority=0` parsed as falsy on server controller

In `emails.controller.ts` line ~189:

```ts
const minPriorityValue = minPriority ? parseFloat(minPriority) : undefined;
```

The query string value `"0"` is **falsy in JavaScript**, so `minPriority=0` (the "Low" bucket's lower bound) is silently dropped — the server applies no `minPriority` filter. This doesn't directly cause the "114 emails not showing" bug (since default is VH=50, not 0), but it means the "Low" and "Medium" bucket boundaries behave incorrectly when selected, potentially causing count mismatches.

Similarly for `maxPriority`:

```ts
const maxPriorityValue = maxPriority ? parseFloat(maxPriority) : undefined;
```

`maxPriority=0` (the "Very Low" bucket's upper bound) would also be dropped.

### Fix Plan

**Fix A — Cache key must include filter params:**

In `client/src/utils/emailCache.ts`, modify the cache key for summary data to include the serialized filter params (minPriority, maxPriority, accountIds, categories). This ensures that changing filters invalidates the stale-while-revalidate cache.

Files to modify:

- `client/src/utils/emailCache.ts` — change `getCachedSummary()` and `setCachedSummary()` to accept filter params and include them in the cache key
- `client/src/hooks/useEmailFetching.ts` — pass filter params to cache get/set calls
- Also consider: `clearCacheForMode()` should clear all filter variants for a mode

Alternative (simpler): When `fetchEmails` is called with override filters, it already calls `clearCacheForMode(mode)`. But the initial load path does NOT pass overrideFilters, so the cache isn't cleared. The fix could be to always compare the cached summary's filter context with the current filters before serving from cache.

**Fix B — Fix falsy `0` parsing:**

In `server/src/emails/emails.controller.ts`, change:

```ts
// Before:
const minPriorityValue = minPriority ? parseFloat(minPriority) : undefined;
const maxPriorityValue = maxPriority ? parseFloat(maxPriority) : undefined;

// After:
const minPriorityValue =
  minPriority !== undefined && minPriority !== ""
    ? parseFloat(minPriority)
    : undefined;
const maxPriorityValue =
  maxPriority !== undefined && maxPriority !== ""
    ? parseFloat(maxPriority)
    : undefined;
```

Also apply the same fix in the `/emails/inbox` controller endpoint if it has the same pattern.

Files to modify:

- `server/src/emails/emails.controller.ts` — lines ~189-190, fix `minPriority`/`maxPriority` parsing
- Check `/emails/inbox` endpoint for same issue

---

## Bug 2: Filter UI Looks Bad (P2)

### Analysis

The `PriorityRangeSelector` is a dual-thumb range slider. Comparing it with `VisualCategoryFilter`:

1. **PriorityRangeSelector** is wrapped in a card (`border + borderRadius + padding + boxShadow`)
2. **VisualCategoryFilter** is also wrapped in an identical card

Both use `flex: 1` in the parent `InboxFilters.tsx` row, so they should take equal width.

The "looks bad" complaint likely refers to:

- The slider thumb handles being small (20px) and hard to grab on mobile
- The bucket labels below the slider being tiny (`fontSize.sm`) and cramped
- The overall visual weight being lighter than the category pills (pills are chunky 44px touch targets; the slider is a thin 6px track)
- No visual indication of the selected range beyond opacity changes on segments
- The "Priority Filter" header + range text feels utilitarian vs the category filter's clean pill-based UI

### Fix Plan

Visual improvements to `PriorityRangeSelector`:

1. Increase slider track height from 6px to 8px
2. Increase thumb handles from 20px to 24px
3. Add a subtle filled overlay between the two thumbs to make the selected range more obvious
4. Increase bucket label font size from `fontSize.sm` to `fontSize.md`
5. Add subtle hover states on thumbs (scale up slightly)
6. Consider: add a "Reset" or "All" quick button to clear the priority filter

Files to modify:

- `client/src/components/inbox/PriorityRangeSelector.tsx` — visual tweaks to track, thumbs, labels

---

## Bug 3: Category and Priority Filters Need Same Height (P2)

### Analysis

Both `VisualCategoryFilter` and `PriorityRangeSelector` are rendered as sibling `<div>` elements in `InboxFilters.tsx`:

```tsx
<div style={{ flex: 1, minWidth: 0 }}>
  <VisualCategoryFilter ... />
</div>
<div style={{ flex: 1, minWidth: 0 }}>
  <PriorityRangeSelector ... />
</div>
```

The parent uses `display: 'flex'` with `alignItems: 'flex-start'`. This means each child grows to its natural content height independently.

**Height difference sources:**

- **VisualCategoryFilter**: Header (1 line) + pill row (44px min pills, wrapping). Total ≈ 80-120px depending on number of categories and wrapping
- **PriorityRangeSelector**: Header (1 line) + slider track (24px area) + bucket labels (dot 6px + label + optional count). Total ≈ 100-130px

The heights differ because:

- Category pills wrap to multiple rows when there are many categories, making the category filter taller
- Priority slider has a fixed height (header + track + labels)
- When there are few categories (≤5, all fit on one row), the priority filter may actually be taller

### Fix Plan

Change `alignItems: 'flex-start'` to `alignItems: 'stretch'` in the parent flex container. This forces both children to match the taller one's height. Both inner components already have their content vertically spaced, so stretching won't break layouts.

Files to modify:

- `client/src/components/inbox/InboxFilters.tsx` — change `alignItems` in the Row 2 flex container from `'flex-start'` to `'stretch'`

Both `VisualCategoryFilter` and `PriorityRangeSelector` outer containers already have `flex: '1'` and card-like styling, so stretching will simply make the shorter one's background/border fill to match.

---

## Feature: Priority Debug Section in Debug Panel (P3)

### Analysis

The existing `DebugPanel` (`client/src/components/inbox/DebugPanel.tsx`) has sections for:

- Sync Status
- Sync History
- Category Summary
- Starred Threads
- Orphan Emails
- Thread Lookup
- All Emails list

A **Priority Debug Section** should show:

1. **Current filter state**: active `minPriority`, `maxPriority` values, the corresponding bucket label
2. **Priority distribution**: count of emails in each bucket (VL/L/M/H/VH) — reuse `usePriorityCounts`
3. **Unprioritised count**: how many threads have `priorityScore = null` or are still being processed
4. **Cache state**: whether the inbox summary cache is populated, its age, filter params it was fetched with
5. **Filter history**: recent filter changes this session (to help diagnose "not loading" issues)
6. **Per-category priority breakdown**: for each expanded category, show the priority distribution of its emails

### Implementation Plan

1. Create `client/src/components/inbox/debug/DebugPrioritySection.tsx` — new debug section component
2. Props: current filters (min/max priority), priority counts, unprioritised count, emails (for per-category breakdown)
3. Wire it into `DebugPanel.tsx` as a new accordion section
4. Add it to `useDebugPanel.ts` data if additional API calls are needed (likely not — most data is already available from `usePriorityCounts` and the filter state)

Files to modify:

- `client/src/components/inbox/debug/DebugPrioritySection.tsx` — **new file**
- `client/src/components/inbox/debug/index.ts` — export the new section
- `client/src/components/inbox/DebugPanel.tsx` — add the new section with priority filter props
- `client/src/pages/Inbox.tsx` — pass priority filter/count data to DebugPanel

---

## Implementation Order

1. **Bug 1 Fix B** (server-side `0` parsing) — smallest change, prevents incorrect filter behaviour
2. **Bug 1 Fix A** (cache key includes filters) — root cause of the "not loading initially" issue
3. **Bug 3** (same height) — one-line CSS fix
4. **Bug 2** (UI cleanup) — visual polish
5. **Feature** (priority debug section) — new component

## Files Changed Summary

| File                                                         | Change                                            |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `server/src/emails/emails.controller.ts`                     | Fix falsy `0` parsing for minPriority/maxPriority |
| `client/src/utils/emailCache.ts`                             | Include filter params in cache key                |
| `client/src/hooks/useEmailFetching.ts`                       | Pass filter params to cache get/set               |
| `client/src/components/inbox/InboxFilters.tsx`               | Change alignItems to stretch                      |
| `client/src/components/inbox/PriorityRangeSelector.tsx`      | Visual improvements (track, thumbs, labels)       |
| `client/src/components/inbox/debug/DebugPrioritySection.tsx` | **New file** — priority debug section             |
| `client/src/components/inbox/debug/index.ts`                 | Export new section                                |
| `client/src/components/inbox/DebugPanel.tsx`                 | Add priority debug section                        |
| `client/src/pages/Inbox.tsx`                                 | Pass priority data to DebugPanel                  |

## Risk Assessment

- **Bug 1 Fix B** (server parsing): Low risk — only affects edge case where `minPriority=0` or `maxPriority=0`
- **Bug 1 Fix A** (cache key): Medium risk — changes caching behaviour; needs testing that stale-while-revalidate still works correctly and doesn't cause unnecessary re-fetches. Existing cache entries from old key format will be ignored (treated as cache miss), which is safe.
- **Bug 3** (CSS): Very low risk — single property change
- **Bug 2** (UI): Low risk — visual only
- **Feature** (debug section): Low risk — debug-only UI, no production impact

---

_Planned by Monk of Modularity (AI) 🧘_
