# Plan: Fix #1550 — Correct category sort order in action tab

## Problem

In the action tab, "Newsletters" appears above "Automated system events" despite Newsletters having a maximum thread priority of -1 (very low). Other categories have much higher priority values and should appear first.

## Root Cause

**File**: `server/src/emails/email-inbox.service.ts` — `countRowsByCategory()` (line ~232)

The `getInboxSummary` endpoint builds the `categoryOrder` array by **insertion order** as it iterates through SQL rows. The SQL query orders individual threads by `COALESCE(thread."priorityScore", 0) DESC`, so the first thread encountered for each category determines that category's position in the list.

This approach is fragile because:
1. A category's position depends on its **single highest-priority thread** that survives `shouldSkipSummaryRow` filtering — not on a deliberate category-level sort.
2. In the action tab, `shouldSkipSummaryRow` filters out threads where the user sent the last message. After filtering, the iteration order can produce unexpected category ordering. If all high-priority threads from a category get filtered out, a lower-priority category might appear first simply because its surviving threads are encountered earlier.
3. Categories with only very low priority threads (like Newsletters at -1) can appear above categories with many high-priority threads if the filtering and iteration order happen to produce that result.

**Frontend impact**: The frontend (`useInboxCategorySync.ts`) initializes `stableCategoryOrder` from the server's category order on first load and only appends new categories — it never re-sorts. So a bad initial order from the server persists for the session.

## Fix

### Server-side (primary fix)

**File**: `server/src/emails/email-inbox.service.ts`

In `countRowsByCategory()`, track each category's maximum surviving thread priority. After iterating all rows, sort `categoryOrder` by max priority descending before returning.

```typescript
// In countRowsByCategory(), add tracking:
const categoryMaxPriority: Record<string, number> = {};

// Inside the row loop, after determining the category name:
const threadPriority = /* need to include priorityScore in the row type */;
if (!categoryOrder.includes(category)) {
  categoryOrder.push(category);
  categoryThreadIds[category] = [];
  categoryMaxPriority[category] = threadPriority;
} else {
  categoryMaxPriority[category] = Math.max(categoryMaxPriority[category], threadPriority);
}

// Before returning, sort categoryOrder:
categoryOrder.sort((a, b) => {
  const prioA = categoryMaxPriority[a] ?? 0;
  const prioB = categoryMaxPriority[b] ?? 0;
  return prioB - prioA; // descending: higher priority first
});
```

The SQL query already selects thread data but does NOT currently include `priorityScore` in the row projection. We need to add it:

**In `getInboxSummary()` SQL query** (~line 103):
- Add `thread."priorityScore"` to the SELECT clause
- Add `priorityScore` to the row type definition

### Detailed changes

1. **`getInboxSummary()` SQL query** — Add `thread."priorityScore"` to SELECT:
   ```sql
   SELECT thread."categoryId", uc."contextValue" AS "categoryName",
          latest_email."latestFrom",
          thread_labels."allLabels",
          thread."priorityScore"${threadIdSelect}
   ```

2. **Row type** — Add `priorityScore?: number | null` to the row type cast.

3. **`countRowsByCategory()`** — Accept `priorityScore` in the row type, track max priority per category, and sort `categoryOrder` before returning:
   - Add `priorityScore?: number | null` to the `rows` type parameter
   - Add `categoryMaxPriority: Record<string, number>` tracking
   - In the loop, update max priority: `categoryMaxPriority[category] = Math.max(categoryMaxPriority[category] ?? -Infinity, row.priorityScore ?? 0)`
   - Before return: `categoryOrder.sort((a, b) => (categoryMaxPriority[b] ?? 0) - (categoryMaxPriority[a] ?? 0))`

4. **Tests** — Add/update tests in `email-inbox.service.spec.ts` to verify:
   - Categories are returned sorted by max thread priority descending
   - Newsletters (max priority -1) appears after categories with higher priority
   - Categories with equal max priority maintain stable order
   - NULL priorityScore is treated as 0

### Frontend (no changes needed)

The frontend's `stableCategoryOrder` and `buildDisplayCategories` already faithfully preserve the server's ordering. Once the server returns correctly sorted categories, the frontend will display them correctly.

## Testing

1. **Unit test**: Mock `countRowsByCategory` input with threads from multiple categories at different priorities. Assert `categoryOrder` is sorted by max priority descending.
2. **Integration test**: Call `getInboxSummary` for action mode with a user who has:
   - "Newsletters" category with max priorityScore = -1
   - "Automated system events" category with max priorityScore > 0
   - Assert Newsletters appears after Automated system events in the response

## Risk Assessment

- **Low risk**: This is a sort-order change on an existing array. No new data is fetched, no schema changes.
- **Backward compatible**: The API response shape doesn't change, only the ordering of `categories[]`.
- **Performance**: Sorting a small array (typically <20 categories) is negligible.

## Files to modify

| File | Change |
|------|--------|
| `server/src/emails/email-inbox.service.ts` | Add `priorityScore` to SQL SELECT, row type, and `countRowsByCategory`; sort `categoryOrder` by max priority |
| `server/src/emails/email-inbox.service.spec.ts` | Add tests for category sort order |
