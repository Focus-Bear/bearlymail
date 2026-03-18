# Plan: #1198 — Back icon forgets where you came from

**Branch:** `plan/1198-back-nav-forgets-inbox-mode`
**Author:** monk-of-modularity[bot] (AI planning agent)

## Problem

When a user opens the Action inbox (`/inbox/action`), taps on an email thread (navigating to `/email/<id>` with `location.state = { fromMode: 'action' }`), and then taps the back button, they are returned to `/inbox` (the default triage) instead of `/inbox/action`.

## Root Cause

`client/src/components/email-detail/EmailDetailSidebar.tsx` has **two** hardcoded calls:

```tsx
onClick={() => navigate('/inbox')}
```

Both the mobile floating button and the desktop sidebar button ignore `location.state.fromMode` entirely. The `fromMode` is correctly set during navigation (in `useInboxEmailHandlers` line 95: `navigate('/email/${emailId}', { state: { fromMode: mode } })`), and `useEmailDetailOperations` already has a correct `getInboxPath()` helper that reads it — but `EmailDetailSidebar` reinvents navigation without using it.

## Fix

`EmailDetailSidebar` needs to read `location.state.fromMode` (via `useLocation`) and construct the correct back path.

**Two approaches:**

### Option A — Self-contained fix in EmailDetailSidebar (recommended)

```tsx
import { useLocation, useNavigate } from 'react-router-dom';

// Inside the component:
const location = useLocation();
const fromMode = (location.state as { fromMode?: string } | null)?.fromMode;
const backPath = fromMode ? `/inbox/${fromMode}` : '/inbox';

// Both buttons:
onClick={() => navigate(backPath)}
```

### Option B — Prop drilling from EmailDetail

Pass a `onBack` callback from `EmailDetail` → `EmailDetailFullLayout` → `EmailDetailSidebar`. More verbose, less clean.

**Recommendation: Option A.** It's a 3-line change, fully self-contained.

## Files to Change

| File | Change |
|---|---|
| `client/src/components/email-detail/EmailDetailSidebar.tsx` | Add `useLocation`, derive `backPath` from `fromMode`, replace both `navigate('/inbox')` calls with `navigate(backPath)` |

## Edge Cases

- If user lands directly on `/email/<id>` (e.g. from a link/notification), `fromMode` is undefined → falls back to `/inbox` which is correct behaviour.
- No change needed for `FocusedInbox` since the full-page `/email/:id` route is only used from the regular inbox on mobile. FocusedInbox has its own split-view on desktop (no `/email/:id` route used).
- The `getInboxPath()` in `useEmailDetailOperations` is a separate codepath used by action buttons (archive, snooze, send). Those are already correct. Only the sidebar back button was broken.

## Testing

1. Open Action inbox (`/inbox/action`)
2. On mobile: tap an email → navigates to `/email/<id>`
3. Tap back button → should return to `/inbox/action` ✅
4. Repeat for Triage, Follow-up, etc.
5. Direct navigation to `/email/<id>` (no fromMode) → back goes to `/inbox` ✅

## Codebeard Notes

This is a 3-line fix. Codebeard can implement directly without further planning.

```diff
// client/src/components/email-detail/EmailDetailSidebar.tsx

-import { useNavigate } from 'react-router-dom';
+import { useLocation, useNavigate } from 'react-router-dom';

 export const EmailDetailSidebar: React.FC = () => {
   const navigate = useNavigate();
+  const location = useLocation();
   const { t } = useTranslation();
   const { isMobile } = useResponsiveBreakpoints();
+  const fromMode = (location.state as { fromMode?: string } | null)?.fromMode;
+  const backPath = fromMode ? `/inbox/${fromMode}` : '/inbox';

   // ... (replace both navigate('/inbox') with navigate(backPath))
```
