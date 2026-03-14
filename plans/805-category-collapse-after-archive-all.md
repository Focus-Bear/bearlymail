# Plan: #805 — After archiving all emails in a category, the category should collapse/disappear

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/805

---

## Problem Analysis

When all emails in a category are archived, the category accordion remains visible (empty/expanded). It should auto-collapse and ideally disappear from the visible list, but archive feedback (the undo toast) should still be accessible even when the category is collapsed.

---

## Root Cause Hypothesis

### No auto-collapse logic
`CategoryAccordion` in `client/src/components/inbox/CategoryAccordion.tsx` does not watch the email count and auto-collapse when it hits 0. The `isExpanded` state is controlled externally (in the parent `Inbox` or `TriageInbox` components), and nothing responds to email count hitting 0.

### Archive feedback visibility when collapsed
`ArchiveConfirmationToast` is rendered inside the accordion body. If the category auto-collapses on empty, the toast disappears with it. The toast needs to be rendered at a higher level (above the accordion) so it persists.

---

## Implementation Steps

### Step 1: Auto-collapse category when email count drops to 0

**File:** `client/src/pages/Inbox.tsx` (or `FocusedInbox.tsx` / wherever `CategoryAccordion` is rendered)

- When the `emails` prop for a category becomes an empty array (all archived), trigger a collapse (set `isExpanded = false` for that category).
- Use a `useEffect` that watches the email count per category and calls `onToggle` or sets a local `expandedCategories` state.

**Alternative (simpler): Handle in `CategoryAccordion` itself:**

**File:** `client/src/components/inbox/CategoryAccordion.tsx`

- Add a `useEffect` in `CategoryAccordion` that calls `onToggle()` (to collapse) when `emails.length === 0` and the accordion is currently expanded.
- After collapsing, the empty category div can either:
  a. Stay visible but collapsed (shows "0 emails" in badge) — less clean but easier.
  b. Be hidden entirely (`display: none` or not rendered) — cleaner but needs parent coordination.

For option (b): The parent must filter out categories with `emailCount === 0` from the rendered list. Add `emails.filter(cat => cat.emails.length > 0)` before the map in the inbox page.

### Step 2: Keep archive feedback (undo toast) visible after collapse

**File:** `client/src/components/inbox/CategoryAccordion.tsx` and/or `client/src/pages/Inbox.tsx`

**Current issue:** `ArchiveConfirmationToast` is inside the accordion. When the accordion collapses or the category disappears from DOM, the toast goes with it.

**Fix options:**

**Option A (recommended):** Move the archive confirmation/undo toast to a portal or to the top-level inbox page, outside the accordion hierarchy.
- When archiving all emails in a category, the toast/undo state is managed at the inbox level, not inside `CategoryAccordion`.
- The `onArchiveAll` callback (already at inbox level) can trigger a top-level undo toast.

**Option B:** Keep the accordion in DOM (collapsed, zero count) for as long as the undo period (e.g., 5 seconds), then remove it.
- Use a timeout: after `onArchiveAll` completes, wait 5s before hiding the category from the list.

**Recommended:** Option A — lift the archive undo toast out of `CategoryAccordion` entirely.

**File:** `client/src/components/inbox/ArchiveConfirmationToast.tsx`
- Render via React portal (`ReactDOM.createPortal`) into document body so it persists regardless of category accordion state.

### Step 3: Smooth transition

**File:** `client/src/components/inbox/CategoryAccordion.tsx`

- Add a CSS transition when a category disappears (fade-out/slide-up) to avoid jarring removal.
- Example: set `opacity: 0` and `height: 0` over 300ms before removing from DOM.

---

## Files to Modify

| File | Change |
|------|--------|
| `client/src/components/inbox/CategoryAccordion.tsx` | Add auto-collapse useEffect when emails.length === 0 |
| `client/src/pages/Inbox.tsx` (or parent) | Filter out empty categories from rendered list; manage undo toast at page level |
| `client/src/components/inbox/ArchiveConfirmationToast.tsx` | Render via portal (or move state up) so it persists after category collapse |

---

## Testing Approach

1. **Manual test — single archive:**
   - Archive the last email in a category using the email row action.
   - Verify the category collapses/disappears.
   - Verify any undo toast is still visible.

2. **Manual test — archive all:**
   - Click "Archive All" on a category with multiple emails.
   - Verify the category collapses (with undo feedback visible).
   - Click undo — verify emails are restored and category re-expands.

3. **Unit test:**
   - `CategoryAccordion` with `emails={[]}` and `isExpanded={true}` — `onToggle` should be called once on mount/update.

4. **Edge case:**
   - Multiple categories: archiving all in one should not affect other categories' expanded state.
   - Re-categorising emails back: category should re-appear / re-expand if new emails arrive.

---

## Notes

- The `count` prop (from inbox summary) and `emails.length` may differ during loading. Use `emails.length` for collapse logic since that reflects actual loaded state.
- Consider whether the "category disappears" vs "category collapses" UX is the right choice. The issue says "collapse/disappear" — preference for disappear (cleaner), but collapse is safer as a first implementation.
