# Plan: Issue #1168 — Clicking email shows wrong email in detail panel

**Branch:** `openclaw/issue-1168/wrong-email-persists-plan`
**Issue:** #1168
**Status:** Plan (ready for Codebeard)
**Depends on:** PR #1153 (merged)

---

## Bug Summary

Clicking email B while email A is displayed in the split-view detail panel → email A
continues to be shown. The wrong email persists in the panel even after the click.

---

## Investigation Findings

### 1. `useInboxUrlSync.ts` — Effect 3 race still possible

After #1153, Effect 3 is wrapped in `useEffectEvent` so it always reads the latest
`splitViewSelectedEmailId`. However the fix introduced a subtle **ordering problem**:

**Click sequence:**

1. User clicks email B → `handleEmailSelect` is called
2. `splitView.openEmail(emailB)` → `selectedEmailId` state becomes `emailB`
3. Effect 2 fires (mode/splitView dep changed): navigates to `/inbox/triage/emailB`,
   sets `lastUrlRef.current = /inbox/triage/emailB`
4. URL changes → React Router re-renders → `urlThreadId` changes to `emailB`
5. Effect 3 fires (urlThreadId changed): reads `splitViewSelectedEmailId` via
   `useEffectEvent` — **BUT** this effect reads the React Router param `urlThreadId`,
   which at this point is `emailB`, and `splitViewSelectedEmailId` is also `emailB`.
   So `urlThreadId !== splitViewSelectedEmailId` is **false** → `openEmail` is NOT called.
   ✅ This path is safe after #1153.

However: **the `isInitialMount.current` check in Effect 3** only applies to the effect
body, but `onUrlParamsChanged` itself also has an early-return guard on
`isInitialMount.current`. The initial mount guard is set to `false` inside Effect 1
(which runs with `[]` deps). **Effect 3 can fire before Effect 1 flips the flag to
`false`**, because both run on the same render cycle (mount). In that case Effect 3 is
a no-op (good). But on rapid email switches where React batches state updates, Effect 2
and Effect 3 can interleave unpredictably.

**Root risk:** Effect 2 and Effect 3 both react to the URL changing but do so
asynchronously through the React render cycle. The `navigate()` call in Effect 2 is
synchronous (React Router updates state), but React may batch the resulting re-renders,
meaning Effect 3 may see `urlThreadId` at a stale value for one tick before it sees the
updated value.

### 2. `EmailListItem.tsx` / click handler — correct

`handleCardClick` in `EmailListItem` correctly delegates to `onEmailSelect` for normal
single clicks. `useInboxEmailHandlers.handleEmailSelect` calls:

```ts
handleMarkAsRead(emailId);
splitView.openEmail(emailId);   // sets selectedEmailId
setSelectedEmailIndex(emailIndex);
```

This path is correct — `openEmail` receives the right `emailId`. **The click path itself
is not the bug.**

### 3. `useSplitView.ts` — `openEmail` only sets state, no URL navigation

```ts
const openEmail = useCallback((emailId: string) => {
  setSelectedEmailId(emailId);
  setPanelExpanded(false);
}, []);
```

`openEmail` **only updates React state**. It does NOT navigate. The URL update is
delegated to Effect 2 in `useInboxUrlSync`. This creates a two-step update:

```
openEmail(B) → selectedEmailId = B → Effect 2 → navigate(URL with B)
```

This async gap is the primary source of the remaining bug (see Root Cause below).

### 4. Effect 3 still capable of calling `closeEmail()` / `openEmail(oldId)` — YES

After #1153, Effect 3 uses `useEffectEvent` to read fresh state. But Effect 3's deps
are `[urlMode, urlThreadId]` — it fires when the URL changes. The bug scenario:

