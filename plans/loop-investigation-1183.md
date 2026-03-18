# Plan: Fix Remaining navigate() Loop / PostHog Spam (Issue #1183)

## Status: Plan — Ready for Codebeard

## Context

PR #1177 fixed Effect 3 in `useInboxUrlSync` (the P0 stale-closure caused by `useEffectEvent`
returning `undefined` in React 19.2). However, the loop **persists** after deploy at build
`2026-03-18T03:30:20 UTC`. Network tab shows ~1110 requests in 54 s, PostHog `e/` and `s/`
still being spammed, and Chrome logs `Throttling navigation`.

## Root Cause

### The unstable `navigate` dep in Effect 2

`useInboxUrlSync` Effect 2:

```ts
useEffect(() => {
  if (isInitialMount.current) return;
  const newPath = splitViewSelectedEmailId
    ? `${basePath}/${mode}/${splitViewSelectedEmailId}`
    : `${basePath}/${mode}`;
  if (newPath !== lastUrlRef.current) {
    lastUrlRef.current = newPath;
    navigate(newPath, { replace: true });          // <-- calls navigate
  }
}, [mode, splitViewSelectedEmailId, navigate, basePath]); // <-- navigate IS a dep
```

The app uses `<BrowserRouter>`, which routes `useNavigate()` through `useNavigateUnstable()`.
The navigate function returned by `useNavigateUnstable` is:

```js
// react-router 6.30.3 source:
let navigate = React.useCallback((to, options = {}) => { ... },
  [basename, navigator, routePathnamesJson, locationPathname, dataRouterContext]);
```

`locationPathname` is in the dep array. **Every `navigate()` call changes
`locationPathname` → React Router recreates the `navigate` function reference.**

The consequence:

1. Something triggers Effect 2 (mode switch, email open, initial mount).
2. Effect 2 calls `navigate(newPath, { replace: true })`.
3. `locationPathname` changes → new `navigate` reference.
4. Effect 2's `navigate` dep changed → React queues Effect 2 cleanup + re-run.
5. Effect 2 re-runs: `newPath === lastUrlRef.current` → guard fires, no second `navigate()`.
6. But: the re-run itself is a no-op extra render cycle.

In isolation this is just "one extra re-run per navigation." But under real inbox usage
(initial mount, auto-expand of 3 categories, email open) there are 5–10 navigate() calls
in quick succession, each triggering another Effect 2 run, creating cascading overhead that
fills React's work queue and keeps the component tree re-rendering.

### Why PostHog amplifies it

PostHog (enabled in production) has two listeners that fire on every navigation:
- **`$pageview`** — fired automatically for every `navigate()` (via `capture_pageview: true`
  default config). Goes to `e/?ip=` endpoint.
- **Session recorder (rrweb)** — records all DOM mutations. Each re-render of the inbox
  component tree (which is large — accordion, email list, split-view panel) generates
  dozens of DOM mutations, which rrweb batches and sends to `s/?ip=`.

**20 navigate/s × (1 `e/` + 1–2 `s/` batches) ≈ 30–40 req/sec** — consistent with 1110
requests in 54 seconds.

### Double-navigate on initial mount

Effect 1 (deps `[]`) and Effect 2 both fire on mount. Effect 1 calls `navigate` when
`!urlMode`. Effect 2 also calls `navigate` (because `lastUrlRef` was initialized from
`pathname` before Effect 1 ran and updated the URL). Two replaceState calls on every
inbox mount for users arriving without a mode in the URL.

## Files to Change

### `client/src/hooks/useInboxUrlSync.ts`

**Change 1 — Remove `navigate` from Effect 2's dep array using the useRef callback pattern.**

This is the same fix applied to Effect 3 in #1177: wrap `navigate` in a ref so the
effect body always has the latest `navigate` but the dep array only contains stable values.

```ts
// Add this near the top of the hook body (after the refs):
const navigateRef = useRef<ReturnType<typeof useNavigate>>(navigate);
navigateRef.current = navigate;   // always up-to-date, no dep change

// Replace Effect 2:
useEffect(() => {
  if (isInitialMount.current) {
    return;
  }
  const newPath = splitViewSelectedEmailId
    ? `${basePath}/${mode}/${splitViewSelectedEmailId}`
    : `${basePath}/${mode}`;
  if (newPath !== lastUrlRef.current) {
    lastUrlRef.current = newPath;
    navigateRef.current(newPath, { replace: true });  // read from ref
  }
}, [mode, splitViewSelectedEmailId, basePath]);         // navigate REMOVED
```

**Change 2 — Effect 1: prevent double-navigate on mount.**

Effect 1 fires when `!urlMode`, but Effect 2 will also fire on mount (since `mode` and
`basePath` are in its deps). On mount, Effect 2 sees `lastUrlRef.current === pathname` (the
pre-redirect URL). If Effect 1 already called `navigate`, Effect 2 also calls it for the
same or equivalent path. Fix: initialize `lastUrlRef` to the *intended* initial path, or
gate Effect 1's navigate on `lastUrlRef` not already matching the target.

Simplest fix — in Effect 1, also update `lastUrlRef` before navigating:

```ts
useEffect(() => {
  if (!isInitialMount.current) {
    return;
  }
  isInitialMount.current = false;
  if (urlThreadId && splitViewSelectedEmailId !== urlThreadId) {
    openEmail(urlThreadId);
  }
  if (!urlMode) {
    const initialPath = `${basePath}/${mode}`;
    lastUrlRef.current = initialPath;   // <-- add this line
    navigate(initialPath, { replace: true });
  }
}, []);
```

This ensures Effect 2 sees `lastUrlRef.current === initialPath` on mount and skips the
second redundant navigate.

## What This Does NOT Change

- Effect 3 (onUrlParamsChangedRef) — already fixed by #1177. No change needed.
- Any PostHog configuration — the spam is a symptom of the navigate loop, not a PostHog bug.
- Any API endpoints — no server changes needed.

## Testing

1. Open inbox. Confirm Chrome DevTools Network tab shows ≤3 requests on mount (no rapid-fire).
2. Switch modes (Triage → Action → Follow-up). Confirm no `Throttling navigation` in console.
3. Open an email in split view, close it, switch modes. Confirm no `Throttling navigation`.
4. Check PostHog dashboard: `$pageview` events should appear only on genuine navigations
   (mode switch, email open/close), not in bursts.
5. Run `npm test -- --watchAll=false` — all existing tests pass.

## Acceptance Criteria

- [ ] No `Throttling navigation` in Chrome console on normal inbox usage
- [ ] Network requests on inbox load ≤ 10 (not 1000+)
- [ ] `navigate` removed from Effect 2's dep array in `useInboxUrlSync.ts`
- [ ] Effect 1 updates `lastUrlRef.current` before calling `navigate()` on mount
- [ ] All tests pass

## Priority

P0 — users see extreme network spam on every inbox load.

## Branch

`openclaw/issue-loop-investigation/plan`

---

_Monk of Modularity (AI agent)_
