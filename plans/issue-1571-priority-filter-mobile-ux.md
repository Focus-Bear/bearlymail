# Plan: Fix #1571 — Priority Filter Mobile UX & Remaining Issues

**Author:** Monk of Modularity 🧘  
**Issue:** [#1571](https://github.com/Focus-Bear/BearlyMail/issues/1571)  
**Date:** 2026-04-07  
**Depends on:** PR #1660 (count mismatch fix — merged)

---

## Context

PR #1660 fixed the priority count SQL mismatch. A prior plan (`plans/fix-1571-priority-filter-issues.md`) addressed the cache-key scoping (Bug 1 Fix A), server-side `0`-parsing (Bug 1 Fix B), equal-height cards (Bug 3), and slider visual polish (Bug 2). Those fixes are all merged into `main`.

This plan addresses the **remaining issues** from #1571 that are still broken:

1. **Mobile UX is unusable** — dragging two tiny slider thumbs on a phone is clunky; Jeremy wants tap-to-set-minimum behaviour
2. **Emails may still not show initially** — potential race between stale localStorage cache and fresh fetch on first navigation
3. **Filter visual polish** — minor remaining improvements to make the filter section less "trash"

---

## Issue 1: Mobile Priority Filter UX (P1)

### Problem

The `PriorityRangeSelector` uses a dual-thumb range slider. On mobile:
- The 24px thumb handles are small touch targets on narrow screens
- Dragging two thumbs to set a range is fiddly — especially one-handed
- If the filter is set to "Medium to Very High" and you tap "High", nothing happens — the labels aren't interactive
- Jeremy's expected behaviour: **tapping a priority level should set it as the new minimum**, keeping the current maximum

### Current Behaviour

`BucketLabels` is a purely visual component with no click/tap handlers. The only interaction model is dragging the slider thumbs. The track segments also have no click handler.

### Proposed Fix

Add **tap-to-set-minimum** behaviour to both the bucket labels and the track segments:

1. **Make bucket labels tappable**: Add an `onClick` handler to each bucket label in `BucketLabels`. When tapped:
   - Set `minPriority` to that bucket's lower bound (score value)
   - Keep `maxPriority` unchanged (current max stays)
   - If the tapped bucket is at or above the current max, set max to `null` (no cap) so at least one bucket is selected
   - Visual feedback: `cursor: pointer` on labels, subtle hover/active state

2. **Make track segments tappable**: Add an `onClick` handler to each segment in `SegmentTrack`. Same logic as label tap — tapping the "High" segment sets min to High's lower bound.

3. **Add touch-friendly size increase on mobile**: When `compact` (or detected as mobile via a media query), increase the track height from 8px to 12px and thumb handles from 24px to 32px for easier grabbing.

### Files to Modify

| File | Change |
|------|--------|
| `client/src/components/inbox/PriorityRangeSelector.tsx` | Add `onBucketTap` prop, wire `onClick` to `BucketLabels` and `SegmentTrack`, increase mobile touch targets |

### Implementation Details

**`PriorityRangeSelector.tsx`:**

```tsx
// In BucketLabels, add onClick to each bucket div:
<div
  key={bucket.label}
  onClick={() => onBucketTap?.(bucket.min)}
  style={{
    ...existingStyles,
    cursor: onBucketTap ? 'pointer' : 'default',
  }}
>
```

**Tap logic in the main component (new `handleBucketTap` callback):**

```tsx
const handleBucketTap = useCallback((visualPosition: number) => {
  // The tapped bucket's visual min position
  const newMinVisual = visualPosition;
  
  // Keep the current max, but ensure at least one bucket is selected
  let effectiveMaxVisual = maxVal;
  if (newMinVisual >= effectiveMaxVisual) {
    effectiveMaxVisual = VISUAL_SLIDER_MAX; // Expand to include everything above
  }
  
  const outMin = visualMinToScore(newMinVisual);
  const outMax = visualMaxToScore(effectiveMaxVisual);
  onChange(outMin, outMax);
}, [maxVal, onChange]);
```

**For `SegmentTrack`, add `onClick` per segment:**

```tsx
<div
  key={bucket.label}
  onClick={() => onSegmentClick?.(bucket.min)}
  style={{
    ...existingStyles,
    cursor: onSegmentClick ? 'pointer' : 'default',
  }}
/>
```

**Mobile size increase:**

Accept an optional `compact` prop (or use a CSS media query via inline style with `window.matchMedia` or the existing `useResponsiveBreakpoints` hook). When mobile:
- Track height: 12px (from 8px)
- Thumb size: 32px (from 24px)
- Bucket label touch target: add `padding: '8px 4px'` to increase tap area

### Interaction Examples

| Current State | User Taps | New State | Why |
|---|---|---|---|
| Medium → Very High | "High" label | High → Very High | Min moves up to High; max stays |
| High → Very High | "Medium" label | Medium → Very High | Min moves down to Medium; max stays |
| Very High only | "Low" label | Low → Very High | Min moves down to Low; max stays (null) |
| Medium → High | "Very High" label | Very High (only) | Min=VH, max expands to null since min ≥ old max |
| All | "High" label | High → Very High | Min set to High; max stays at null |

---

## Issue 2: Emails Not Loading on First View (P2)

### Problem

The original report says 114 emails exist but don't show until page reload. The cache-key fix (already merged) addressed the most common cause — stale localStorage data from a different filter config being served. However, there may be an additional edge case.

### Analysis

After the cache-key fix, the remaining scenario where emails might not appear:

1. User visits inbox for the first time (no localStorage data)
2. `useInboxInitialization` takes the "no cache" path → calls `fetchEmails(signal)`
3. `fetchEmailsImpl` calls `fetchInboxSummary` → dispatches `setCategorySummary` to Redux
4. `useInboxCategorySync` effect fires → calls `updateStableCategoryOrder` → sets first 3 categories as expanded
5. `useCategoryFetch` effect fires for the 3 expanded categories → calls `fetchCategoryEmails` for each
6. Category emails arrive and are dispatched to Redux

This flow should work. But there's a subtle issue: `useInboxCategorySync` runs as an effect (after render), and `useCategoryFetch` also runs as an effect (after render). So there's a **two-render-cycle delay** between the summary arriving in Redux and the category fetch being triggered:

- Render 1: summary arrives → `useInboxCategorySync` effect queued
- Render 2: `useInboxCategorySync` fires → `updateStableCategoryOrder` called → `expandedCategories` updated → `useCategoryFetch` effect queued
- Render 3: `useCategoryFetch` effect fires → `fetchCategoryEmails` called

During renders 1-2, the user sees category accordion headers but no emails inside them. If the network is slow, this gap is noticeable. If `setHasInitiallyLoaded(true)` fires before render 3, the loading spinner disappears but accordions appear empty.

### Proposed Fix

This is not a true "bug" but a UX timing issue. The fix is to ensure the loading state covers the entire initialization sequence:

**Option A (recommended): Show skeleton/spinner inside category accordions until their emails load.**

The `CategoryAccordion` component should detect when it's expanded but has no loaded emails (and isn't in error state) and show a loading skeleton inside. This is likely already the case via `loadingCategoryNames` — verify and fix if not.

