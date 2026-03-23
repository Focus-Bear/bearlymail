# Plan: Fix #1404 — Triage inbox category count mismatch + accordion stays open after archiving

## Issue Summary

Two bugs reported in triage inbox:

1. **Category count mismatch**: "Other" category shows Summary Count: 2 but Loaded Count: 0 in debug panel, with message "No emails loaded despite summary count > 0!"
2. **Accordion stays open after archiving**: After archiving all emails from a category, the accordion stays expanded showing 0 items instead of collapsing or hiding.

## Investigation Findings

### Bug 1: Debug Panel Count Mismatch for "Other" Category

**Root cause identified** in `client/src/components/inbox/debug/DebugCategorySummarySection.tsx`, function `getLoadedEmailsForCategory`:

```typescript
const getLoadedEmailsForCategory = (categoryKey: string, emails: Email[]): Email[] => {
  if (categoryKey === CATEGORY_OTHER) {  // CATEGORY_OTHER = "Other"
    return emails.filter(
      event => !event.isArchived && (event.category === null || ...)
    );
  }
  return emails.filter(event => !event.isArchived && event.category === categoryKey);
};
```

The `categoryKey` for the "Other" category is computed via `getCategoryKey(null, "Other")` which returns `"uncategorized"` (not `"Other"`). Since `"uncategorized" !== CATEGORY_OTHER ("Other")`, the function falls through to the else branch and tries to match `event.category === "uncategorized"`, which never matches any emails.

**Important context**: The actual email display in the inbox works correctly. The category key system (`"uncategorized"` for null-ID categories) is consistent across:
- `useEmailFetching.getCategoryKey()` → `"uncategorized"`
- `CategorySection.tsx` → looks up `emailCategoryMap.get("uncategorized")` ✓
- `groupEmailsByCategory()` → keys by `getCategoryKey(email.category_id, ...)` ✓
- `updateCategoryEmails` reducer → stores under `"uncategorized"` key ✓
- `buildCategoryParams` → sends `categoryIds=uncategorized` to server ✓
- Server `applyPostQueryFilters` → recognizes `"uncategorized"` as null-category bucket ✓

**The bug is debug-panel-only.** The `getLoadedEmailsForCategory` helper uses `CATEGORY_OTHER` ("Other") as the check instead of `CATEGORY_KEY_UNCATEGORIZED` ("uncategorized"), creating a false mismatch in the debug display. However, this false mismatch also triggers the limbo-recovery logic (Effect 2 in `useInboxCategoryAccordion`) which may cause unnecessary re-fetches for the "Other" category.

Additionally, the `summaryItem` lookup in `fetchCategoryEmailsImpl` when emails.length === 0:
```typescript
const summaryItem = categorySummaryRef.current?.find(
  (item) => item.id === categoryId || item.name === categoryName
);
```
For "Other": `categoryId` is undefined/null, so `item.id === undefined` never matches. But `item.name === "Other"` does match. This works but is fragile.

### Bug 2: Accordion Stays Open After Archiving

**Root cause**: Race between optimistic updates and the archive-all callback flow.

#### Scenario A: Archive All (bulk)
In `CategoryAccordion.tsx`, `handleConfirmArchive`:
```typescript
const handleConfirmArchive = useCallback(async () => {
    setShowArchiveConfirmation(false);
    if (onArchiveAll) {
      await onArchiveAll(category, emailIds);  // Optimistic removal + await API
      onToggle();  // Collapse accordion
      onAfterCollapse?.();
    }
}, [...]);
```

Flow:
1. `onArchiveAll` calls `handleBulkArchiveByIds` which:
   - Optimistically removes emails from Redux state
   - Decrements category count to 0
   - Category may be removed from `categorySummary` 
   - `buildDisplayCategories` filters out count=0 categories → `CategorySection` not rendered → accordion unmounted
2. `await axios.post(...)` — during this await, React re-renders, accordion is gone
3. `onToggle()` runs after the await — component is already unmounted, toggle updates `expandedCategories` but has no visual effect
4. The category key remains in `expandedCategories`
5. If the category reappears later (summary refresh, new emails), accordion renders expanded

**The `onToggle()` fires too late** — by the time the API resolves, the component is already unmounted. The category key is never removed from `expandedCategories`.

#### Scenario B: Single email archive (last email in category)  
In `useEmailActionsBase.ts`, `handleArchive`:
1. `decrementCategorySummaryCount` runs immediately → count = 0
2. `removeEmail` is delayed by `EMAIL_EXIT_ANIMATION_DURATION_MS`
3. During the delay: count = 0 BUT email still in state → `buildDisplayCategories` filters count=0 → accordion gone
4. The category key remains in `expandedCategories` — no collapse triggered

**In both cases, the key stays in `expandedCategories` after the category disappears.** This means if the category reappears on next refresh, it will be expanded.

