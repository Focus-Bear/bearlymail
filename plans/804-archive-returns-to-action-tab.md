# Plan: #804 — If you archive an email in action tab, should return to action tab (not triage)

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/804
> **Previous implementation:** PR #816 was closed without merging — please review the notes below.

---

## Problem Analysis

When a user opens an email from the **Action tab** (`/inbox/action`), archives it, they are navigated back to `/inbox` (the default triage view) instead of returning to `/inbox/action`.

The same issue exists for direct email detail pages (`/email/:id`) opened from any inbox tab — the return navigation should respect the source tab.

---

## Root Cause

In `client/src/hooks/useEmailDetailArchiveOps.ts`, the `handleArchive` function has a hardcoded `navigate('/inbox')` call in the non-callback path. The `getInboxPath()` helper already exists in `useEmailDetailOperations.ts` and correctly returns `/inbox/action`, `/inbox/follow-up`, etc. based on `location.state.fromMode`. However, `handleArchive` doesn't have access to `getInboxPath` — it's defined in a separate hook.

Similarly, in the snooze path, `navigate('/inbox')` is hardcoded in `executeSnoozeOp` for the non-callback case.

---

## Implementation Steps

### Step 1: Pass `getInboxPath` into `useEmailDetailArchiveOps`

**File:** `client/src/hooks/useEmailDetailArchiveOps.ts`

- Add `getInboxPath: () => string` to the `ArchiveOpsParams` interface.
- Replace ALL hardcoded `navigate('/inbox')` calls with `navigate(getInboxPath())`:
  - In `handleArchive` (the non-callback path, after `triggerAnimation`)
  - In `executeSnoozeOp` (the non-callback path, `navigate(getInboxPath())`)
  - In `handleDelete`

### Step 2: Provide `getInboxPath` from `useEmailDetailOperations`

**File:** `client/src/hooks/useEmailDetailOperations.ts`

- `getInboxPath` is already defined here using `location.state.fromMode`.
- Pass `getInboxPath` when calling `useEmailDetailArchiveOps`.

### Step 3: Verify `fromMode` is set on email navigation

**File:** `client/src/hooks/useInboxEmailHandlers.ts`

- The `navigate('/email/:id', { state: { fromMode: mode } })` call already passes `fromMode`.
- Verify `mode` is `'action'` when navigating from the action tab. ✅ Already confirmed correct.

### Step 4: Handle `location.state` being null (direct URL)

**File:** `client/src/hooks/useEmailDetailOperations.ts` — `getInboxPath`

- Already handled: `return fromMode ? \`/inbox/${fromMode}\` : '/inbox'` — no change needed.

---

## Files to Modify

| File                                           | Change                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| `client/src/hooks/useEmailDetailArchiveOps.ts` | Add `getInboxPath` param; replace all hardcoded `/inbox` navigations |
| `client/src/hooks/useEmailDetailOperations.ts` | Pass `getInboxPath` when calling `useEmailDetailArchiveOps`          |

---

## Testing Approach

**Existing tests:**
`client/src/hooks/useEmailDetailOperations.test.ts` — check for tests covering `fromMode` navigation after archive/snooze. Add if missing:

- `handleArchive` with `fromMode = 'action'` → navigates to `/inbox/action`
- `handleArchive` with `fromMode = undefined` → navigates to `/inbox`
- `handleSnooze` with `fromMode = 'action'` → navigates to `/inbox/action`
- `handleDelete` with `fromMode = 'action'` → navigates to `/inbox/action`

**Manual test:**

1. Navigate to `/inbox/action`
2. Click an email (mobile) → opens full page at `/email/:id`
3. Click Archive
4. Verify return to `/inbox/action`, NOT `/inbox` (triage)
5. Repeat from `/inbox/follow-up` → verify return to `/inbox/follow-up`

---

## Notes for Codebeard

- Previous implementation PR #816 was closed. Check what went wrong before reimplementing.
- This is a small, surgical fix. Keep it minimal — just replace the hardcoded navigations.
- Fix snooze AND delete AND archive paths — all three likely have the same bug.
- Do NOT change any business logic; only the navigation target.
