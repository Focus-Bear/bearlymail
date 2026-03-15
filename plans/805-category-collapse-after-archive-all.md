# Plan: #805 — After archiving all emails in a category, the category should collapse/disappear

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/805
> **Previous implementation:** PR #817 was closed without merging — please review notes below.

---

## Problem Analysis

When all emails in a category are individually archived (one by one), the category accordion remains visible and expanded — showing an empty state. It should auto-collapse and/or disappear when its email count hits 0.

**Note:** The "Archive All" flow in `CategoryAccordion.handleConfirmArchive` already calls `onToggle()` to collapse after bulk archive. The bug is specifically about archiving emails **one by one** until the category is empty — no collapse happens.

---

## Root Cause

`useInboxCategoryAccordion` maintains `expandedCategories` as a `Set<string>`. Nothing in the accordion code watches the email count per category and auto-collapses when a category's email count drops to 0.

The `displayCategories` array (built by `buildDisplayCategories` in `inboxCategoryHelpers.ts`) tracks category email counts. When an email is archived, `filteredEmails` (which filters out archived emails) shrinks, and `emailCategoryMap` updates. But `expandedCategories` never responds to this change.

---

## Implementation Steps

### Step 1: Auto-collapse when category email count drops to 0

**File:** `client/src/hooks/useInboxCategoryAccordion.ts`

Add a new effect that watches `displayCategories` (or `emailCategoryMap`) and collapses any expanded category whose email count is now 0:

```typescript
// After all categories are loaded and rendered, auto-collapse empty ones
useEffect(() => {
  if (!displayCategories.length) return;
  setExpandedCategories(prev => {
    let changed = false;
    const next = new Set(prev);
    for (const cat of displayCategories) {
      const key = getCategoryKey(cat.id, cat.name);
      if (next.has(key) && cat.count === 0) {
        next.delete(key);
        changed = true;
      }
    }
    return changed ? next : prev;
  });
}, [displayCategories]);
```

**Alternative location:** `client/src/components/inbox/useInboxContentState.ts` — add a similar effect that uses `emailCategoryMap`.

### Step 2: Hide empty categories from the rendered list

**File:** `client/src/components/inbox/InboxContentParts.tsx` (or where `CategoryAccordion` is rendered)

Filter out categories with 0 emails before rendering:
```typescript
const nonEmptyCategories = displayCategories.filter(cat => cat.count > 0 || loadingCategoryNames.includes(key));
```

Only hide if `count === 0` AND the category is not currently loading (to avoid flicker during load).

### Step 3: Handle undo toast visibility

**Context:** If the category disappears from DOM when all emails are archived, any in-category archive feedback toast disappears too.

**Check:** Does `ArchiveConfirmationToast` render inside `CategoryAccordion`? If yes:
- Move it to a React portal (`ReactDOM.createPortal(toast, document.body)`) so it persists regardless of accordion state.
- OR: Render the toast at the `Inbox.tsx` / `FocusedInbox.tsx` level, controlled by state lifted up from the category.

**File:** `client/src/components/inbox/ArchiveConfirmationToast.tsx` — add portal support if needed.

### Step 4: Smooth transition (optional but nice)

Add a CSS fade-out when a category collapses to avoid jarring removal. Use an `opacity` + `max-height` CSS transition with a short delay (200–300ms).

---

## Files to Modify

| File | Change |
|------|--------|
| `client/src/hooks/useInboxCategoryAccordion.ts` | Add useEffect to auto-collapse categories with 0 emails |
| `client/src/components/inbox/InboxContentParts.tsx` | Filter out empty categories from rendered list |
| `client/src/components/inbox/ArchiveConfirmationToast.tsx` | Portal-ify if needed for toast persistence |
| `client/src/components/inbox/CategoryAccordion.tsx` | Optional: add collapse transition |

---

## Testing Approach

1. **Archive last email one-by-one:**
   - Go to inbox in categorized mode
   - Archive emails in a category one at a time (using the archive button on each email card)
   - After the last email is archived, verify the category collapses/disappears
   - Verify any undo toast remains visible

2. **Archive All path (regression):**
   - Click "Archive All" on a category
   - Verify category collapses (should already work per existing code — verify no regression)

3. **Multiple categories:**
   - Archiving all emails in one category should not affect other categories

4. **Unit tests:**
   - `useInboxCategoryAccordion`: test that when `displayCategories` updates to show 0 count for a category, the expanded set removes that category

5. **Edge case:**
   - New emails arriving in an empty category should cause it to reappear (not affected by this change since it only collapses, not permanently removes)

---

## Notes for Codebeard

- Previous implementation PR #817 was closed. Check what went wrong before reimplementing.
- The `count` on `displayCategories` is from the category summary (server-side). Use `emailCategoryMap` (local, computed from loaded emails) for more accurate real-time count tracking.
- Be careful about the loading state: a category might show `count=0` briefly during loading. Guard the collapse with `!loadingCategoryNames.includes(key)`.
- Do NOT change how "Archive All" works — that already collapses the category.
