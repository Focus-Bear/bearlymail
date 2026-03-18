# Plan: Fix Priority Band Progression (#1160)

**Issue:** "Show medium priority" fetches with `minPriority=50` (HIGH) instead of medium range.

**Linked PRs already merged:**
- #1103 — added `maxPriority` param to backend filter
- #1133 — added `maxPriority` to `filtersChanged` detection in `useInboxState`

---

## Root Cause Analysis

There are **two distinct bugs**, both in `client/src/pages/Inbox.tsx`.

### Bug 1 — Stale Closure Race: `fetchEmails()` fires before state update propagates

**Location:** `Inbox.tsx` → `onUnlockPriorityTier` handler

```tsx
// Inbox.tsx ~line 199
onUnlockPriorityTier={(newMinPriority: number) => {
  setPriorityFilter(newMinPriority);   // ← schedules async React state update
  fetchEmails();                        // ← fires immediately, BEFORE re-render
  fetchPriorityCounts();
}}
```

**What happens:**
1. User clicks "Show medium priority emails"
2. `setPriorityFilter(20)` is called → schedules a React state update
3. `fetchEmails()` is called immediately in the same synchronous callback
4. `fetchEmails` is a `useCallback` whose closure captured `buildSummaryParams`
5. `buildSummaryParams` is also a `useCallback([mode, filters])` — but **`filters` hasn't changed yet** (React hasn't re-rendered)
6. `fetchEmails()` builds params from **stale filters** (`minPriority=50`, `maxPriority=null`)
7. API call fires: `inbox-summary?mode=triage&includeThreadIds=true&minPriority=50`

**This exactly explains the network trace in the bug report.**

After the state update propagates (next render), `filtersChanged` in `useInboxState.ts` fires another `fetchTabCounts()` call but **NOT** another `fetchEmails()` call. So the inbox content is still fetched with the stale high-priority params, and the user sees medium-band UI state but high-band API results.

### Bug 2 — Missing `maxPriority` upper bound when unlocking medium band

**Location:** `EmailListStates.tsx` → high-done `onYes` handler → `Inbox.tsx` `onUnlockPriorityTier`

When the user clicks "Show medium priority emails" from the high-done prompt:
- `EmailListStates.tsx` calls `onUnlockPriorityTier(MEDIUM_PRIORITY_THRESHOLD)` → `onUnlockPriorityTier(20)`
- `Inbox.tsx` calls `setPriorityFilter(20)` → signature `(minPriority, maxPriority = null)` → sets `{minPriority: 20, maxPriority: null}`
- API gets `minPriority=20` with **no `maxPriority`** → returns ALL emails with score ≥ 20 (both medium AND high)

The medium band should be a **bounded range**: `minPriority=20, maxPriority=50`.

Without `maxPriority`, the inbox shows high-priority emails mixed into the "medium" band.

The low band (unlock from medium-done) has the same problem: `onUnlockPriorityTier(0)` → `minPriority=0, maxPriority=null` → returns everything ≥ 0 (all three bands).

### Priority Thresholds (current)

| Threshold | Value | Defined In |
|-----------|-------|-----------|
| `HIGH_PRIORITY_THRESHOLD` | 50 | `useInboxFilters.ts` (exported) |
| `MEDIUM_PRIORITY_THRESHOLD` | 20 | `EmailListStates.tsx` (local const, not exported) |
| Low band minimum | 0 | Hardcoded in `EmailListStates.tsx` `onYes={() => onUnlockPriorityTier(0)}` |

The priority bands as they should behave:
- **High band:** score ≥ 50 → `minPriority=50, maxPriority=null`
- **Medium band:** 20 ≤ score < 50 → `minPriority=20, maxPriority=50`
- **Low band:** score < 20 → `minPriority=null, maxPriority=20` (or `minPriority=0, maxPriority=20`)

### The `EmailListStates` "medium done" condition

The component checks `minPriority` from filter state (passed as prop) to decide which empty-state to show:

```tsx
// "medium done" condition
minPriority >= MEDIUM_PRIORITY_THRESHOLD &&
minPriority < HIGH_PRIORITY_THRESHOLD
// i.e. 20 <= minPriority < 50
```

This is a UI-level check on the filter state value, **not** on what the API actually returned. So:
- Due to Bug 2, even when `minPriority=20` is correctly set, without `maxPriority=50`, the API returns high+medium mixed
- The "medium done" empty state fires correctly when all those emails are processed, but the inbox was showing the wrong superset of emails the whole time

No separate band-tracker state exists. The component derives "current band" from `minPriority`. There is no independent UI-level band variable that could drift from the filter params.

---

## Fix Plan

### Fix 1 — Pass new filters directly to `fetchEmails` (fix the stale closure)

The root fix is to have `fetchEmails` accept an optional `overrideFilters` argument so the unlock handler can pass the new filters explicitly without waiting for React to re-render.

**Option A (preferred): Pass filters to `fetchEmails` directly**

Modify `useEmailFetching` and `fetchEmailsImpl` to accept an optional `overrideFilters` parameter that supersedes the hook's `filters` prop for that single call:

```ts
// useEmailFetching.ts
const fetchEmails = useCallback(async (overrideFilters?: InboxFilter) => {
  fetchSessionRef.current += 1;
  isLoadingMoreRef.current = false;
  const effectiveFilters = overrideFilters ?? filters;
  await fetchEmailsImpl({ mode, dispatch, buildSummaryParams: () => buildSummaryParamsImpl(mode, effectiveFilters), ... });
}, [mode, dispatch, filters, ...]);
```

