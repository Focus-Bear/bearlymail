# Plan: Fix Email Card Overflow (v2) — Issue #1170

## Root Cause

PR #1135 fixed the **wrong component**. `EmailListItem` renders with these components:

```
EmailListItem
  └── EmailCard (.animate-fade-in)         ← card container, overflow: hidden
        ├── EmailCardHeader
        ├── EmailSubject                   ← no overflow control, text wraps freely
        ├── EmailPreview                   ← ⚠️ maxWidth: '600px'  ← THE BUG
        ├── MetadataIndicators
        └── EmailActionsRow
```

`EmailCardBody.tsx` (what #1135 fixed) is **not used by EmailListItem** — it's a dead/orphaned component. The active component is `EmailPreview.tsx`.

### How 651px Gets Computed

- Container: `InboxEmailListPanel` padding is `theme.spacing.lg` (24px) on each side
- EmailCard receives `overflow: hidden` + `minWidth: 0` (added in #1135 — correct but not enough)
- `EmailPreview`'s inner `<div>` has `maxWidth: '600px'` hardcoded
- In split-view, the list panel is narrowed to ~600px total width (24+24 padding = 48px overhead)
- The `animate-fade-in` element (EmailCard div) is computed by the browser at **651px** = 600px max-width + 24px left pad + 24px right pad + ~3px borders — this exceeds the container
- Parent has `overflow: hidden`, so the card content clips at the right edge

### Secondary Issue (also needs fixing)

`EmailSubject.tsx` — the subject line `<div>` has **no** `overflow: hidden` / `textOverflow: 'ellipsis'` / `whiteSpace: 'nowrap'` controls. Long subjects will wrap instead of truncate. This isn't the overflow-clipping bug, but it's inconsistent with the preview text treatment.

## Files to Change

### 1. `client/src/components/inbox/EmailPreview.tsx` — PRIMARY FIX

**Line ~28:** Change `maxWidth: '600px'` → `maxWidth: '100%'`

```diff
-          maxWidth: '600px',
+          maxWidth: '100%',
```

This is the direct cause of the 651px width. The preview div will now shrink to fit its container instead of forcing a fixed 600px minimum effective width.

### 2. `client/src/components/inbox/EmailSubject.tsx` — SECONDARY FIX

Add text truncation to prevent long subjects from creating horizontal overflow:

```diff
   <div
     style={{
       color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
       fontSize: theme.typography.fontSize.lg,
       fontWeight: email.isRead ? theme.typography.fontWeight.normal : theme.typography.fontWeight.bold,
       marginBottom: theme.spacing.sm,
+      overflow: 'hidden',
+      textOverflow: 'ellipsis',
+      whiteSpace: 'nowrap',
     }}
   >
```

### 3. `client/src/components/inbox/email-card/EmailCardBody.tsx` — CLEANUP

This component is **orphaned** (not imported by `EmailListItem`). Verify it is not used anywhere, then either:

- Add a comment noting it's unused
- Or delete it (preferred, to avoid future confusion)

Check: `grep -r "EmailCardBody" client/src/ --include="*.tsx"`

## What NOT to Change

- `EmailCard.tsx` — `overflow: hidden` + `minWidth: 0` is correct, these prevent the card itself from expanding
- `InboxContentParts.tsx` — list panel padding/flex is correct
- `SplitViewPanel.tsx` — panel sizing is correct
- `App.css` `.animate-fade-in` — CSS class is fine, the 651px is a layout side-effect not a CSS animation bug

## Test Plan

1. Open inbox in split-view (select an email so split panel appears)
2. Confirm email cards in the left panel no longer clip subject/sender at the right edge
3. Resize the split divider to a narrow panel width — cards should still fit
4. Check full-width inbox (no split) — preview and subject still render correctly
5. Check mobile view — cards should still look correct

## Why #1135 Didn't Fix It

`EmailCardBody` is imported by `email-card/EmailCardBody.tsx` but **`EmailListItem` imports from `EmailPreview.tsx` and `EmailSubject.tsx`** — the top-level inbox path. `EmailCardBody` appears to be a component that was replaced during a refactor but never deleted.
