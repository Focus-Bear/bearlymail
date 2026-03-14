# Plan: #804 — If you archive an email in action tab, should return to action tab (not triage)

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/804

---

## Problem Analysis

When a user opens an email from the **Action tab** (`/inbox/action`), archives it, they are navigated back to `/inbox` (the default triage view) instead of returning to `/inbox/action`.

The same issue exists for direct email detail pages (`/email/:id`) opened from any inbox tab — the return navigation should respect the source tab.

---

## Root Cause

In `client/src/hooks/useEmailDetailArchiveOps.ts`, the `handleArchive` function (lines ~187–220) has a hardcoded `navigate('/inbox')` call in the non-callback path:

```typescript
// Current code (broken):
await triggerAnimation(ANIMATION_TYPE_ARCHIVE);
navigate('/inbox');  // ← hardcoded, loses fromMode
```

The `getInboxPath()` helper already exists in `useEmailDetailOperations.ts` and correctly returns `/inbox/action`, `/inbox/follow-up`, etc. based on `location.state.fromMode`. However, `handleArchive` doesn't have access to `getInboxPath` — it's defined in a separate hook.

Similarly, in the snooze path, `navigate('/inbox')` is hardcoded (line ~85) in `executeSnoozeOp` for the non-callback case when there is no `onSnoozeComplete`.

---

## Implementation Steps

### Step 1: Pass `getInboxPath` into `useEmailDetailArchiveOps`

**File:** `client/src/hooks/useEmailDetailArchiveOps.ts`

- Add `getInboxPath: () => string` to the hook's parameters interface (`EmailDetailOperationsOptions` or a new param).
- Replace `navigate('/inbox')` with `navigate(getInboxPath())` in `handleArchive`.
- Replace `navigate('/inbox')` with `navigate(getInboxPath())` in `handleSnooze` (the non-callback path in `executeSnoozeOp`).

### Step 2: Provide `getInboxPath` from `useEmailDetailOperations`

**File:** `client/src/hooks/useEmailDetailOperations.ts`

- `getInboxPath` is already defined here using `location.state.fromMode`.
- When calling `useEmailDetailArchiveOps`, pass `getInboxPath` as a parameter.

### Step 3: Verify `fromMode` is set correctly on email navigation

**File:** `client/src/hooks/useInboxEmailHandlers.ts`

- The `navigate('/email/:id', { state: { fromMode: mode } })` call already passes `fromMode`.
- Verify that `mode` is correctly set to `'action'` when navigating from the action tab.
- Check `useInboxState.ts` or wherever `mode` is derived for the action tab.

### Step 4: Handle the case where `location.state` is null (direct URL access)

**File:** `client/src/hooks/useEmailDetailOperations.ts` — `getInboxPath`

- Already handles this: `return fromMode ? /inbox/${fromMode} : '/inbox'`.
- No change needed; direct URL access will correctly fall back to `/inbox`.

---

## Files to Modify

| File | Change |
|------|--------|
| `client/src/hooks/useEmailDetailArchiveOps.ts` | Pass `getInboxPath` into hook; replace hardcoded `/inbox` navigations |
| `client/src/hooks/useEmailDetailOperations.ts` | Pass `getInboxPath` when calling `useEmailDetailArchiveOps` |

---

## Testing Approach

**Existing test coverage:**
`client/src/hooks/useEmailDetailOperations.test.ts` already tests `fromMode` navigation for snooze (lines 235–255) and archive (line 339). Verify:
- Test line 339: `it('navigates to /inbox/action after archive when fromMode is action', ...)` — this should already be passing. If it's not, the fix directly addresses it.

**New tests to add:**
- Test: `handleArchive` with no `onArchiveComplete` callback + `fromMode = 'action'` → navigates to `/inbox/action`.
- Test: `handleArchive` with no `onArchiveComplete` callback + `fromMode = undefined` → navigates to `/inbox`.

**Manual test:**
1. Navigate to `/inbox/action`.
2. Click an email to open detail view.
3. Click Archive.
4. Verify you're returned to `/inbox/action`, not `/inbox` (triage).
5. Repeat from `/inbox/follow-up` — should return to `/inbox/follow-up`.

---

## Notes

- This is a small, surgical fix. Risk is low.
- The snooze navigation bug (also navigating to `/inbox` instead of `getInboxPath()`) should be fixed at the same time — same root cause.
- Look for any other hardcoded `navigate('/inbox')` calls in email detail hooks that should use `getInboxPath()` instead.