Then in `Inbox.tsx`:

```tsx
onUnlockPriorityTier={(newMinPriority: number) => {
  const newFilters = { ...filters, minPriority: newMinPriority, maxPriority: newMaxPriority };
  setPriorityFilter(newMinPriority, newMaxPriority);
  fetchEmails(newFilters);   // ← pass explicit filters, no stale closure
  fetchPriorityCounts();
}}
```

**Option B (simpler, no API change): Use `useEffect` to fetch after filter state update**

Alternatively, track a "pending fetch" flag and trigger `fetchEmails` inside a `useEffect` that watches `filters`. But this is more complex and reactive, and `fetchEmails` already exists as an imperative function.

**Recommended: Option A** — cleaner, explicit, testable.

### Fix 2 — Set `maxPriority` upper bound when unlocking medium/low bands

Change the `onUnlockPriorityTier` type and the handler in `Inbox.tsx` to also set `maxPriority`:

```tsx
// EmailListStates.tsx — change callback type
interface EmailListStatesProps {
  onUnlockPriorityTier?: (newMinPriority: number, newMaxPriority: number | null) => void;
}

// HIGH DONE block — medium unlock
onYes={() => onUnlockPriorityTier(MEDIUM_PRIORITY_THRESHOLD, HIGH_PRIORITY_THRESHOLD)}
// → setPriorityFilter(20, 50) → minPriority=20, maxPriority=50 ✓

// MEDIUM DONE block — low unlock
onYes={() => onUnlockPriorityTier(0, MEDIUM_PRIORITY_THRESHOLD)}
// → setPriorityFilter(0, 20) → minPriority=0, maxPriority=20 ✓
```

Update `Inbox.tsx` handler:

```tsx
onUnlockPriorityTier={(newMinPriority: number, newMaxPriority: number | null) => {
  const newFilters = { ...filters, minPriority: newMinPriority, maxPriority: newMaxPriority };
  setPriorityFilter(newMinPriority, newMaxPriority);
  fetchEmails(newFilters);
  fetchPriorityCounts();
}}
```

### Fix 3 — Export `MEDIUM_PRIORITY_THRESHOLD` from `useInboxFilters.ts`

`MEDIUM_PRIORITY_THRESHOLD = 20` is currently a local constant in `EmailListStates.tsx`. It should be exported from `useInboxFilters.ts` alongside `HIGH_PRIORITY_THRESHOLD` to prevent drift.

```ts
// useInboxFilters.ts
export const HIGH_PRIORITY_THRESHOLD = 50;
export const MEDIUM_PRIORITY_THRESHOLD = 20;
export const LOW_PRIORITY_THRESHOLD = 0;
```

---

## Files to Change

| File | Change |
|------|--------|
| `client/src/hooks/useEmailFetching.ts` | Add optional `overrideFilters` param to `fetchEmails` callback and `fetchEmailsImpl` |
| `client/src/hooks/useEmailManagement.ts` | Thread `overrideFilters` through `fetchEmails` signature |
| `client/src/hooks/useInboxFilters.ts` | Export `MEDIUM_PRIORITY_THRESHOLD = 20` and `LOW_PRIORITY_THRESHOLD = 0` |
| `client/src/components/inbox/EmailListStates.tsx` | Change `onUnlockPriorityTier` to `(min, max)`, update `onYes` calls to pass both bounds, import thresholds from `useInboxFilters` |
| `client/src/components/inbox/InboxContentParts.tsx` | Update `onUnlockPriorityTier` prop type |
| `client/src/components/inbox/InboxContent.tsx` | Update `onUnlockPriorityTier` prop type |
| `client/src/pages/Inbox.tsx` | Update `onUnlockPriorityTier` handler to pass `(min, max)` and pass `newFilters` to `fetchEmails` |
| `client/src/hooks/useEmailFetching.test.ts` | Add regression test: fetchEmails with overrideFilters uses override, not stale filters |
| `client/src/components/inbox/EmailListStates.test.tsx` | Add test: high-done onYes passes (20, 50); medium-done onYes passes (0, 20) |

---

## Test Cases

1. **Race condition regression test:** Call `fetchEmails(overrideFilters)` immediately after `setPriorityFilter` — verify the API params use the override, not the previous filter state.
2. **Medium band unlock test:** Click "Show medium priority emails" from high-done prompt → verify `minPriority=20&maxPriority=50` in the API call.
3. **Low band unlock test:** Click "Show low priority emails" from medium-done prompt → verify `minPriority=0&maxPriority=20` in the API call.
4. **High band threshold correctness:** `HIGH_PRIORITY_THRESHOLD=50` in params, `maxPriority=null` (unbounded above).
5. **"All caught up" state:** After low band is exhausted, `AllCaughtUpState` renders.

---

## Notes

- `showNextPriorityBand()` does not exist as a named function in this codebase. The progression logic lives entirely in `EmailListStates.tsx` via the `onUnlockPriorityTier` prop callback pattern and the `ProgressiveUnlockPrompt` component.
- `PRIORITY_RANGES` in `useInboxFilters.ts` defines filter UI ranges (for the filter bar dropdown), which are distinct from the progressive unlock tier thresholds. These don't need to change.
- The `AllCaughtUpState` condition in `EmailListStates.tsx` (low band, low count = 0) is correct; no change needed there.
- The `usePriorityCounts` hook fetches global tier counts (not filtered) — it correctly uses `HIGH_PRIORITY_THRESHOLD=50` and `MEDIUM_PRIORITY_THRESHOLD=20` for tier boundaries server-side. No change needed.
