# Plan: Fix category UUID fallback + stale inbox state bugs

**Issues:** #1244, #1245, #1246, #1248
**Priority:** P1 — all four bugs share a root cause
**Regression from:** #1235 (InboxContext split), #1236 (TanStack Query), #1237 (emailSlice split)

---

## Root Cause Analysis

### #1248 — Category names sent as `categoryIds` (THE ROOT CAUSE)

**What happens:** The network tab shows requests like `categoryIds=New+Github+issues+ba...` — category *names* being sent where UUIDs are expected.

**Why:** The entire client keys categories using `getCategoryKey(id, name)` which returns `id ?? name`. When the server's `getInboxSummary` returns `id: null` for a category, the key becomes the category *name*. That name then gets sent as `categoryIds=<name>` in `buildCategoryParamsImpl()`, which always sends `categoryIds=<catKey>`. The server expects UUIDs, so name-based requests either return 304 (not modified) or empty results.

**When does `id` come back null?** In `getInboxSummary` (server), the `lookupCategoryId(name)` function does an exact/prefix/parenthetical match against `UserContext` entries. Categories whose encrypted name was stored with LLM-deviated text (extra whitespace, different casing, parenthetical suffixes that don't match the normalization logic) return `null`.

**The real question:** Why are there still threads with encrypted category names that don't match any `UserContext.contextValue`? The `repairEncryptedCategoryNames` migration was supposed to fix this. Either:
1. New threads are being categorized with names that don't exactly match an existing `UserContext` entry (LLM output drift), OR
2. The repair migration didn't catch all edge cases (e.g. Unicode normalization, em-dash vs en-dash).

### #1244 — Stale emails on tab switch

**What happens:** Switching inbox tabs (Action→Triage→Follow Up) doesn't reload emails. User sees stale emails from previous tab.

**Why (two contributing causes):**

1. **Stale cache serving:** `fetchEmailsImpl` checks `getCachedSummary(mode, INBOX_CACHE_TTL_MS)` — if a cached summary exists within 60s, it serves it and does a background refresh only. On tab switch, `useInboxModeChanges` calls `fetchEmails()`, but if the *new* mode also has a cached summary, the stale cached data is shown immediately and the background refresh may not complete before the user notices.

2. **fetchEmails closure staleness:** `useInboxModeChanges` has `fetchEmails` intentionally NOT in its deps (`// Note: fetchEmails is intentionally not in dependencies`). The comment says "fetchEmails uses mode from its closure." But `fetchEmails` is a `useCallback` with `mode` in its deps — so it IS recreated when mode changes. However, the effect captures the *old* `fetchEmails` from the previous render. When the effect fires with the new `mode`, it calls the old `fetchEmails` which closes over the old `mode` value. **This is the actual bug: the effect calls a stale closure of `fetchEmails` that references the previous mode.**

### #1245 — First accordion doesn't open when clicked

**What happens:** The first (and sometimes second/third) accordion in the inbox doesn't respond to clicks.

**Why (cascade from #1248):**
1. Inbox loads → `getInboxSummary` returns categories, some with `id: null`
2. `useCategoryFetch.updateStableCategoryOrder` auto-expands first 3 categories
3. For null-id categories, `fetchCategoryEmails` sends `categoryIds=<name>` → server returns 0 emails
4. `CategoryAccordion` has auto-collapse effect: when `emails.length === 0` and `wasExpandedWithEmailsRef.current && isExpanded` → calls `onToggle()` to collapse
5. But wait — `wasExpandedWithEmailsRef.current` is only set to `true` when `emails.length > 0`. So the *first* auto-collapse doesn't fire from `CategoryAccordion`. Instead, `InboxCategoryItem`'s auto-collapse fires: `isLoaded && categoryEmails.length === 0 && isExpanded && categoryItem.count === 0`.
6. Actually, the count is NOT 0 (summary says e.g. 5 emails), so this guard doesn't fire either. The accordion stays expanded but empty.
7. The **real issue**: the category is in a "limbo" state — expanded, marked loaded (because `fetchCategoryEmails` dispatches `markCategoryLoaded` even for 0-email responses when summary count > 0... wait, no, it dispatches `markCategoryLoadFailed` in that case).
8. Re-examining: when 0 emails return but summary count > 0, `fetchCategoryEmailsImpl` calls `markCategoryLoadFailed(catKey)`. This removes from `loadingCategoryNames` but doesn't add to `loadedCategoryNames`. The accordion shows the loading spinner forever OR limbo-recovery kicks in and retries, getting 0 again, eventually hitting `markCategoryFetchExhausted`. At that point clicking the accordion to collapse/expand does work for toggle, but expanding just shows nothing.

**Simpler scenario for #1245:** If the first accordion has a valid UUID and loads fine, but the `toggleCategory` callback captures a stale `categoryKey`, the Set update could be a no-op. Let me check... `toggleCategory` takes `categoryKey` as a parameter (not from closure), so that's fine. The toggle itself should work.

**Most likely cause:** The auto-expand sets the first 3 categories as expanded. The fetch for category 1 starts. While loading, the user clicks category 1's header. `onToggle` fires → removes from expanded set → accordion collapses. But then the Effect in `useCategoryFetch` re-fires (because `expandedCategories` changed) and... wait, it checks `loadedCategoryNamesRef.current.includes(key)` — if the category is loading, it skips. So the fetch completes, marks loaded, accordion shows as collapsed with data loaded. User clicks again → accordion expands, data is there. That should work.

**Revised theory for #1245:** The issue is specific to the **first** accordion. Looking at `InboxCategoryItem`:
```tsx
<CategoryAccordion
  ...
  onToggle={() => onToggleCategory(categoryKey)}
>
```
The `onToggle` is `() => onToggleCategory(categoryKey)`. And `onToggleCategory` comes from the parent `InboxCategoryList` which passes `onToggleCategory` from props. This traces back to `toggleCategory` from `useCategoryFetch`. The toggle itself should work.

**Possible event propagation issue:** In `CategoryAccordionHeader`, the header div has `onClick={onToggle}`. Inside it, there are buttons with `event.stopPropagation()` (edit, reanalyse, archive-all). If the click target is one of these buttons, `stopPropagation` prevents the header's onClick from firing. But this would affect all accordions, not just the first.

**The most likely #1245 cause is the CSS grid animation + React state interaction.** The first accordion auto-expands with `gridTemplateRows: '1fr'`. When the user clicks to collapse, it transitions to `'0fr'`. Then clicking again should expand. But if the `isExpanded` state gets out of sync between `CategoryAccordion`'s internal auto-collapse effect and the parent's `expandedCategories` Set, the toggle can appear to "not work" because it's toggling from an unexpected state.

Specifically: if the auto-collapse effect in `CategoryAccordion` fires AND the parent `InboxCategoryItem` auto-collapse effect also fires, `onToggle` could be called **twice** — first collapsing, then immediately re-expanding (or vice versa), leaving the accordion in the same visual state. **This is a race between two auto-collapse effects.**

### #1246 — Empty accordions persist after clearing emails

**What happens:** After archiving all emails in a category one by one, the empty accordion remains visible.

**Why:** The hide guard in `InboxCategoryList` requires ALL of: `isLoaded && categoryEmails.length === 0 && categoryItem.count === 0`. The `decrementCategorySummaryCount` reducer matches by `cat.name === categoryName`. But the `categoryName` comes from `emailToArchive.category || CATEGORY_OTHER` — the email's category *name* string. If this doesn't exactly match the summary item's `.name` (encoding diffs, LLM-deviated names), the count is never decremented to 0.

**Additionally:** Even when names match perfectly, the `categoryItem.count` is decremented in Redux, but the hide guard also checks `categoryEmails.length === 0`. The `removeEmail` action removes the email from the flat `emails` array, which should make `categoryEmails.length` drop. But `filteredEmails` is memoized: `useMemo(() => emails.filter(email => !email.isArchived), [emails])`. The email is removed from Redux AFTER the animation timeout (800ms). During those 800ms, the email is still in the array with `isArchived` potentially not set.

Actually looking more carefully: `dispatch(removeEmail(emailId))` is called inside a `setTimeout` (the animation timeout). But `dispatch(decrementCategorySummaryCount(categoryName))` is called immediately. So there's a window where count=0 but emails still has the item → guard not satisfied. Then when `removeEmail` fires, emails becomes empty → now `categoryEmails.length === 0 && categoryItem.count === 0` → should hide. But only if both conditions align.

**The real #1246 issue is the name-based matching in `decrementCategorySummaryCount`.** It should match by category key (UUID), not by name. When the email has `category: "New Github issues"` but the summary item has `name: "New Github Issues"` (case diff), the decrement misses.

---

## Fix Plan

### Fix 1: Server-side — Ensure `getInboxSummary` always returns UUIDs (fix #1248)

**File:** `server/src/emails/emails.service.ts`

The `lookupCategoryId` function already does prefix/parenthetical matching. But it can still return `null` when:
- The encrypted category name on the thread is completely different from any UserContext entry
- Unicode normalization differences (em-dash vs en-dash, smart quotes, etc.)

**Changes:**
1. In `getInboxSummary`, after the per-row grouping loop, do a **second pass** on categories that ended up with `id: null`. For each, query `email_threads` to find the most common `categoryId` UUID among threads in that category name group. This handles the case where some threads have the UUID (from backfill) but the name lookup fails.

2. Add Unicode normalization (NFC/NFKD) to `lookupCategoryId` for both the input name and the context keys.

3. **Fallback:** If a category STILL has no UUID after both lookups, use the `categoryId` column directly from the `email_threads` rows (already selected as `thread."categoryId"` in the query). The grouping loop already tracks `categoryUuidByName` from `row.categoryId` — use this as the PRIMARY source instead of `lookupCategoryId`:

```typescript
// CHANGE: Use categoryUuidByName (from thread.categoryId column) as primary,
// fall back to lookupCategoryId (UserContext-based) only when thread has no UUID
const categories = visibleCategories.map((name) => ({
  id: categoryUuidByName.get(name) ?? lookupCategoryId(name),
  name,
  count: categoryCounts[name] || 0,
  // ...
}));
```

This is the simplest and most correct fix: `categoryUuidByName` is populated from `row.categoryId` which is the actual UUID stored on the thread. It should be the primary source. `lookupCategoryId` is only needed as a fallback for pre-backfill threads.

**Wait — re-reading the code:** `categoryUuidByName` is already populated in the loop:
```typescript
if (row.categoryId && !categoryUuidByName.has(category)) {
  categoryUuidByName.set(category, row.categoryId as string);
}
```
But it's only used for *filtering*, not for the return value. The return uses `lookupCategoryId(name)`. **Fix: use `categoryUuidByName.get(name) ?? lookupCategoryId(name)` as the `id` in the return value.**

### Fix 2: Client-side — Fix `fetchEmails` stale closure in mode changes (fix #1244)

**File:** `client/src/hooks/useInboxModeChanges.ts`

The comment says fetchEmails is intentionally not in deps because "fetchEmails uses mode from its closure." But this is **wrong** — `fetchEmails` is a `useCallback` that closes over `mode`, so calling a stale `fetchEmails` uses the stale mode.

**Change:** Add `fetchEmails` to the useEffect dependency array. Remove the misleading comment. The effect already guards with `prevModeForFetchRef` to prevent double-fetches, so adding `fetchEmails` as a dep won't cause issues — the mode guard will prevent re-running when only `fetchEmails` identity changes without a mode change.

```typescript
useEffect(() => {
  // ... existing logic ...
}, [mode, hasInitiallyLoaded, user, authLoading, fetchEmails]);
```

### Fix 3: Client-side — Fix stale cache on mode switch (fix #1244 secondary)

**File:** `client/src/hooks/useEmailFetching.ts`

In `fetchEmailsImpl`, the stale-while-revalidate cache check uses the **new mode's** cache. But on a mode switch, the old mode's data is still displaying. The issue is that `clearCategoryState` is dispatched in `setMode` (in `useInboxState`), which clears Redux, but the localStorage cache for the new mode may still have stale data.

**Change:** In `setMode` (useInboxState.ts), also call `clearCacheForMode(newMode)` to ensure the new mode starts fresh. Alternatively, skip the stale-while-revalidate path when `loadingModeSwitch` is true (indicating this is a mode switch, not a navigation-back).

Actually, the simpler fix: `useInboxModeChanges` already calls `setEmails([])` before `fetchEmails()`. The stale-cache issue is that `fetchEmails` serves from cache. Since mode switches should always show fresh data, add an `overrideFilters` or a `skipCache` flag to `fetchEmails`, or just clear the mode's cache before fetching:

In `useInboxModeChanges`, before `fetchEmails()`:
```typescript
import { clearCacheForMode } from 'utils/emailCache';
// ...
clearCacheForMode(mode); // Clear cache for the NEW mode before fetching
```

### Fix 4: Client-side — Remove duplicate auto-collapse effects (fix #1245)

**Files:** 
- `client/src/components/inbox/CategoryAccordion.tsx`
- `client/src/components/inbox/InboxContentParts.tsx` (InboxCategoryItem)

There are TWO auto-collapse effects competing:

1. `CategoryAccordion.tsx` lines ~282-293: collapses when `emails.length` drops to 0 while expanded
2. `InboxCategoryItem` in `InboxContentParts.tsx`: collapses when `isLoaded && categoryEmails.length === 0 && isExpanded && categoryItem.count === 0`

These can race each other. **Remove the auto-collapse from `CategoryAccordion.tsx`** — the parent `InboxCategoryItem` has better context (it checks both `isLoaded` and `categoryItem.count`).

**Additionally:** The `InboxCategoryItem` auto-collapse should also check that the category is not still loading (`!loadingCategoryNames.includes(categoryKey)`) to avoid collapsing during the initial fetch.

### Fix 5: Client-side — Use category key (UUID) for summary count operations (fix #1246)

**File:** `client/src/store/slices/inboxDataSlice.ts`

The `decrementCategorySummaryCount` and `incrementCategorySummaryCount` reducers match by `cat.name`. When the email's category name doesn't exactly match the summary item's name, the count operation is a no-op.

**Change:** Accept either a category key (UUID) or name, and match by both:

```typescript
decrementCategorySummaryCount: (state, action: PayloadAction<string | { categoryKey?: string; categoryName: string; count: number }>) => {
  const payload = typeof action.payload === 'string' 
    ? { categoryKey: undefined, categoryName: action.payload, count: 1 } 
    : action.payload;
  if (state.categorySummary) {
    const category = state.categorySummary.find(cat => 
      (payload.categoryKey && cat.id === payload.categoryKey) || cat.name === payload.categoryName
    );
    if (category) {
      category.count = Math.max(0, category.count - payload.count);
    }
  }
},
```

**Also update callers** to pass `categoryKey` when available:
- `useEmailActionsBase.ts` `handleArchive`: pass `email.category_id` as `categoryKey`

### Fix 6: Client-side — Remove empty categories from summary state (fix #1246, non-hacky)

**Per Jeremy's explicit instruction:** "Fix the data model so empty categories are naturally excluded from the render list."

**File:** `client/src/store/slices/inboxDataSlice.ts`

Add a post-decrement cleanup in `decrementCategorySummaryCount`: after decrementing, if `category.count === 0`, remove it from `categorySummary` entirely. Also check if there are any emails remaining for that category in `state.emails` — only remove from summary if both count === 0 AND no emails remain.

```typescript
decrementCategorySummaryCount: (state, action) => {
  // ... find and decrement ...
  if (category && category.count === 0) {
    // Check if any emails still exist for this category
    const hasEmails = state.emails.some(email => 
      email.category_id === category.id || email.category === category.name
    );
    if (!hasEmails) {
      state.categorySummary = state.categorySummary!.filter(cat => cat !== category);
    }
  }
},
```

This means `buildDisplayCategories` (which already filters `cat.count > 0`) AND the render loop's hide guard are both naturally satisfied — the category simply doesn't exist in the summary anymore.

**Also:** In `removeEmail`, after removing the email, check if this was the last email in its category and decrement/remove the summary entry:

```typescript
removeEmail: (state, action: PayloadAction<string>) => {
  const email = state.emails.find(e => e.id === action.payload);
  if (email) {
    const catKey = email.category_id || email.category || 'Other';
    state.emails = state.emails.filter(e => e.id !== action.payload);
    // Clean up category summary if this was the last email
    if (state.categorySummary) {
      const remaining = state.emails.filter(e => 
        (e.category_id || e.category || 'Other') === catKey
      );
      if (remaining.length === 0) {
        const summaryItem = state.categorySummary.find(cat => 
          cat.id === catKey || cat.name === catKey
        );
        if (summaryItem) {
          summaryItem.count = 0;
          state.categorySummary = state.categorySummary.filter(cat => cat !== summaryItem);
        }
      }
    }
  } else {
    state.emails = state.emails.filter(e => e.id !== action.payload);
  }
},
```

This is the **non-hacky** fix: when the data model (Redux state) loses all emails for a category, it also loses the category from the summary. The UI render loop doesn't need any `if (empty) return null` guards — the category simply isn't in the data.

---

## Files to Change

| File | Changes |
|------|---------|
| `server/src/emails/emails.service.ts` | Use `categoryUuidByName` as primary UUID source in `getInboxSummary` return |
| `client/src/hooks/useInboxModeChanges.ts` | Add `fetchEmails` to effect deps, clear cache for new mode before fetch |
| `client/src/components/inbox/CategoryAccordion.tsx` | Remove auto-collapse useEffect (defer to parent) |
| `client/src/components/inbox/InboxContentParts.tsx` | Add loading guard to InboxCategoryItem auto-collapse |
| `client/src/store/slices/inboxDataSlice.ts` | Fix `decrementCategorySummaryCount` to match by UUID; auto-remove empty categories from summary in both `decrementCategorySummaryCount` and `removeEmail` |
| `client/src/hooks/useEmailActionsBase.ts` | Pass `category_id` (UUID) to decrement action |

## Testing

1. **#1248:** Check network tab — all `categoryIds=` params should be UUIDs, never names
2. **#1244:** Switch between Triage→Action→Follow Up→Triage — emails should reload each time
3. **#1245:** First accordion should open/close on click without sticking
4. **#1246:** Archive all emails in a category one by one — accordion should disappear when last email is archived (no page refresh needed)
5. **Regression:** Verify category counts are accurate after archiving, starring, snoozing
6. **Regression:** Verify localStorage cache doesn't cause stale data on rapid tab switches

## Risk Assessment

- **Fix 1 (server UUID):** Low risk — changes only the return value source, not the query logic
- **Fix 2 (fetchEmails deps):** Low risk — the `prevModeForFetchRef` guard prevents double-fetching
- **Fix 3 (cache clear):** Low risk — mode switches already clear Redux state, this aligns cache
- **Fix 4 (auto-collapse):** Medium risk — removing an effect could miss edge cases where parent doesn't fire. Mitigated by the parent's effect being more comprehensive.
- **Fix 5+6 (summary cleanup):** Medium risk — modifying Redux reducers. Needs thorough testing of archive/star/snooze flows.

---

*Monk of Modularity — 🧘 Understanding the root before pruning the branches.*
