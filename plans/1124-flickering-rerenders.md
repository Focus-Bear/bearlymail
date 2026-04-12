# Plan: #1124 — App goes crazy flickering / rerendering on reload

**Issue:** https://github.com/Focus-Bear/BearlyMail/issues/1124  
**Priority:** HIGH  
**Author:** Monk of Modularity 🧘  
**Status:** Ready for Codebeard

---

## Symptom

App flickers, janks, and continuously re-renders after page reload with no signs of stabilising. Previously this lasted ~2 seconds and settled; now it never stops.

---

## Diagnosis

### Step 1 — Add debug instrumentation (first commit)

Before we can pinpoint the root cause we need to observe which component tree node is re-rendering in an infinite loop.

The issue reporter says to add debug logs. We should add **React DevTools `why-did-you-render` instrumentation** in development mode, plus targeted `console.count` probes in the most likely suspects.

**Most likely suspects, in order of probability:**

#### 1. `useAuthInitialization` — unstable `logout` reference in effect deps

In `client/src/contexts/AuthContext.tsx`, the `logout` function is defined inline as a non-`useCallback`:

```tsx
// CURRENT (AuthContext.tsx)
const logout = () => {
  ...
  setUser(null);
};
```

This `logout` is passed directly to `useAuthInitialization` as a parameter. Inside `useAuthInitialization`, it is assigned to `logoutRef.current` on every render — which is fine. However, the `useEffect` in `useAuthInitialization` has:

```ts
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [setUser, setLoading, retryCount]);
```

`setUser` and `setLoading` are React `useState` setters — they ARE stable across renders. So the effect itself shouldn't loop. **But** `setupAxiosInterceptors` is called inside the effect and closes over `logoutRef`. If `interceptorsSetup` resets or if the module-level `interceptorsSetup = false` is somehow triggered between renders (e.g. test teardown in hot-reload), the interceptors get reinstalled in a loop.

**However**, the more likely culprit is:

#### 2. `useEmailProcessingPolling` — emails array reference instability

```ts
// useEmailProcessingPolling.ts
useEffect(() => {
  const processingEmails = emails.filter(
    (e) => e.isProcessingPriority || e.isProcessingSummary,
  );
  if (processingEmails.length === 0) return;

  const interval = setInterval(() => {
    const stillProcessing = emails.some(
      (e) => e.isProcessingPriority || e.isProcessingSummary,
    );
    if (stillProcessing) {
      onPoll();
    }
  }, LONG_TIMEOUT_MS);

  return () => clearInterval(interval);
}, [
  emails.filter((e) => e.isProcessingPriority || e.isProcessingSummary).length,
]);
```

**The dep array expression `emails.filter(...).length` is computed inline.** While `.length` is a primitive (safe), the filter call runs on every render pass through the hook. This is not the flickering cause itself, but it means the effect is sensitive to `emails` array identity changes.

**`onPoll` is `refreshInPlace`** — if `refreshInPlace` triggers a Redux dispatch that causes `emails` (from `useSelector(selectVisibleEmails)`) to be a new array reference even without content change, the effect re-evaluates. Combined with any render loop upstream, this becomes a continuous poll cycle.

#### 3. `useGitHubBatchFetch` — inline sort/join in effect dep

```ts
// useGitHubBatchFetch.ts
const emailIdsKey = emails
  .map((e) => e.id)
  .sort()
  .join(",");
if (fetchedForRef.current === emailIdsKey) return;
```

This ref guard prevents refetching. However, `emails` is a `useSelector` return value — if the selector returns a new array reference on every render (even with same content), this effect fires repeatedly but the ref guard protects it from actually fetching. Not the root cause, but adds cost.

#### 4. `useInboxInitialization` — `refreshInPlace` identity change triggering re-init

`useInboxInitialization` uses `useEffectEvent(async () => { ... })` — this correctly captures the latest function refs. The gating effect only fires when `[authLoading, user, hasInitiallyLoaded, runInitialization]` change. `runInitialization` is `useEffectEvent`, which returns a stable reference. So this should be safe.

#### 5. `selectVisibleEmails` selector — non-memoized filter returning new array