**Option B: Defer `setHasInitiallyLoaded(true)` until at least the first 3 categories have loaded.**

This would keep the full-page spinner longer but ensure no empty accordions flash. Downside: slower perceived load time.

### Files to Investigate/Modify

| File | Change |
|------|--------|
| `client/src/components/inbox/CategoryAccordion.tsx` | Verify loading skeleton is shown for expanded-but-not-loaded categories |
| `client/src/hooks/useCategoryFetch.ts` | No change needed — already dispatches `categoryFetchStart` to categorySlice |

### Verification Steps

1. Clear all `bearlymail_v3_*` keys from localStorage
2. Navigate to inbox
3. Verify: category accordion headers appear with loading skeletons inside
4. Verify: emails populate within each accordion as their fetches complete
5. No "0 emails" flash or empty state should appear

---

## Issue 3: Filter Visual Polish (P3)

### Problem

Jeremy said "the filter looks trash." The prior plan fixed the equal-height cards and slider dimensions. Remaining visual issues:

1. **Header text alignment**: The "Priority Filter" header uses `fontSize.lg` for the title but the range text ("Medium → Very High") is also `fontSize.lg` in `tertiary` colour — it's visually competing with the title
2. **Bucket labels cramped**: On narrower screens, 5 bucket labels ("Very Low", "Low", "Medium", "High", "Very High") get squeezed
3. **No "Reset" action**: Unlike the category filter which has an "All" pill, the priority filter has no quick way to reset to "All priorities" without dragging both thumbs
4. **Inconsistent card padding**: Both cards use `theme.spacing.md` padding, but the category filter has more visual weight due to the chunky pills vs the thin slider track

