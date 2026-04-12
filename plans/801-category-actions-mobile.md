# Plan: #801 — Category actions look bad on mobile

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/801

---

## Problem Analysis

The `EmailCategoryControls` component in `client/src/components/settings/guide-ai/ContextSectionsList.tsx` has several UX problems:

1. **Compress context button is in the wrong spot** — it's currently rendered inline with the other category action buttons (Recategorize, Consolidate, Proto Categories, Compress). Per the issue, it should appear at the **top of the context section**, not alongside the category-specific buttons.
2. **Compress button should only appear when context items exceed a limit** — it's always shown, even when there are only a few context items.
3. **Broken on mobile** — the button row uses `flexWrap: 'wrap'` with `gap: 12px` and `minWidth: 260px`, which makes it overflow or look bad on small screens. On mobile viewports, the entire `EmailCategoryControls` row becomes cramped or overflows.

---

## Root Cause Hypothesis

### Wrong button placement

`handleCompressContext` lives inside `useCategoryActions` and `EmailCategoryControls` renders it inline with Recategorize/Consolidate. The issue says it should be at the top of the context section — meaning it should be a standalone button above all the `ContextSection` components in `ContextSectionsList`, not bundled with the email-category-specific controls.

### Always visible

The `CompressStatusBadge` has a visibility guard but the compress button itself has no conditional rendering. A `contexts.length > THRESHOLD` check is needed.

### Mobile layout

The button row has `minWidth: 260px` and `marginLeft: 'auto'` which pushes it off-screen or causes overflow on mobile. The flex container wrapping is insufficient.

---

## Implementation Steps

### Step 1: Move Compress Context button to top of ContextSectionsList

**File:** `client/src/components/settings/guide-ai/ContextSectionsList.tsx`

- Extract the "Compress Context" button out of `EmailCategoryControls` and render it as a standalone element at the top of `ContextSectionsList` (above the `CONTEXT_SECTIONS.map(...)`).
- It should be its own small card/row — e.g., a subtle banner that says "Your context has grown large. [Compress]".
- The button calls `actions.handleCompressContext`.

### Step 2: Add threshold guard for compress button

**File:** `client/src/components/settings/guide-ai/ContextSectionsList.tsx`

- Define a constant: `const COMPRESS_CONTEXT_THRESHOLD = 10;` (or suitable value — TBD, but start with 10 context items).
- Only render the compress button/banner when `contexts.length > COMPRESS_CONTEXT_THRESHOLD`.
- Include the `CompressStatusBadge` near this top-level banner.

### Step 3: Fix mobile layout for EmailCategoryControls

**File:** `client/src/components/settings/guide-ai/ContextSectionsList.tsx`

- Replace `marginLeft: 'auto'` with a responsive approach.
- Use `width: '100%'` on mobile breakpoints or change the parent layout from horizontal flex to vertical flex on small screens.
- Remove the hardcoded `minWidth: 260px`.
- Consider wrapping in a `@media (max-width: 640px)` style or using the app's existing responsive utilities.
- The button row for Recategorize/Consolidate/Proto should stack vertically on mobile.

### Step 4: Review the ContextSection actionButton prop rendering

**File:** `client/src/components/settings/guide-ai/ContextSection.tsx` (likely)

- Check if the `actionButton` prop for the email categories section is rendering inside a flex row that looks bad on mobile.
- If the section header has `display: flex; justify-content: space-between`, this will break on mobile. Add `flexWrap: 'wrap'` and appropriate gap.

---

## Files to Modify

| File                                                              | Change                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `client/src/components/settings/guide-ai/ContextSectionsList.tsx` | Move compress button to top, add threshold guard, fix mobile layout |
| `client/src/components/settings/guide-ai/ContextSection.tsx`      | Fix header flex layout for mobile                                   |

---

## Testing Approach

1. **Responsive test:**
   - View the Guide AI settings page at 375px (mobile), 768px (tablet), and 1280px (desktop) widths.
   - Verify the compress button appears at the top of the context section only when context count > threshold.
   - Verify the Recategorize/Consolidate/Proto buttons are usable at all viewport sizes.

2. **Functional test:**
   - Add 11+ context items, verify compress button appears.
   - With ≤10 items, verify compress button is hidden.
   - Click compress, verify the action fires and `CompressStatusBadge` shows.

3. **Visual regression:**
   - Screenshot comparison at 375px, 768px, 1280px before and after.

---

## Notes

- The threshold value (10) should be confirmed with the product team — it might need to be configurable or based on token count rather than item count.
- The compress action calls `POST /context/compress` which consolidates context — this is a relatively heavy operation. The threshold guard is a good UX safeguard.
