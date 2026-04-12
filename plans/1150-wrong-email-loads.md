# Plan: fix(#1150 + #1151): URL↔selectedEmailId navigation loop + accelerate spam

**Issues:** #1150 (wrong email loads), #1151 (accelerate endpoint spammed ~2483 times / 2.3 min)  
**Branch:** `openclaw/issue-1150/wrong-email-plan`  
**Author:** Monk of Modularity (AI agent)

---

## Summary

Two separate bugs that share the same root cause: `useInboxUrlSync` has a feedback loop between its "URL → state" effect and its "state → URL" effect. Clicking a different email in the list is a symptom of the same loop. The `/accelerate` spam (#1151) is a **consequence** — it fires on each open leg of the cycle.

---

## Root-Cause Analysis

### Bug A — URL ↔ selectedEmailId navigation loop (primary bug, #1150 / #1151)

**Trigger:** User navigates directly to `https://app.bearlymail.com/inbox/triage/<emailId>`, or clicks a second email while a first is already open.

**The loop — step by step:**

1. **Mount.** `useInboxUrlSync` Effect 1 (runs once, empty deps) fires:
   - `isInitialMount.current` is `true`; it sets it to `false`
   - `urlThreadId` is set → calls `openEmail(urlThreadId)`
   - `selectedEmailId` is now `urlThreadId`

2. **Effect 2** (`[mode, splitViewSelectedEmailId, navigate, basePath]`) fires because `splitViewSelectedEmailId` just changed:
   - It guards with `if (isInitialMount.current) return` — but `isInitialMount.current` is **already `false`** because Effect 1 set it before Effect 2 ran (React batches effects in order, same commit).
   - `newPath = /inbox/triage/<emailId>` which is also the current URL already — BUT `lastUrlRef.current` is `''` (never set yet). So `newPath !== ''` → it calls `navigate('/inbox/triage/<emailId>', { replace: true })`.

3. **React Router** processes the `navigate` call. Even though it's `{ replace: true }` and the path is unchanged, React Router still pushes a new location object. This causes `useParams` to re-evaluate, changing `urlThreadId` (new object reference / new render cycle).

4. **Effect 3** (`[urlMode, urlThreadId]`) fires because `urlThreadId` changed:
   - `isInitialMount.current` is now `false` → it proceeds
   - `urlThreadId` still equals `selectedEmailId` → **first condition is false** (no openEmail call)
   - BUT `!urlThreadId && splitViewSelectedEmailId` — here's the **critical edge**: during the React Router render cycle triggered by the navigate, there is a brief window where `urlThreadId` may be `undefined` (the URL is being replaced) while `splitViewSelectedEmailId` is still set → calls `closeEmail()`!

5. `closeEmail()` sets `selectedEmailId = null` → `splitViewSelectedEmailId` changes → Effect 2 fires again → navigates to `/inbox/triage/` (no email) → `urlThreadId` becomes `undefined` → Effect 3 fires → `!urlThreadId && splitViewSelectedEmailId` is `false` now (email was closed) → loop pauses.

6. But now the URL is `/inbox/triage/` with no email, and Effect 3's condition `urlThreadId && urlThreadId !== splitViewSelectedEmailId` is checked again on any subsequent re-render... and if `urlThreadId` gets restored (e.g. stale closure), it reopens → loop resumes.

**The core bug is in Effect 3:**

```ts
// useInboxUrlSync.ts line 73-85
useEffect(() => {
  if (isInitialMount.current) {
    return;
  }
  if (urlMode && isValidMode(urlMode) && urlMode !== mode) {
    onUrlModeChange(urlMode);
  }
  if (urlThreadId && urlThreadId !== splitViewSelectedEmailId) {
    openEmail(urlThreadId);
  } else if (!urlThreadId && splitViewSelectedEmailId) {
    closeEmail(); // ← THIS fires when navigate() in Effect 2 produces a transient undefined urlThreadId
  }
}, [urlMode, urlThreadId]);
```

`splitViewSelectedEmailId` is **not in the deps array** of Effect 3. It is read from closure — a stale closure. This means Effect 3 only re-runs when `urlMode` or `urlThreadId` changes. Each time Effect 2 calls `navigate(sameUrl, { replace: true })`, it generates a new router location object, which causes `urlThreadId` to change reference, re-running Effect 3 with a potentially stale `splitViewSelectedEmailId` that doesn't match the current state.

### Bug B — Wrong email shown when switching (#1150 secondary)

**Trigger:** User clicks email B while email A is open in the split panel.

**Flow:**

1. `handleEmailSelect` → `splitView.openEmail(emailB.id)` → `selectedEmailId = emailB.id`
2. `SplitViewPanel` receives `selectedEmailId = emailB.id` as prop → passes to `EmailDetail` as `emailId={selectedEmailId}`
3. `EmailDetail` receives `id = emailB.id` — correct.
4. `useEmailDetailInitialization` effect fires: `id !== previousEmailIdRef.current` → clears all state, sets `fetchedEmailIdRef.current = null`
5. BUT: `useEmailDetailOperations.fetchEmail` is `useCallback([id, ...])` and `id` just changed — it **recreates** `fetchEmail`. However, `useEmailDetailInitialization` receives `fetchEmail` as a prop. The effect that calls `onEmailFetch` guards with `fetchedEmailIdRef.current === id` — this is fine.

**However:** the URL sync loop (Bug A) means that between step 1 and the detail panel rendering, `closeEmail()` may fire, resetting `selectedEmailId = null`, which causes the panel to disappear. On the next loop iteration `openEmail(emailA.id)` may be called from the URL (which still has `emailA`), showing email A again instead of the user's intended email B.

**Result:** The user sees a stale/wrong email because the loop re-opens the URL's email rather than the clicked email.

### Bug C — `/accelerate` spam (#1151)

`/accelerate` is called inside `fetchEmail()` in both `useEmailDetailFetching.ts` (line 56) and `useEmailDetailOperations.ts` (line 407) — once per `fetchEmail` call, fire-and-forget.

Since the URL loop opens the email panel repeatedly (each loop iteration calls `openEmail` → `useEmailDetailFetching` runs `onEmailIdChanged` → `fetchEmail` → hits `/accelerate`), the endpoint gets called on every open leg of the cycle. At ~2483 calls in 2.3 min, the loop runs at approximately 18 iterations/second — consistent with rapid React re-render cycles caused by the navigate → urlThreadId change → closeEmail → navigate cycle.

`useEmailProcessingPolling` is **NOT** the cause of the accelerate spam. It only polls the inbox list (`refreshInPlace`) for emails with `isProcessingPriority || isProcessingSummary`. The accelerate spam is purely from the detail panel open/close loop.

---

## Files to Change

### Fix 1 — `useInboxUrlSync.ts` (primary fix, addresses all three bugs)

**Problem:** Effect 2 calls `navigate(sameUrl, { replace: true })` even when the URL is already correct, generating a new router location object that spuriously re-triggers Effect 3. Effect 3's `closeEmail()` branch fires based on stale `splitViewSelectedEmailId`.

**Fix A:** In Effect 2, seed `lastUrlRef.current` with the current URL on first run so the no-op navigate is skipped:

```ts
// After isInitialMount guard, before computing newPath:
if (lastUrlRef.current === "") {
  lastUrlRef.current = window.location.pathname;
}
```

This prevents the spurious navigate on the first post-mount render.

**Fix B:** In Effect 3, add `splitViewSelectedEmailId` to the deps array (or capture it via `useEffectEvent`) so it is never stale when the close branch evaluates:

```ts
useEffect(() => {
  if (isInitialMount.current) {
    return;
  }
  if (urlMode && isValidMode(urlMode) && urlMode !== mode) {
    onUrlModeChange(urlMode);
  }
  if (urlThreadId && urlThreadId !== splitViewSelectedEmailId) {
    openEmail(urlThreadId);
  } else if (!urlThreadId && splitViewSelectedEmailId) {
    closeEmail();
  }
}, [urlMode, urlThreadId, splitViewSelectedEmailId]); // ← add splitViewSelectedEmailId
```

> **Note:** Adding `splitViewSelectedEmailId` to deps may cause Effect 3 to fire when the email is opened/closed via `openEmail`/`closeEmail` directly. Guard against re-entry: only call `openEmail`/`closeEmail` when the URL and state are genuinely mismatched. The existing conditions already handle this (`urlThreadId !== splitViewSelectedEmailId` and `!urlThreadId && splitViewSelectedEmailId`), so adding the dep is safe — it will short-circuit correctly.

**Fix C:** Alternatively (cleaner), use `useEffectEvent` for the URL→state sync effect body so it always reads fresh values without needing them in deps:

```ts
const syncFromUrl = useEffectEvent(() => {
  if (urlMode && isValidMode(urlMode) && urlMode !== mode) {
    onUrlModeChange(urlMode);
  }
  if (urlThreadId && urlThreadId !== splitViewSelectedEmailId) {
    openEmail(urlThreadId);
  } else if (!urlThreadId && splitViewSelectedEmailId) {
    closeEmail();
  }
});

useEffect(() => {
  if (isInitialMount.current) {
    return;
  }
  syncFromUrl();
}, [urlMode, urlThreadId]);
```

This is the preferred approach — matches the pattern already used in `useEmailDetailFetching` and `useInboxInitialization`.

### Fix 2 — `useInboxUrlSync.ts` Effect 2: seed `lastUrlRef` from current URL (prevents spurious navigate)

```ts
useEffect(() => {
  if (isInitialMount.current) {
    return;
  }
  // Seed lastUrlRef on first post-mount render to avoid a no-op navigate
  // that would generate a new router location object and spuriously re-trigger Effect 3.
  if (lastUrlRef.current === "") {
    lastUrlRef.current = `${basePath}/${mode}${splitViewSelectedEmailId ? `/${splitViewSelectedEmailId}` : ""}`;
  }
  const newPath = splitViewSelectedEmailId
    ? `${basePath}/${mode}/${splitViewSelectedEmailId}`
    : `${basePath}/${mode}`;
  if (newPath !== lastUrlRef.current) {
    lastUrlRef.current = newPath;
    navigate(newPath, { replace: true });
  }
}, [mode, splitViewSelectedEmailId, navigate, basePath]);
```

### Fix 3 — `useEmailDetailFetching.ts`: deduplicate accelerate calls (defensive, #1151)

Even after the loop is fixed, add a ref guard in `triggerEmailSideEffects` (or the equivalent inline call) to prevent duplicate `/accelerate` calls for the same email ID within a short window:

```ts
// In useEmailDetailFetching.ts — add at hook level:
const lastAcceleratedRef = useRef<string | null>(null);

// Inside onEmailIdChanged / fetchEmail, guard the accelerate call:
if (lastAcceleratedRef.current !== emailId) {
  lastAcceleratedRef.current = emailId;
  axios
    .post(`${API_URL}/emails/${emailId}/accelerate`)
    .catch((err) =>
      console.debug("Job acceleration not available:", err.message),
    );
}
```

Same guard should be applied in `useEmailDetailOperations.ts` `fetchEmail` (line 407).

---

## What NOT to Change

- `useSplitView.ts` — `openEmail` is correct; it simply sets `selectedEmailId`. No loops there.
- `useEmailProcessingPolling` — not involved in the accelerate spam; the fix in #1142 is correct and complete.
- `onEmailMovedInTriage` / `openEmailRef` pattern from #1126 — not the cause. `isMobileRef.current` starts as `false` (desktop) so the desktop code path runs correctly. This was a red herring.
- `useSplitViewPanelState` — correctly resets `starCount` / `correspondentName` on `selectedEmailId` change. No issues.
- `EmailDetail` / `useEmailDetailInitialization` — the per-email fetch guard (`fetchedEmailIdRef`, `previousEmailIdRef`) works correctly. The stale email symptom is purely downstream of the URL loop sending the wrong `selectedEmailId`.

---

## Test Cases

1. **Direct URL load:** Navigate to `/inbox/triage/<emailId>`. Email should open and stay open. URL should not oscillate. DevTools network tab should show `/accelerate` called once, not repeatedly.

2. **Click email A → click email B:** Email B should display in the detail panel. URL should update to `/inbox/triage/<emailB.id>`. Email A content should not flash back.

3. **Close panel → browser back:** Should restore the previous email if navigating back to a URL that includes a thread ID.

4. **Mobile:** No split panel shown. `onEmailMovedInTriage` pulses the Action tab. No loop should occur.

5. **Accelerate rate:** With the loop fixed and the dedup guard added, `/accelerate` should fire at most once per unique `emailId` per panel open session.

---

## Affected Files

| File                                           | Change                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/hooks/useInboxUrlSync.ts`          | Seed `lastUrlRef` from current URL on first Effect 2 run; use `useEffectEvent` in Effect 3 to prevent stale closure on `splitViewSelectedEmailId` |
| `client/src/hooks/useEmailDetailFetching.ts`   | Add `lastAcceleratedRef` dedup guard before `/accelerate` POST                                                                                    |
| `client/src/hooks/useEmailDetailOperations.ts` | Same dedup guard before `/accelerate` POST in `fetchEmail`                                                                                        |

---

## Estimated Effort

Small — 3 files, ~20 lines total. The `useEffectEvent` refactor pattern is already used extensively in the codebase (see `useEmailDetailFetching`, `useInboxInitialization`). No new dependencies, no API changes, no Redux changes.
