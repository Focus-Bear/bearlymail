# Plan: Fix 'Other' Category Shows 0 Emails in UI (Issue #1182)

## Status: Plan — Ready for Codebeard

## Summary

The 'Other' category accordion fetches emails correctly (API returns 2 emails when called
with `?mode=triage&categoryIds=Other`) but the UI shows 0. The debug panel's Category
Summary section shows the summary count as 2 (correct) but the accordion renders empty.

## Evidence

- Network: `inbox?mode=triage&categoryIds=Other` → 2 emails, `categoryId: null`, `category: 'Other'`
- Debug panel: Category Summary count = 2 (correct)
- Console: `loaded: []` — `loadedCategoryNames` is empty after the fetch completes
- Accordion: shows 0 emails

## Root Cause Analysis

### Primary cause: fetchSession race condition (caused by the #1183 navigate loop)

The navigate/replaceState loop described in issue #1183 causes `fetchEmails()` to be called
repeatedly as a side effect of mode-change re-triggers. Every call to `fetchEmails()`:

1. Increments `fetchSessionRef.current` (see `useEmailFetching.ts`, `fetchEmails` callback)
2. Calls `dispatch(clearCategoryState())` (via `dispatchFetchStart`)

When a category fetch is in flight (e.g., fetching 'Other' with sessionId=N) and
`fetchEmails()` fires again due to the loop:

1. `fetchSessionRef.current` becomes N+1
2. When the 'Other' fetch resolves: `fetchSessionRef.current !== sessionId` → **abandoned**
3. `dispatch(markCategoryLoaded('Other'))` never fires
4. `loadedCategoryNames` stays `[]`

The console `loaded: []` log is the Effect 1 pre-fetch log showing `loadedCategoryNamesRef.current`
at the time the fetch is queued. The fetch is then silently abandoned, so the state never updates.

**Fixing #1183 (navigate loop) should resolve this race condition.**

### Secondary cause: possible independent key bug (to verify after #1183 fix)

After the navigate loop is fixed, if 'Other' still shows 0, there may be an independent
issue. Investigation path:

1. `updateCategoryEmails({ categoryKey: 'Other', emails })` stamps `email.category_id = null ?? 'Other' = 'Other'`
2. `groupEmailsByCategory` uses `email.category_id ?? email.category ?? 'Other'` as key → `'Other'` ✓
3. `buildEmailCategoryMap` sets `emailCategoryMap.get('Other')` ✓
4. `CategorySection` calls `emailCategoryMap.get(getCategoryKey(null, 'Other'))` = `emailCategoryMap.get('Other')` ✓

The data path looks correct. The race condition from #1183 is the most likely explanation.

### Why the UI shows 0 (not the summary count)

In `CategorySection.tsx`:
```ts
const isLoaded = (loadedCategoryNames ?? []).includes(categoryKey);
const categoryEmails = group?.emails ?? [];
// count prop passed to accordion:
count={isLoaded ? categoryEmails.length : categoryItem.count}
```

If `isLoaded = false` → `count = categoryItem.count` (summary count = 2) → accordion **header**
shows 2.

BUT: `CategorySection` also has this guard:
```ts
if (isLoaded && categoryEmails.length === 0 && categoryItem.count === 0) {
  return null;
}
```
This only hides when `count === 0`. With `count = 2`, the category still renders.

So if `isLoaded = false`, the category shows with badge "2" and a loading spinner.
If the user sees "0", it means `isLoaded = true` AND `categoryEmails.length = 0`.

**This confirms the fetch IS completing** (markCategoryLoaded fires) **but with 0 emails.**
This is the stale-fetch scenario: fetch is abandoned, then a retry succeeds but returns []
because `clearCategoryState` already wiped the state and a second parallel fetch was started
which was also abandoned.

## Fix Strategy

### Step 1: Fix #1183 first (navigate loop → fetchSession race)