Check `client/src/store/selectors/emailSelectors.ts` — if `selectVisibleEmails` does any filtering (e.g. `emails.filter(...)`) without `createSelector` memoization, every Redux state update (even unrelated fields like `loading`, `refreshing`, `summaryLoading`) will cause `useSelector` to return a new array, triggering renders in every hook that consumes `emails`.

---

## Investigation Steps (Phase 0 — debug instrumentation)

**Files to modify:**

1. `client/src/main.tsx` (or `client/src/index.tsx`) — add `why-did-you-render` in dev mode:

```tsx
if (import.meta.env.DEV) {
  const { default: whyDidYouRender } =
    await import("@welldone-software/why-did-you-render");
  whyDidYouRender(React, {
    trackAllPureComponents: true,
    logOnDifferentValues: true,
  });
}
```

2. `client/src/hooks/useEmailProcessingPolling.ts` — add render counter:

```ts
const renderCountRef = useRef(0);
renderCountRef.current++;
console.log(
  "[useEmailProcessingPolling] render #",
  renderCountRef.current,
  "emails.length=",
  emails.length,
);
```

3. `client/src/hooks/useInboxInitialization.ts` — add effect firing log:

```ts
useEffect(() => {
  console.log('[useInboxInitialization] effect fired', { authLoading, user: !!user, hasInitiallyLoaded });
  ...
}, [authLoading, user, hasInitiallyLoaded, runInitialization]);
```

4. `client/src/contexts/useAuthInitialization.ts` — log effect firing:

```ts
useEffect(() => {
  console.log('[useAuthInitialization] effect fired, retryCount=', retryCount);
  ...
}, [setUser, setLoading, retryCount]);
```

5. `client/src/store/selectors/emailSelectors.ts` — check if `selectVisibleEmails` is memoized:

```ts
// If it looks like this (NOT memoized):
export const selectVisibleEmails = (state: RootState) =>
  state.email.emails.filter((e) => !state.email.optimisticArchives.has(e.id));

// It should be:
export const selectVisibleEmails = createSelector(
  [
    (state: RootState) => state.email.emails,
    (state: RootState) => state.email.optimisticArchives,
  ],
  (emails, archives) => emails.filter((e) => !archives.has(e.id)),
);
```

---

## Implementation Plan (Phase 1 — fix)

Based on what the debug logs reveal, implement one or more of the following. The **most likely fixes** in priority order:

### Fix A — Memoize `selectVisibleEmails` (HIGHEST PROBABILITY)

**File:** `client/src/store/selectors/emailSelectors.ts`

Check if `selectVisibleEmails` uses `createSelector`. If not:

- Import `createSelector` from `@reduxjs/toolkit` or `reselect`
- Wrap the selector with `createSelector` so it only recomputes when `emails` or `optimisticArchives` actually changes
- Do the same for any other selector that filters/maps and is consumed in component hooks

**Before:**

```ts
export const selectVisibleEmails = (state: RootState) =>
  state.email.emails.filter(
    (e) => !state.email.optimisticArchives.includes(e.id),
  );
```

**After:**

```ts
export const selectVisibleEmails = createSelector(
  [
    (s: RootState) => s.email.emails,
    (s: RootState) => s.email.optimisticArchives,
  ],
  (emails, archives) => emails.filter((e) => !archives.includes(e.id)),
);
```

Apply same treatment to:

- `selectLoadedCategoryNames`
- `selectLoadingCategoryNames`
- `selectExhaustedCategoryNames`
- Any other selectors returning derived arrays

### Fix B — Stabilise `useEmailProcessingPolling` dep array

**File:** `client/src/hooks/useEmailProcessingPolling.ts`

Replace inline computed dep with a stable count variable:

**Before:**

```ts
}, [emails.filter(e => e.isProcessingPriority || e.isProcessingSummary).length]);
```

**After:**

```ts
const processingCount = emails.filter(e => e.isProcessingPriority || e.isProcessingSummary).length;
// ...
}, [processingCount, onPoll]);
```

Note: `onPoll` (`refreshInPlace`) should also be checked for stability — it should be a `useCallback` with stable deps.

### Fix C — Wrap `logout` in `useCallback` in `AuthContext`

