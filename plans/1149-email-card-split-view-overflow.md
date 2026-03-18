# Plan: #1149 — Email cards cut off on right side in split-view

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/1149
> **Branch:** `plan/issue-1149-email-card-overflow`

---

## Problem Analysis

In split-view mode, email cards in the left panel overflow/get cut off on the right side:
- Timestamp top-right is truncated (e.g. `'17 Mar, 01:-'`)
- Summary text overflows horizontally

---

## Status After PR #1135 (Merged 2026-03-17)

PR #1135 (`fix(#957): fix email card overflow and three-dot menu positioning`) made the following relevant changes:
1. Added `minWidth: 0` to `EmailCard.tsx` ← directly relevant
2. Changed `EmailCardBody.tsx` `maxWidth` from `600px` to `100%` ← directly relevant

**This PR may partially or fully resolve this issue.** Codebeard should **verify** the split-view layout before implementing additional fixes.

---

## Root Cause

In CSS flexbox, a flex item's minimum size defaults to `auto` (its content size), not `0`. This means a flex item can grow wider than its container. Without `minWidth: 0`:

- `EmailCard` → could expand to its content width, ignoring the flex container's width
- The card's `overflow: hidden` then clips content at the card's natural boundary, not at the container boundary
- Result: the right edge of the card is cut off by the **parent** container's boundary

**The split-view left panel** is a narrow flex container (`0 0 ${splitPosition}%` of the viewport). The email card stack inside it needs proper `minWidth: 0` at every level to prevent horizontal overflow.

---

## Remaining Gaps After PR #1135

PR #1135 adds `minWidth: 0` to `EmailCard` but the intermediate containers in the rendering tree may still lack proper width constraints. The full render tree for a split-view email card:

```
InboxEmailListPanel (flex item, minWidth: 0 ✓, overflowY: auto)
  └── InboxEmailListPanel > div (maxWidth: 100%, flex: column)
        └── CategoryAccordion (no overflow:hidden, no minWidth:0 ❌)
              └── animation div (display: grid, overflow: hidden ✓)
                    └── CategoryAccordionContent (flex column, NO minWidth:0 ❌)
                          └── EmailListItem wrapper div (flex column, NO minWidth:0 ❌)
                                └── EmailCard (minWidth: 0 ✓ from PR #1135)
```

The gaps marked ❌ could cause horizontal overflow in edge cases.

---

## Investigation Checklist

Before writing code, **test in a narrow split-view** (drag the divider to ~30% left panel width):

1. [ ] Is the timestamp still cut off after PR #1135 is deployed?
2. [ ] Is the summary still overflowing?
3. [ ] Does the overflow occur at the `EmailCard` level or at a higher container?

---

## Implementation Plan (if issue persists after PR #1135)

### Fix 1: Add `minWidth: 0` to `EmailListItem` wrapper div

**File:** `client/src/components/inbox/EmailListItem.tsx`

```tsx
// Before:
style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, position: 'relative' }}

// After:
style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, position: 'relative', minWidth: 0 }}
```

### Fix 2: Add `minWidth: 0` to `CategoryAccordionContent`

**File:** `client/src/components/inbox/CategoryAccordion.tsx`

In the `CategoryAccordionContent` component outer `div`:
```tsx
// Before:
<div style={{ padding: theme.spacing.md, display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>

// After:
<div style={{ padding: theme.spacing.md, display: 'flex', flexDirection: 'column', gap: theme.spacing.md, minWidth: 0 }}>
```

### Fix 3: Verify `EmailHeaderRight` timestamp doesn't need explicit `maxWidth`

**File:** `client/src/components/inbox/header/EmailHeaderRight.tsx`

The timestamp span uses `flexShrink: 0` and `position: relative`. In a very narrow panel, this is correct — the timestamp should NOT shrink. But ensure:
- The `EmailHeaderLeft` has `flex: 1, minWidth: 0` (already has this ✓)
- The outer `EmailCardHeader` div uses `display: flex, justifyContent: space-between` (already has this ✓)

No change needed here if Fixes 1 and 2 ensure the card has proper width constraints.

### Fix 4: Add `overflow: hidden` to `EmailSubject`

**File:** `client/src/components/inbox/EmailSubject.tsx`

`EmailSubject` has `overflow: hidden` and `whiteSpace: nowrap` already ✓. But it lacks `minWidth: 0`. In a flex context this matters:

```tsx
// Add minWidth: 0 to the EmailSubject div style:
style={{
  ...existingStyles,
  minWidth: 0,  // add this
}}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `client/src/components/inbox/EmailListItem.tsx` | Add `minWidth: 0` to wrapper div style |
| `client/src/components/inbox/CategoryAccordion.tsx` | Add `minWidth: 0` to `CategoryAccordionContent` outer div |
| `client/src/components/inbox/EmailSubject.tsx` | Add `minWidth: 0` to the div style |

---

## Testing Approach

1. **Manual test:** Open inbox with split-view. Drag the divider so the left panel is ~25–30% wide. Confirm:
   - Timestamps are fully visible (not cut off)
   - Summary text is truncated with ellipsis, not raw overflow
   - Subject line is truncated with ellipsis

2. **All screen widths:** Test at 1200px, 1440px, and 1920px viewport widths.

3. **No regression:** Confirm email cards in non-split-view (full-width) look the same.

---

## Notes

- PR #1135 (merged 2026-03-17) likely fixes the primary case. Codebeard should verify before applying additional fixes.
- The `minWidth: 0` pattern needs to be present at EVERY flex-item level in the chain for it to work reliably. Missing it at one level can cause the issue to resurface.
- The `EmailPreview` component (`EmailPreview.tsx`) already has `maxWidth: 100%` and `overflow: hidden` — the fix in PR #1135 to EmailCardBody was similar.
- If the issue is confirmed fixed by #1135, this plan PR serves as documentation and the fix scope is ✅ complete. Close issue #1149 after user verification.
