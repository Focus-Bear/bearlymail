# Plan: Fix Email Card Text Overflow (v2) — The ACTUAL Root Cause

**Issue:** Email body/summary text cuts off at the right edge of the card without ellipsis.
**Prior fixes that didn't fully resolve it:** #1135, #1171/#1180, #1189, #1201

## Root Cause Analysis

The overflow containment chain from the email list panel down to the text spans:

```
InboxEmailListPanel (overflowY: auto, minWidth: 0)
  └─ CategoryAccordion root div (border, borderRadius)
       └─ CSS grid container ← overflow: hidden ✅
            └─ Grid child div ← minHeight: 0 ❌ MISSING: overflow: hidden / minWidth: 0
                 └─ CategoryAccordionContent (display: flex, flexDirection: column, minWidth: 0)
                      └─ EmailListItem (display: flex, flexDirection: column, minWidth: 0)
                           └─ EmailCard .animate-fade-in (width: 100%, overflow: hidden, minWidth: 0)
                                └─ EmailPreview (display: flex, overflow: hidden)
                                     └─ <span> (overflow: hidden, textOverflow: ellipsis, whiteSpace: nowrap, minWidth: 0)
```

**The bug:** In `CategoryAccordion.tsx` (line ~440), the CSS grid animation wrapper uses:

```tsx
<div
  style={{
    display: "grid",
    gridTemplateRows: isExpanded ? "1fr" : "0fr",
    overflow: "hidden",
  }}
>
  <div style={{ minHeight: 0 }}>
    {" "}
    // ← THIS DIV
    <CategoryAccordionContent>...</CategoryAccordionContent>
  </div>
</div>
```

The inner grid child `<div style={{ minHeight: 0 }}>` is missing `overflow: hidden`. In CSS Grid with implicit column tracks (no `grid-template-columns`), the column sizing defaults to `auto`, which sizes to content. The grid child can expand horizontally beyond the grid container's bounds. While the grid container has `overflow: hidden` which clips visually, the deeply nested flex/text elements never get their width properly constrained — so `text-overflow: ellipsis` never triggers (the text just runs off and gets clipped by an ancestor's `overflow: hidden`).

This is the classic "CSS Grid / Flexbox `min-width: auto` problem" — grid/flex children default to `min-width: auto`, meaning they won't shrink below their intrinsic content width unless you explicitly set `min-width: 0` or `overflow: hidden` (which implies `min-width: 0`).

### Why previous fixes didn't work:

- **PR #1189** — Added `text-overflow: ellipsis` to inner `<span>` elements. Correct, but ellipsis can't trigger when ancestor constraints are broken.
- **PR #1201** — Added `width: 100%` to `.animate-fade-in`. Correct, but `width: 100%` calculates from the parent's width, which is unconstrained due to the grid child issue.
- Both fixes are necessary but insufficient — they work correctly once the ancestor containment chain is fixed.

## Fix (1 line)

In `client/src/components/inbox/CategoryAccordion.tsx`, the `CategoryAccordionContent` wrapper div inside the grid:

**Before:**

```tsx
<div style={{ minHeight: 0 }}>
```

**After:**

```tsx
<div style={{ minHeight: 0, overflow: 'hidden' }}>
```

Adding `overflow: hidden` to the grid child does two things:

1. Establishes a block formatting context that constrains width
2. Implicitly sets `min-width: 0` behavior for the grid track sizing

This completes the overflow containment chain so that `text-overflow: ellipsis` on the inner spans can actually trigger.

### Secondary hardening (optional but recommended)

Also add `minWidth: 0` explicitly for defence-in-depth:

```tsx
<div style={{ minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
```

## Testing

1. Load inbox with emails that have long body text / summaries
2. Verify text shows ellipsis (`...`) instead of being cut off at right edge
3. Verify the CSS grid expand/collapse animation still works smoothly
4. Test on mobile viewport widths (360px, 480px)
5. Verify split-view mode (email list + detail pane) also constrains correctly

## Files Changed

- `client/src/components/inbox/CategoryAccordion.tsx` — 1 line change

---

Authored-by: monk-of-modularity[bot]