The navigate loop causes `fetchEmails()` to fire mid-category-fetch, which increments
`fetchSessionRef` and causes the in-flight category fetch to be abandoned. Once #1183 is
fixed, `fetchEmails()` is only called on genuine mode changes, not continuously.

### Step 2: Verify 'Other' resolves after #1183 deploy

After deploying #1183's fix, test:
- Open inbox in triage mode with 'Other' emails
- Confirm 'Other' accordion shows correct count
- Confirm `loaded: []` no longer appears in console after fetch

### Step 3: If still broken — fix the `isLoaded && categoryEmails.length === 0` scenario

If the category fetch returns 0 emails (race condition still happening after #1183):

**Option A: Retry on 0 emails**

In `fetchCategoryEmailsImpl`, after receiving 0 emails:
- If `categorySummaryRef.current` says count > 0, treat as a race condition and retry once.
- This complements the existing stale-UUID detection (Fix #1114).

**Option B: Don't call markCategoryLoaded when emails = 0 and summary says count > 0**

This prevents the `isLoaded=true, categoryEmails.length=0` state from showing in the UI.
Instead, keep `isLoaded=false` and let Effect 2 (limbo recovery) retry the fetch.

The current code already has the stale-UUID self-healing logic for this case — it calls
`clearCacheForMode(mode)`. But it still calls `markCategoryLoaded(catKey)` even when emails
returned 0 and summary says count > 0. That's the bug: **the category is marked loaded with
0 emails, showing an empty accordion to the user.**

**Recommended fix:**

In `fetchCategoryEmailsImpl` (around line 315 in `useEmailFetching.ts`), change the
`markCategoryLoaded` dispatch to only fire if emails > 0 OR summary count = 0:

```ts
const summaryItem = categorySummaryRef.current?.find(
  (item) => item.id === categoryId || item.name === categoryName
);
const summaryCount = summaryItem?.count ?? 0;

if (emails.length === 0 && summaryCount > 0) {
  // Don't mark as loaded — limbo recovery (Effect 2) will retry
  console.warn(
    '[Accordion] Category returned 0 emails but summary says', summaryCount,
    '— not marking loaded, limbo recovery will retry:', categoryName
  );
  dispatch(markCategoryLoadFailed(catKey)); // keeps it in "retry" state
} else {
  dispatch(markCategoryLoaded(catKey));
}
```

This ensures 'Other' (or any category) is never shown as "loaded with 0 emails" when the
summary says there should be emails. Effect 2's limbo recovery will pick it up and retry.

## Files to Change

| File | Change |
|------|--------|
| `client/src/hooks/useInboxUrlSync.ts` | Fix #1183 (prerequisite — navigate loop) |
| `client/src/hooks/useEmailFetching.ts` | `fetchCategoryEmailsImpl`: don't mark loaded if 0 emails but summary > 0 |

## Testing

1. Open inbox with emails in 'Other' category
2. Confirm 'Other' accordion expands and shows emails (not 0)
3. Confirm `loaded: []` followed by `markCategoryLoaded` appears in console (fetch succeeds)
4. Force a race: rapidly switch modes while 'Other' is loading → confirm retry kicks in
5. Run `npm test -- --watchAll=false` — all tests pass

## Acceptance Criteria

- [ ] 'Other' category accordion shows correct email count after expand
- [ ] No `Throttling navigation` (from #1183 fix)
- [ ] `loaded: []` in console log is followed by successful `markCategoryLoaded('Other')`
- [ ] If API returns 0 emails when summary says > 0, category is NOT marked as loaded (retries)
- [ ] All tests pass

## Dependencies

- **Blocks on #1183 (navigate loop fix)** — the race condition is the primary cause
- Server fix from #1175 is already deployed (server correctly handles `categoryIds=Other`)

## Priority

P1 — 'Other' is the catch-all category for uncategorised emails. All users with uncategorised
emails see 0 in this accordion.

## Branch

`openclaw/issue-1182/other-display-plan`

---

_Monk of Modularity (AI agent)_