**File:** `client/src/contexts/AuthContext.tsx`

```tsx
// Before:
const logout = () => {
  captureEvent(ANALYTICS_EVENTS.USER_LOGGED_OUT);
  resetPostHog();
  localStorage.removeItem("token");
  delete axios.defaults.headers.common["Authorization"];
  setUser(null);
};

// After:
const logout = useCallback(() => {
  captureEvent(ANALYTICS_EVENTS.USER_LOGGED_OUT);
  resetPostHog();
  localStorage.removeItem("token");
  delete axios.defaults.headers.common["Authorization"];
  setUser(null);
}, []); // setUser is stable
```

This doesn't directly cause the loop (since `logout` is used via ref in `useAuthInitialization`) but prevents unnecessary renders of consumers that receive `logout` via context.

### Fix D — Guard `useEmailProcessingPolling` `onPoll` identity

**File:** `client/src/hooks/useEmailProcessingPolling.ts`

Use a `useEffectEvent` for `onPoll` to prevent the interval from being torn down and recreated every time `onPoll` reference changes (which it does every render in `useEmailFetching` / `useInboxUIState`):

```ts
// Use useEffectEvent to always call the latest onPoll without it being a dep
const stableOnPoll = useEffectEvent(onPoll);

useEffect(() => {
  if (processingCount === 0) return;
  const interval = setInterval(() => {
    stableOnPoll();
  }, LONG_TIMEOUT_MS);
  return () => clearInterval(interval);
}, [processingCount]); // onPoll no longer needed as dep
```

---

## Files to Create / Modify / Delete

### Create

- `plans/1124-flickering-rerenders.md` (this file)

### Modify

1. `client/src/hooks/useEmailProcessingPolling.ts`
   - Add render count log (Phase 0)
   - Fix dep array (Phase 1, Fix B)
   - Use `useEffectEvent` for `onPoll` (Phase 1, Fix D)

2. `client/src/store/selectors/emailSelectors.ts`
   - Memoize `selectVisibleEmails` and other derived array selectors (Phase 1, Fix A)

3. `client/src/contexts/AuthContext.tsx`
   - Wrap `logout` in `useCallback` (Phase 1, Fix C)

4. `client/src/main.tsx` (or entry point)
   - Add `why-did-you-render` in dev mode (Phase 0)

### Delete

- None

---

## Testing Approach

1. **Manual:** Reload the app in dev mode with browser console open. Confirm re-render logs settle within 3s after page load (they should stop, not continue indefinitely).
2. **Why-did-you-render output:** Check for repeated "re-rendered due to same props/state" warnings — fix the ones that loop.
3. **Existing tests:** No existing snapshot or integration tests should break. Check `client/src/hooks/useEmailFetching.test.ts` and `client/src/hooks/useEmailManagement.test.ts`.
4. **New test:** Add a render count assertion to `useEmailProcessingPolling.test.ts` (create if it doesn't exist) to assert the effect only fires when `processingCount` changes, not on every `emails` reference change.

---

## Phase Sequence

```
Phase 0 (debug):  Add instrumentation logs → identify the exact culprit
Phase 1 (fix):    Apply Fix A (selector memoisation) + Fix B (dep array) + Fix D (useEffectEvent)
                  + Fix C (logout stability) as a bonus cleanup
Phase 2 (clean):  Remove debug instrumentation logs before PR merge
```

Codebeard should implement Phase 0 first as a commit, observe the output, then implement Phase 1 fixes in subsequent commits, then clean up logs in Phase 2.

---

## Notes for Codebeard

- The issue says it "used to stop after 2 seconds." That 2-second window matches `SHORT_TIMEOUT_MS` (2000ms) and is likely the old polling interval. Recent changes (429 backoff, `usePollingWithBackoff`, the `refreshInPlace` path in `useInboxInitialization`) may have introduced a new render trigger that didn't exist before.
- Check git blame on `useEmailProcessingPolling.ts` and `emailSelectors.ts` to see if they changed in the last 70 commits (the ones that landed on main before this issue was filed).
- The fix should be **incremental** — Phase 0 first to confirm the root cause before touching selectors.
