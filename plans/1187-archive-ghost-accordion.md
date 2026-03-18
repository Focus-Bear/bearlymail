# Plan: Fix Collapsed Archive Leaves Empty Accordion Ghost (#1187)

## Summary

Archiving all emails from a **collapsed** accordion (without expanding it first) leaves a 0-count
accordion ghost in the inbox instead of removing it.

---

## Root Cause Analysis

### The Archive-All Button on a Collapsed Accordion

`CategoryAccordion.tsx` renders the "Archive All" button in `CategoryAccordionHeader` whenever
`hasArchiveAll && emailCount > 0`. Critically:

```tsx
const emailCount = count !== undefined ? count : emails.length;
```

The `count` prop is `categoryItem.count` (the server summary count) when the accordion is **not
loaded**, and falls back to `emails.length` (local Redux state) once loaded. So the button is
shown based on the *summary count* even when the category emails have never been fetched.

### What Happens When the Accordion Is NOT Expanded

When the user confirms the "Archive All" toast, `handleConfirmArchive` in `CategoryAccordion.tsx`
fires:

```tsx
const handleConfirmArchive = useCallback(async () => {
  setShowArchiveConfirmation(false);
  if (onArchiveAll) {
    await onArchiveAll(category, emailIds);  // emailIds = emails.map(e => e.id)
    onToggle();
    onAfterCollapse?.();
  }
}, [onArchiveAll, category, emailIds, onToggle, onAfterCollapse]);
```

`emailIds` is derived from `emails` (the `emails` prop), which comes from `emailCategoryMap.get(categoryKey)?.emails`. **When the accordion has never been expanded, no fetch has been dispatched for that category, so `emails` is `[]` and `emailIds` is `[]`.**

This empty `[]` array bubbles up to `handleArchiveAll` in `InboxCategoryItem`:

```tsx
const handleArchiveAll = async (catName: string, ids: string[]) => {
  if (!onBulkArchive) return;
  if (ids && ids.length > 0) {
    await onBulkArchive(ids);  // ← skipped! ids is empty
    return;
  }
  try {
    // fallback: fetch emails from the API then archive
    const response = await axios.get(`${API_URL}/emails/inbox?...`);
    const fetchedEmails = response.data?.emails || [];
    const fetchedIds = fetchedEmails.map((email: any) => email.id).filter(Boolean);
    if (fetchedIds.length > 0) {
      await onBulkArchive(fetchedIds);
    }
  } catch (err) {
    console.error('[InboxContent] Failed to load category emails for archive:', err);
  }
};
```

The fallback branch correctly fetches emails from the API and calls `onBulkArchive(fetchedIds)`.
This part **works** — the emails are archived on the server. However, see below for the summary
count bug.

### What Happens to the Category Summary Count

`onBulkArchive` (ultimately `handleBulkArchiveByIds` in `useBulkEmailActions.ts`) calls
`collectArchiveTargets`:

```ts
function collectArchiveTargets(emailIds: string[], emails: Email[]) {
  const emailsById = new Map(emails.map(email => [email.id, email]));
  const emailsToArchive: Email[] = [];
  const categoryCountChanges = new Map<string, number>();

  emailIds.forEach(id => {
    const email = emailsById.get(id);  // ← only finds emails in Redux store!
    if (email) {
      emailsToArchive.push(email);
      const categoryName = email.category || CATEGORY_OTHER;
      categoryCountChanges.set(categoryName, ...);
    }
  });

  return { emailsToArchive, categoryCountChanges };
}
```

`emails` here is the **Redux store's email list** (`selectEmails`). Because the category was
never expanded (never fetched), **its emails are not in the Redux store**. So
`categoryCountChanges` is empty. The subsequent `decrementCategorySummaryCount` dispatch is
**never called for this category**.

Result: The server archives the emails, but the client-side `categorySummary[x].count` remains
at its original value (e.g. `3`).

### How the Accordion Is Removed from the List

In `InboxCategoryList` (inside `InboxContentParts.tsx`), each category is filtered:

```tsx
if (isLoaded && categoryEmails.length === 0 && categoryItem.count === 0) {
  return null;  // hidden
}
```

Two conditions must BOTH be true:
1. `isLoaded` — the category has been fetched at least once
2. `categoryItem.count === 0` — the server summary count is zero

The collapsed archive path:
- **Never calls `markCategoryLoaded`** for this category (no fetch was done via the accordion
  expand flow), so `isLoaded` remains `false`
- **Never decrements `categorySummary[x].count`** (because `collectArchiveTargets` found no
  emails in the store), so `count` remains non-zero