#### Scenario C: Category doesn't disappear
If `decrementCategorySummaryCount` successfully decrements to 0 but the `hasRemainingEmails` check in the reducer finds emails still present (during animation delay for single archive), the category stays in `categorySummary` with count=0. `buildDisplayCategories` filters `cat.count > 0` → category excluded. Accordion hidden. But again, key stays in `expandedCategories`.

## Fix Plan

### Fix 1: Debug panel `getLoadedEmailsForCategory` — use correct key

**File**: `client/src/components/inbox/debug/DebugCategorySummarySection.tsx`

**Change**: Update `getLoadedEmailsForCategory` to use `CATEGORY_KEY_UNCATEGORIZED` instead of `CATEGORY_OTHER`:

```typescript
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';

const getLoadedEmailsForCategory = (categoryKey: string, emails: Email[]): Email[] => {
  if (categoryKey === CATEGORY_KEY_UNCATEGORIZED) {
    return emails.filter(
      event =>
        !event.isArchived &&
        (!event.category_id || event.category_id === null)
    );
  }
  // UUID-based lookup: match by category_id, not category name
  return emails.filter(event => !event.isArchived && event.category_id === categoryKey);
};
```

This also changes the else branch to match by `category_id` (UUID) instead of `category` (name string), which is consistent with the UUID-only keying used everywhere else.

### Fix 2: Auto-collapse accordion when category becomes empty

**File**: `client/src/hooks/useInboxCategoryAccordion.ts`

**Change**: Add an effect that removes keys from `expandedCategories` when their category count reaches 0 (or the category disappears from the summary):

```typescript
// Effect: Auto-collapse categories that became empty
useEffect(() => {
  if (!categorySummary) return;
  
  const validKeys = new Set(
    categorySummary
      .filter(cat => cat.count > 0)
      .map(cat => getCategoryKey(cat.id, cat.name))
  );
  
  setExpandedCategories(prev => {
    const next = new Set<string>();
    for (const key of prev) {
      if (validKeys.has(key)) {
        next.add(key);
      }
    }
    // Only update if something actually changed
    if (next.size === prev.size) return prev;
    return next;
  });
}, [categorySummary]);
```

This ensures that:
- When a category's count drops to 0 (via optimistic decrement), its key is removed from `expandedCategories`
- When a category is removed from the summary entirely, its key is cleaned up
- No stale expanded keys persist across refreshes

### Fix 3: Pre-emptive collapse in `handleConfirmArchive`

**File**: `client/src/components/inbox/CategoryAccordion.tsx`

**Change**: Call `onToggle()` BEFORE `onArchiveAll`, not after. This ensures the accordion collapses immediately on the user's confirmation click, before the optimistic removal unmounts the component:

```typescript
const handleConfirmArchive = useCallback(async () => {
    setShowArchiveConfirmation(false);
    if (onArchiveAll) {
      onToggle();  // Collapse FIRST
      onAfterCollapse?.();
      await onArchiveAll(category, emailIds);  // Then archive
    }
}, [...]);
```

This provides immediate visual feedback (accordion collapses) and ensures the toggle runs while the component is still mounted. The subsequent optimistic removal will then hide the category entirely.

### Fix 4 (defensive): Clean stale keys in `resetForModeChange`

**File**: `client/src/hooks/useInboxCategoryAccordion.ts`

The existing `resetForModeChange` already clears `expandedCategories`. No change needed — this is just documenting that mode switches are already handled.

## Files to Change

| File | Change | Risk |
|------|--------|------|
| `client/src/components/inbox/debug/DebugCategorySummarySection.tsx` | Fix `getLoadedEmailsForCategory` to use `CATEGORY_KEY_UNCATEGORIZED` and `category_id` | Low — debug panel only |
| `client/src/hooks/useInboxCategoryAccordion.ts` | Add auto-collapse effect for empty categories | Medium — affects accordion state management |
| `client/src/components/inbox/CategoryAccordion.tsx` | Move `onToggle()` before `onArchiveAll` in `handleConfirmArchive` | Low — only changes timing of collapse |

## Testing

1. **Debug panel fix**: Open debug panel, verify "Other" category shows correct Loaded Count matching Summary Count
2. **Archive All**: Click Archive All on any category → accordion should collapse immediately, then category should disappear
3. **Single archive (last email)**: Archive the last email in a category → accordion should collapse and category should disappear after animation
4. **Category reappearance**: After archiving all from "Other", if new uncategorized emails arrive, the accordion should NOT be auto-expanded (unless it's in the top 3 for initial preload)
5. **Regression**: Verify normal expand/collapse still works, category loading still triggers on expand, limbo recovery still works

## Out of Scope

- Server-side changes: The server correctly returns `id: null` for the "Other" category — this is working as designed
- The `fetchCategoryEmailsImpl` stale-UUID detection path for null categoryId — this is already handled correctly (guard: `if (emails.length === 0 && categoryId)` — the `categoryId` check prevents false triggers for "Other")