1. Email A is selected; URL is `/inbox/triage/emailA`
2. User clicks email B fast, then clicks email A again
3. `openEmail(B)` is called; state = B; URL not yet updated (Effect 2 hasn't run)
4. User re-clicks email A; `openEmail(A)` is called; state = A
5. Effect 2 fires once for the final state (A) → navigates to `/inbox/triage/emailA`
6. `urlThreadId` doesn't change (was already A from initial load), so Effect 3 does not fire
7. **Panel shows A** (which is what the user last clicked) — this is actually correct

But the broken scenario is:

1. Email A shown; URL = `/inbox/triage/emailA`
2. Click email B → `openEmail(B)` fires; state = B
3. Effect 2 runs → navigates to `/inbox/triage/emailB`
4. React re-renders: `urlThreadId = emailB` → Effect 3 fires
5. `useEffectEvent` reads `splitViewSelectedEmailId` — **but due to React's async
   rendering, this may read the stale closure value `emailA`** if the state update from
   step 2 hasn't been committed yet when Effect 3 runs
6. Effect 3 sees: `urlThreadId (B) !== splitViewSelectedEmailId (A, stale)` → calls
   `openEmail(B)` again — harmless in this case, but masks the real issue

**The real remaining bug is in `useEmailDetailInitialization`.** See #6 below.

### 5. `useEmailDetailFetching.ts` — `lastAcceleratedRef` dedup is NOT the main culprit

`useEmailDetailFetching` is no longer used by `EmailDetail` (confirmed: only
`useEmailDetail.ts` — deprecated — imports it). The live `EmailDetail` component uses
`useEmailDetailOperations.fetchEmail` (inside `useEmailDetailOperations.ts`).

In `useEmailDetailOperations.fetchEmail` (line ~377), there is **also** a
`lastAcceleratedRef` dedup guard:

```ts
if (id && id !== lastAcceleratedRef.current) {
  lastAcceleratedRef.current = id;
  axios.post(`${API_URL}/emails/${id}/accelerate`)...
}
```

This only guards the accelerate call, NOT the main `fetchEmail`. Fetching does happen
correctly when `id` changes. **Not the root cause.**

### 6. ⚠️ ROOT CAUSE: `EmailDetail` has no `key` prop — state is NOT reset on email change

**This is the primary bug.**

In `SplitViewPanel` (and its parent `InboxContent`), `EmailDetail` is rendered as:

```tsx
<EmailDetail
  ref={emailDetailComponentRef}
  emailId={selectedEmailId}
  compactMode
  ...
/>
```

**There is no `key={selectedEmailId}` prop on `EmailDetail`.**

React treats this as the same component instance when `selectedEmailId` changes. This
means **all the internal state** accumulated by `useEmailDetailState()` — `email`,
`threadEmails`, `expandedThreadItems`, `summary`, `draft`, `replyOptions`,
`loadingReplies`, `showReplyComposer`, `loading`, `animationClass`, etc. — is retained
from email A when switching to email B.

`useEmailDetailInitialization` has a mitigation:

```ts
useEffect(() => {
  if (id && id !== previousEmailIdRef.current) {
    setLoading(true);
    setEmail(null);
    setSummary(null);
    ...
    previousEmailIdRef.current = id;
  }
}, [id, ...]);
```

This clears `email` to `null`, which triggers the loading screen. But:

- **Race condition:** Between the render where `emailId` changes to B and the effect
  running, the component briefly shows email A's data (because state hasn't been cleared yet)
- **Reply composer state** (`draft`, `showReplyComposer`, `replyOptions`) is NOT cleared
  in the `id` change effect — it's only reset in `useEmailDetailDraftSync`
- **`initializedEmailIdRef`** and **`fetchedEmailIdRef`** are reset by the effect, but
  `useEffectEvent` callbacks capture stale closures during the brief gap
- **`summaryCollapsed`, `noteContent`, `notesCollapsed`** are not reset
- The loading state briefly shows email A's data before the effect fires

### 7. Secondary Cause: `useEmailDetailOperations.lastAcceleratedRef` shared across email switches