Because NEITHER condition is met, `return null` is never hit → **ghost accordion persists**.

Even if the fallback fetch returned emails and archived them, `handleConfirmArchive` then calls
`onToggle()` (collapses the accordion) and `onAfterCollapse?.()`. But collapsing a previously
collapsed accordion is a no-op (toggle closes an already-closed state), and neither
`InboxCategoryItem`'s useEffect nor `CategoryAccordion`'s wasExpandedWithEmailsRef effect fires
(because `isExpanded` was already `false`).

### Summary of the Ghost

| Condition for hiding | Collapsed-archive path |
|---|---|
| `isLoaded === true` | ❌ never loaded → stays `false` |
| `categoryItem.count === 0` | ❌ count not decremented → stays `> 0` |

Both must be true to hide. Neither is satisfied → ghost.

---

## Fix Plan

### Option A — Decrement summary count from the fallback fetch (recommended)

**Location:** `InboxCategoryItem.handleArchiveAll` in `InboxContentParts.tsx`

After the fallback API fetch succeeds and `onBulkArchive(fetchedIds)` completes, **also**
dispatch `decrementCategorySummaryCount` for the full count of archived emails using the
category name. This mirrors exactly what the expanded path does for in-store emails.

Additionally, to satisfy the `isLoaded` guard, dispatch `markCategoryLoaded(categoryKey)` after
a successful fallback archive so the hide condition evaluates correctly on the next render.

**Pseudocode diff:**

```tsx
// InboxContentParts.tsx — InboxCategoryItem.handleArchiveAll (the fallback branch)
const response = await axios.get(`${API_URL}/emails/inbox?...`);
const fetchedEmails = response.data?.emails || [];
const fetchedIds = fetchedEmails.map((email: any) => email.id).filter(Boolean);
if (fetchedIds.length > 0) {
  await onBulkArchive(fetchedIds);
  // NEW: mark as loaded + decrement summary so the ghost disappears
  dispatch(markCategoryLoaded(categoryKey));
  dispatch(decrementCategorySummaryCount({ categoryName: categoryItem.name, count: fetchedIds.length }));
}
```

`InboxCategoryItem` needs access to `dispatch` (add `useDispatch()` hook) and the `categoryKey`
(already available as a prop). `markCategoryLoaded` and `decrementCategorySummaryCount` are
already imported in sibling hooks; add them to the imports in `InboxContentParts.tsx`.

This satisfies both guard conditions:
- `isLoaded === true` → `return null` can fire
- `categoryItem.count === 0` → the badge shows 0 and the hide logic removes it

### Option B — Alternative: force-remove category from summary list

Instead of decrementing count + marking loaded, directly splice the category from the Redux
`categorySummary` array when all its emails are archived via the fallback path. This is more
aggressive but has the same effect.

Less preferred because it bypasses the normal count-based optimistic update pattern.

### Option C — Expand then archive (avoid the collapsed path entirely)

Force-expand the category before archiving. Reject this approach because:
- It causes an unwanted visible expand → fetch → collapse UX flash
- It is slower (requires a round-trip before archiving)
- It defeats the purpose of "archive without expanding"

---

## Affected Files

| File | Change |
|---|---|
| `client/src/components/inbox/InboxContentParts.tsx` | `InboxCategoryItem.handleArchiveAll` fallback branch — dispatch `markCategoryLoaded` + `decrementCategorySummaryCount` |
| `client/src/store/slices/emailSlice.ts` | No change required |
| `client/src/hooks/useBulkEmailActions.ts` | No change required |

---

## Tests Needed

- Unit test for `handleArchiveAll` fallback path: verify that when `ids` is empty, the API is
  called, and after a successful archive `markCategoryLoaded` and
  `decrementCategorySummaryCount` are dispatched with the correct count.
- Integration-style test on `InboxCategoryItem`: after fallback archive, the category is absent
  from the rendered list (i.e. `return null` fires).

---

## Risk: partial fetch (INBOX_FETCH_LIMIT pagination)

The fallback fetch uses `limit = INBOX_FETCH_LIMIT` (currently 50). If a category has more than
50 emails, the fallback will only archive the first page and the count decrement will be too
small.

This is a pre-existing limitation of the fallback fetch, not introduced by this fix. Codebeard
should leave a TODO comment noting the pagination gap but should not block the fix on it.

---

## Files Modified / Created in This PR

- `plans/1187-archive-ghost-accordion.md` (this file)

_Authored by Monk of Modularity (AI agent). Implementation to follow in a separate Codebeard PR._