### Proposed Fixes

1. **Add a "Reset" link** in the priority filter header: a small clickable text "Reset" or "All" that sets min=null, max=null. This also helps mobile users who can't easily drag both thumbs to the extremes.

2. **Abbreviate bucket labels on mobile**: On compact/mobile, use abbreviated labels: "VL", "L", "M", "H", "VH" instead of full names. The dots + abbreviated labels fit much better.

3. **Tone down the range text**: Reduce range text from `fontSize.lg` to `fontSize.md` to create visual hierarchy with the title.

4. **Add subtle selected-range background**: The existing overlay between thumbs (opacity 0.25) is good. No change needed.

### Files to Modify

| File | Change |
|------|--------|
| `client/src/components/inbox/PriorityRangeSelector.tsx` | Add reset button, mobile label abbreviations, adjust header text size |

### Implementation Details

**Reset button (in header div, next to range text):**

```tsx
{!isAllSelected && (
  <button
    type="button"
    onClick={() => onChange(null, null)}
    style={{
      background: 'none',
      border: 'none',
      color: theme.colors.primary.main,
      cursor: 'pointer',
      fontSize: theme.typography.fontSize.sm,
      textDecoration: 'underline',
      marginLeft: theme.spacing.xs,
    }}
  >
    {t('inbox.filters.resetPriority', 'Reset')}
  </button>
)}
```

**Abbreviated labels on mobile (in BucketLabels):**

```tsx
const SHORT_LABELS: Record<string, string> = {
  'Very Low': 'VL',
  'Low': 'L',
  'Medium': 'M',
  'High': 'H',
  'Very High': 'VH',
};

// In BucketLabels:
const displayLabel = compact ? (SHORT_LABELS[bucket.label] ?? bucket.label) : bucket.label;
```

---

## Implementation Order

1. **Issue 1** — Mobile UX tap-to-set-minimum (highest impact, addresses Jeremy's specific request)
2. **Issue 3** — Visual polish (reset button, label abbreviations)
3. **Issue 2** — Verify loading skeleton in category accordions (may already work, just needs verification)

## Files Changed Summary

| File | Changes |
|------|---------|
| `client/src/components/inbox/PriorityRangeSelector.tsx` | Tap-to-set-minimum on labels/segments, mobile touch targets, reset button, abbreviated labels, header text sizing |
| `client/src/components/inbox/CategoryAccordion.tsx` | Verify/fix loading skeleton for expanded-but-unloaded categories |

## Risk Assessment

- **Issue 1** (tap-to-set-minimum): Low risk — additive behaviour, doesn't change existing drag interaction. The visual slider positions and score conversion logic are unchanged.
- **Issue 2** (loading skeleton): Very low risk — UI-only change inside accordion body.
- **Issue 3** (visual polish): Very low risk — cosmetic changes only. Reset button behaviour (`onChange(null, null)`) already works with the existing score conversion.

## Testing Notes

- **Mobile testing required**: The tap-to-set-minimum behaviour should be tested on actual mobile devices (or responsive mode in dev tools) to verify touch targets are adequate.
- **Verify slider still works**: After adding `onClick` to segments/labels, ensure the drag-based interaction still works correctly (click events shouldn't interfere with mousedown→mousemove→mouseup).
- **Edge case**: Tapping the same bucket that's already the minimum should be a no-op (or could toggle to "All" — decide during implementation).

---

*Planned by Monk of Modularity 🧘 — "Let the tap be the intention, and the slider shall follow."*
