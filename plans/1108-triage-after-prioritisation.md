# Plan: Remove email from Triage after prioritisation (Issue #1108)

## Problem Statement

After a user prioritises an email in Triage (clicks 😅 "Get on it" or 🙀 "Oh sh$t"), the email correctly appears in the **Action** tab — but it also **remains visible in the Triage tab**. It should be removed from Triage immediately upon prioritisation.

---

## Root Cause Analysis

### How prioritisation works (end-to-end)

1. **UI:** `PrioritySlider` renders in `EmailActionsRow`. On click it calls `onSetStarCount(email.id, newCount)`.
2. **Hook chain:** `PrioritySlider` → `EmailActionsRow` → `CategorySection`/`InboxContentParts` → `emailActions.handleSetStarCount` → `useEmailActionsBase.handleSetStarCount` (via `useStarCountMutation`).
3. **API call:** `PUT /emails/:emailId/star-count` → `EmailStarService.setStarCount` → `EmailThreadService.updateThreadStarCount` → updates `EmailThread.starCount` in DB. ✅ DB is updated correctly.
4. **Optimistic Redux update:** In `useStarCountMutation.handleSetStarCount` (`client/src/hooks/useEmailActionsBase.ts`):

```ts
if (mode === MODE_TRIAGE && starCount > 0) {
  dispatch(addAnimatingOut({ id: emailId, type: 'priority' }));
  onSuggestionRemove?.(emailId);
  onTabCountsUpdateOptimistically?.({ triage: -1, action: 1 });
  const tid = setTimeout(() => {
    dispatch(removeEmail(emailId));        // ← removes from Redux state ✅
    dispatch(removeAnimatingOut(emailId));
    ...
  }, EMAIL_EXIT_ANIMATION_DURATION_MS);
}
```

   The email **is** optimistically removed from Redux state after the exit animation (800ms). This is correct.

### Where the bug is: localStorage cache not invalidated

When the user navigates **back to Triage** (or Triage is re-rendered), the category emails are loaded via `fetchCategoryEmailsImpl` (`client/src/hooks/useEmailFetching.ts`). This function uses **stale-while-revalidate**:

```ts
const cachedEmails = getCachedCategoryEmails(mode, catKey);
if (cachedEmails !== null) {
  serveCategoryFromCacheAndRefresh({ cachedEmails, ... });
  return;  // ← serves stale cache IMMEDIATELY
}
```

The `removeEmailFromCache(emailId)` utility **is called for archive** operations (`handleArchive` in `useEmailActionsBase.ts`, line 186), but it is **NOT called for the star-count/prioritisation path**. The cache retains the pre-prioritisation snapshot of the email, so when:

- The user navigates to Action (works fine — new fetch for action mode)
- The user navigates back to Triage (or Triage stays mounted) — the Triage localStorage cache still contains the email, causing it to flash back into the list before the background refresh corrects it

**This is the sole root cause:** `removeEmailFromCache(emailId)` is missing from the `MODE_TRIAGE && starCount > 0` branch in `handleSetStarCount`.

### Secondary concern: summary cache also stale

`setCachedSummary(mode, summary)` is written after a successful inbox-summary fetch. The Triage summary count is decremented optimistically via `onTabCountsUpdateOptimistically({ triage: -1 })` in memory, but the localStorage summary for `triage` mode is NOT invalidated. This means after a hard reload, the category count badge in Triage could be stale until the next background refresh completes.

### Server-side: working correctly

- Triage query: `WHERE thread.isArchived = false AND thread.starCount = 0`
- Action query: `WHERE thread.isArchived = false AND thread.starCount > 0`
- `updateThreadStarCount` correctly persists the new `starCount` to `EmailThread`. The DB is correct; the problem is purely client-side caching.

---

## Exact Fix

### Change 1 — `client/src/hooks/useEmailActionsBase.ts`

In `useStarCountMutation.handleSetStarCount`, in the `MODE_TRIAGE && starCount > 0` branch, add a call to `removeEmailFromCache(emailId)` immediately after dispatching the animating-out action (same pattern as `handleArchive`).

**Before:**
```ts
if (mode === MODE_TRIAGE && starCount > 0) {
  dispatch(addAnimatingOut({ id: emailId, type: 'priority' }));
  onSuggestionRemove?.(emailId);
  onTabCountsUpdateOptimistically?.({ triage: -1, action: 1 });
  const tid = setTimeout(() => {
    dispatch(removeEmail(emailId));
    dispatch(removeAnimatingOut(emailId));
    priorityAnimationTimeouts.current.delete(emailId);
  }, EMAIL_EXIT_ANIMATION_DURATION_MS);
  priorityAnimationTimeouts.current.set(emailId, tid);
}
```

**After:**
```ts
if (mode === MODE_TRIAGE && starCount > 0) {
  dispatch(addAnimatingOut({ id: emailId, type: 'priority' }));
  removeEmailFromCache(emailId);           // ← ADD THIS LINE
  onSuggestionRemove?.(emailId);
  onTabCountsUpdateOptimistically?.({ triage: -1, action: 1 });
  const tid = setTimeout(() => {
    dispatch(removeEmail(emailId));
    dispatch(removeAnimatingOut(emailId));
    priorityAnimationTimeouts.current.delete(emailId);
  }, EMAIL_EXIT_ANIMATION_DURATION_MS);
  priorityAnimationTimeouts.current.set(emailId, tid);
}
```

`removeEmailFromCache` is already imported at the top of `useEmailActionsBase.ts` (line 5):
```ts
import { removeEmailFromCache } from 'utils/emailCache';
```

No new imports needed.

### Change 2 (optional but recommended) — `client/src/utils/emailCache.ts`

Expose a `removeSummaryFromCache(mode)` helper (or call the existing `clearCacheForMode(mode)` for the summary key) after the star-count update, to ensure the Triage summary count is also evicted from localStorage. This prevents stale badge counts after a hard reload.

However, given the summary is already updated optimistically in memory via `onTabCountsUpdateOptimistically`, the visual impact of this secondary issue is much lower. Codebeard may decide to defer this to a follow-up.

---

## Files to Change

| File | Change |
|------|--------|
| `client/src/hooks/useEmailActionsBase.ts` | Add `removeEmailFromCache(emailId)` in the `MODE_TRIAGE && starCount > 0` branch (primary fix) |
| `client/src/utils/emailCache.ts` | (Optional) Add `removeSummaryFromCache(mode)` helper |

---

## Testing

1. Navigate to Triage tab. Confirm emails load.
2. Prioritise an email (click 😅 or 🙀). Confirm it animates out of Triage.
3. Navigate to Action tab. Confirm the email appears there.
4. Navigate back to Triage. **Before fix:** the email reappears briefly. **After fix:** the email is absent immediately and remains absent.
5. Reload the page, navigate to Triage. The email should not appear.
6. Verify error rollback: if the API call fails (e.g., network error), the email should reappear in Triage (existing rollback logic restores from `email` snapshot — no change needed).

---

## Why no server-side change is needed

The server query is correct: Triage = `starCount = 0`, Action = `starCount > 0`. The DB is updated correctly via `updateThreadStarCount`. The background refresh (stale-while-revalidate) already fetches fresh data after the cache hit — the only problem is the brief window where stale cached data is displayed before the background refresh completes. Evicting the cache entry eliminates that window entirely.

---

_Plan authored by Monk of Modularity — ready for Codebeard implementation._
