# Plan: #1170 — Email cards have hardcoded width 651px

**Branch:** `plan/1170-email-card-hardcoded-width`
**Author:** monk-of-modularity[bot] (AI planning agent)

## Problem

Email cards clip or overflow because `.animate-fade-in` has a hardcoded `width: 651px` but the parent container is ~600px with `overflow: hidden`.

## Investigation

After searching all CSS, SCSS, TSX, and TS files for `651`, the literal value is **not present** in the source code. The hardcoded width is not in `App.css` or inline styles.

The `.animate-fade-in` class in `App.css` (line 80) only applies the animation:

```css
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}
```

However, this class is applied to:
- `client/src/components/inbox/EmailCard.tsx` (line 43) — the email list card
- `client/src/components/email-detail-inline/ReplyComposer.tsx` (line 458) — the reply composer wrapper

The `651px` width may be coming from a computed/inferred value, a browser default, or possibly from a parent container that constrains width differently depending on the split-view state.

**Further investigation needed:** The issue reporter saw `width: 651px` in devtools — this is likely a computed pixel value from a percentage or flex container, not a hardcoded value. The **actual fix** is to ensure `EmailCard` and its wrappers use `width: 100%` with `min-width: 0` (critical for flex children to shrink properly).

### Current EmailCard styles (EmailCard.tsx ~line 43-60):

```tsx
<div
  onClick={onCardClick}
  className="animate-fade-in"
  style={{
    // ... no explicit width set
    position: 'relative',
    overflow: 'hidden',
    minWidth: 0,
  }}
```

The `minWidth: 0` is already set on the card itself. The issue may be in the list item wrapper (`EmailListItem.tsx`):

```tsx
<div
  data-email-index={index}
  data-email-id={email.id}
  className={animationClass}
  style={{ display: 'flex', flexDirection: 'column', gap: ..., position: 'relative', minWidth: 0 }}
>
```

The `animationClass` on `EmailListItem` could be `animate-fade-in` when priority animations are applied. If the animation adds a fixed width somehow (e.g., via the `forwards` fill mode preserving an initial keyframe state), this could be the source.

## Proposed Fix

1. Check `@keyframes fadeIn` in `App.css` for any `width` property being animated (none found currently, but verify after a full search)
2. Add explicit `width: 100%` to `.animate-fade-in` in `App.css` as a defensive measure:

```css
.animate-fade-in {
  width: 100%;
  animation: fadeIn 0.3s ease-out forwards;
}
```

3. Ensure parent containers of email lists use `min-width: 0` and don't have fixed pixel widths.

## Files to Change

| File | Change |
|---|---|
| `client/src/App.css` | Add `width: 100%` to `.animate-fade-in` |

## Codebeard Notes

**This is a 1-line fix.** Codebeard can implement directly:

```diff
 .animate-fade-in {
+  width: 100%;
   animation: fadeIn 0.3s ease-out forwards;
 }
```

If this doesn't fully resolve the issue after testing, the fallback is to check the parent flex containers in `InboxContentParts.tsx` for any fixed widths.