`lastAcceleratedRef` in `useEmailDetailOperations` persists across email switches
(since there's no `key` prop, the ref is never reset). When switching from A → B → A,
the second visit to email A will skip the `accelerate` call. This is intentional but
worth noting: if `fetchEmail` is somehow deduped in future refactors, this ref could
prevent re-fetching.

---

## Root Causes (Priority Order)

### P0 — Missing `key` prop on `EmailDetail` in `SplitViewPanel`

**File:** `client/src/components/inbox/SplitViewPanel.tsx` line 465

**Fix:**
```tsx
<EmailDetail
  key={selectedEmailId}   // ← ADD THIS
  ref={emailDetailComponentRef}
  emailId={selectedEmailId}
  compactMode
  ...
/>
```

This forces React to fully unmount/remount `EmailDetail` (and all its child hooks) when
the selected email changes. All state is reset automatically. The loading screen shows
correctly. No stale data from email A leaks into email B's render.

**Why this alone is sufficient:**
- `useEmailDetailInitialization` correctly fetches data for the new `id` on mount
- `useEmailDetailState` initialises with clean defaults
- All refs (`lastAcceleratedRef`, `initializedEmailIdRef`, `fetchedEmailIdRef`,
  `expandedItemsSetRef`) are reset to `null` as fresh instances
- The imperative ref (`emailDetailComponentRef`) in `useSplitViewPanelState` is already
  handled correctly — it is set via `forwardRef` and will receive the new instance

**Trade-off:** Unmounting/remounting `EmailDetail` is more expensive than a prop update
because all effects re-run. However:
- The current "clear state on id change" approach in `useEmailDetailInitialization` is
  essentially doing a manual reset on every switch anyway
- The `key` approach is simpler, more correct, and removes the risk of partially-cleared
  state between renders

### P1 — `useEmailDetailInitialization` incomplete state reset

Even with the `key` fix in place, the `id` change effect in `useEmailDetailInitialization`
should be audited for completeness:

- `noteContent` / `notesCollapsed` are not reset → stale notes may flash
- `draft`, `replyOptions`, `showReplyComposer` are not reset → reply composer may
  briefly show for wrong email

If Codebeard chooses NOT to add a `key` prop (e.g. to preserve animation/transition
state), then the incomplete reset in `useEmailDetailInitialization` must be fixed. The
`setNote*` and reply-state setters need to be plumbed in and called on `id` change.

### P2 — Effect 2 / Effect 3 ordering in `useInboxUrlSync`

The two-step URL update path (state → Effect 2 → navigate → Effect 3) is still
potentially fragile in edge cases (very fast clicking). The `useEffectEvent` fix in
#1153 greatly reduces the risk, but does not eliminate it entirely.

Recommended: add a comment to `useInboxUrlSync` documenting the intended ordering
contract so future contributors don't break it.

---

## Implementation Plan for Codebeard

### Fix 1 (required) — Add `key` prop to `EmailDetail` in `SplitViewPanel`

**File:** `client/src/components/inbox/SplitViewPanel.tsx`

```diff
       <EmailDetail
+        key={selectedEmailId}
         ref={emailDetailComponentRef}
         emailId={selectedEmailId}
         compactMode
```

**Testing:** Click between emails rapidly; verify:
- Detail panel immediately shows loading spinner for new email
- No flash of email A's content when email B is selected
- Reply composer is closed/reset when switching emails
- Notes section shows correct email's notes

### Fix 2 (recommended) — Reset reply/notes state in `useEmailDetailInitialization`

**File:** `client/src/hooks/useEmailDetailInitialization.ts`

Add the missing state resets to the `id` change `useEffect`:

```diff
-  setEmail(null);
+  setEmail(null);
+  setNoteContent?.('');
+  setNotesCollapsed?.(true);
```

Note: `setNoteContent` and `setNotesCollapsed` are not currently threaded into
`useEmailDetailInitialization`. They would need to be added to the interface and
the call site in `EmailDetail.tsx`. This is lower priority if Fix 1 is applied.

### Fix 3 (recommended) — Add comment to `useInboxUrlSync` for ordering contract

**File:** `client/src/hooks/useInboxUrlSync.ts`

Add a comment before Effect 2 and Effect 3 documenting that:
- Effect 2 owns URL→state direction (state changes → navigate)
- Effect 3 owns state→URL direction (URL params → openEmail/closeEmail)
- They are intentionally separate to avoid circular updates
- The `useEffectEvent` wrapper on Effect 3's callback is load-bearing (do not remove)

---

## Files to Change

| File | Change | Priority |
|------|--------|----------|
| `client/src/components/inbox/SplitViewPanel.tsx` | Add `key={selectedEmailId}` to `<EmailDetail>` | P0 — Required |
| `client/src/hooks/useEmailDetailInitialization.ts` | Reset note/reply state on email ID change | P1 — Recommended |
| `client/src/hooks/useInboxUrlSync.ts` | Add ordering-contract comment | P2 — Nice-to-have |

---

## Test Cases

1. **Basic switch:** Open email A, click email B → B is shown immediately (loading spinner, then B's content)
2. **Rapid switch:** Click A, B, C in quick succession → final email C is shown
3. **Reply composer state:** Open reply composer on A, switch to B → reply composer is NOT open on B
4. **Notes state:** Add note on A, switch to B → B's notes are shown (not A's)
5. **Back navigation:** Use browser back after switching → previous email is restored
6. **Initial load from URL:** Navigate directly to `/inbox/triage/emailId` → correct email shown

---

## Acceptance Criteria

- [ ] Clicking email B while email A is shown → email B is displayed in the detail panel
- [ ] No stale email A content visible during email B loading
- [ ] Reply composer is reset when switching emails
- [ ] `useEmailDetailInitialization`'s `id` change effect is not fighting against stale state
- [ ] All existing tests pass
- [ ] Manual smoke test of all 6 test cases above passes

---

*Plan authored by Monk of Modularity — subagent for issue #1168*
