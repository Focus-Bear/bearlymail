# Plan: Fix #1400 — Analyse emails stuck + polling backoff + resume on reload

**Issue:** [#1400](https://github.com/Focus-Bear/BearlyMail/issues/1400)
**Author:** Monk of Modularity (AI agent)

---

## Bug 1: Gets stuck loading for several minutes (never completes)

### Root Cause

The `useEffect` in `useAnalysisProgress.ts` (line ~159) has `backoff` in its dependency array:

```ts
}, [analyzing, analysisId, onComplete, backoff]);
```

The `usePollingWithBackoff` hook (line 219 of `usePollingWithBackoff.ts`) returns a **new object literal on every render**:

```ts
return { getState, onSuccess, onError, isInFlight, markInFlight, clearInFlight, shouldSkip, cancelAll };
```

While the individual functions are stable (`useCallback`), the **container object** is recreated each render. Since JavaScript uses referential equality, `backoff !== prevBackoff` on every render, causing the `useEffect` to:

1. Run its cleanup (clear the polling timeout)
2. Re-initialize and call `pollProgress()` immediately
3. This triggers a `setAnalyzeProgress()` state update → re-render → repeat

The net effect: polling fires on every render cycle rather than waiting the intended 2s (`POLLING_INTERVAL_MS`). The backend analysis itself may complete, but the frontend is in a tight render loop where progress state is constantly being torn down and rebuilt, creating the "stuck" appearance.

Additionally, each render-triggered poll restart resets the local `retryCount` and `errorCount` variables (defined inside the effect), meaning the "no progress after N retries" timeout at line ~223 (`MAX_RETRIES_POLLING = 30`) can never be reached — it restarts from 0 each time.

### Files to Change

| File | Line(s) | Change |
|------|---------|--------|
| `client/src/hooks/usePollingWithBackoff.ts` | 219 | Wrap return value in `useMemo` to stabilize the object reference |
| `client/src/hooks/settings/useAnalysisProgress.ts` | ~310 | Remove `backoff` from the dependency array (the individual backoff functions are already stable refs) |

### Implementation Steps

1. **In `usePollingWithBackoff.ts`**, replace the bare return with:
   ```ts
   return useMemo(
     () => ({ getState, onSuccess, onError, isInFlight, markInFlight, clearInFlight, shouldSkip, cancelAll }),
     [getState, onSuccess, onError, isInFlight, markInFlight, clearInFlight, shouldSkip, cancelAll]
   );
   ```
   Import `useMemo` from React.

2. **In `useAnalysisProgress.ts`**, update the effect dependency array from:
   ```ts
   }, [analyzing, analysisId, onComplete, backoff]);
   ```
   to:
   ```ts
   }, [analyzing, analysisId, onComplete]);
   ```
   Since `backoff` functions are stable refs, they don't need to be in the dep array. The `useMemo` wrapper in step 1 is defense-in-depth.

---

## Bug 2: On page reload, restarts the whole analysis instead of resuming

### Root Cause

`useAnalysisProgress` (line ~100) initializes with:
```ts
const [analyzing, setAnalyzing] = useState(false);
const [analysisId, setAnalysisId] = useState<string | null>(null);
```

There is **no mount-time check** for an already-running backend analysis. The `useEffect` that drives polling only fires when `analyzing === true`, which only happens when the user clicks "Analyze" (calling `startAnalysis()`).

On reload, the frontend starts fresh with `analyzing: false`, so it never polls. If the user clicks "Analyze" again, `POST /context/analyze` marks the existing running analysis as `"failed"` (superseded) and starts a new one from scratch (context.controller.ts line ~286).

### Files to Change

| File | Line(s) | Change |
|------|---------|--------|
| `client/src/hooks/settings/useAnalysisProgress.ts` | New code near top of hook | Add a mount-time effect to check for active analysis |
| `server/src/context/context.controller.ts` | Existing `getAnalyzeProgress` endpoint | No change needed — it already supports querying without `analysisId` and finds running analyses |

### Implementation Steps

1. **Add a mount-time "resume" effect** in `useAnalysisProgress.ts`, after state initialization but before the main polling effect:

   ```ts
   // On mount, check if there's an active analysis to resume
   useEffect(() => {
     let cancelled = false;
     const checkForActiveAnalysis = async () => {
       try {
         const response = await axios.get(`${API_URL}/context/analyze-progress`);
         if (cancelled) return;
         
         // If there's an active analysis with progress, resume polling
         if (response.data.progress && !response.data.error) {
           const { current, total } = response.data.progress;
           const isComplete = total > 0 && current >= total;
           
           if (!isComplete) {
             // There's an active analysis — resume tracking it
             // We don't have the analysisId, but the backend will find the running one
             setAnalyzing(true);
             setAnalyzeProgress({
               show: true,
               progress: response.data.progress,
               error: null,
               isComplete: false,
             });
             // Note: analysisId stays null — the backend's getAnalysisProgress
             // already falls back to finding the most recent running/pending analysis
             // when no analysisId is provided. This is fine for resumption.
           }
         }
       } catch {
         // Silently ignore — if we can't check, we just won't resume
       }
     };
     
     checkForActiveAnalysis();
     return () => { cancelled = true; };
   }, []); // Run only on mount
   ```

2. **Update the polling effect** to allow polling when `analysisId` is null (for resumed analyses):
   - Currently line ~163 returns early if `!analysisId`. For resumed analyses, `analysisId` will be null but `analyzing` will be true.
   - Change the guard to: if `!analyzing` return; if `!analysisId`, poll without the `?analysisId=` query parameter (the backend already handles this — see `getAnalysisProgress` fallback logic at context.service.ts line ~118).

   Specifically, update the poll URL construction (line ~280):
   ```ts
   const url = analysisId
     ? `${API_URL}/context/analyze-progress?analysisId=${analysisId}`
     : `${API_URL}/context/analyze-progress`;
   ```

   And remove or adjust the early return at line ~163:
   ```ts
   // Remove this block:
   // if (!analysisId) {
   //   devDebug('Waiting for analysisId before starting to poll...');
   //   return;
   // }
   ```
   Instead, just check `if (!analyzing) return;` and let the poll URL handle the presence/absence of `analysisId`.

---

## Bug 3: Spams progress endpoint every 200ms — should wait 2s from last response

### Root Cause

This is the same root cause as Bug 1. The `POLLING_INTERVAL_MS` constant is already set to 2000ms (line 188 of `numbers.ts`), and the `setTimeout` at line ~297 correctly uses it:

```ts
pollingTimeoutRef.current = setTimeout(() => {
  if (!cancelledRef.current) {
    pollProgress();
  }
}, POLLING_INTERVAL_MS);
```

However, because `backoff` is an unstable dependency (see Bug 1), the entire effect teardown/restart cycle fires on every render (~every 10-50ms depending on React batching), bypassing the 2s timeout entirely. Each effect restart calls `pollProgress()` immediately.

### Fix

Fixing Bug 1 (stabilizing `backoff` + removing from deps) will also fix this bug. The existing 2s-after-response setTimeout logic is correct; it just never gets to wait because the effect keeps restarting.

### Verification

After the fix, verify in browser DevTools Network tab that `analyze-progress` requests are spaced ~2s apart (after each response), not bunched together.

---

## Bug 4: Unrelated error visible in screenshot

### Root Cause Analysis

The third screenshot in the issue shows an error that appears separate from the analysis flow. Without being able to view the actual screenshot content (GitHub user-uploaded assets are inaccessible via API), the most likely candidates based on the codebase are:

1. **GitHub OAuth callback error** — `Settings.tsx` line 28 references `GITHUB_CALLBACK_ERROR = 'error'`, and lines 54-77 handle GitHub OAuth callback errors. If the URL contains `?error=...` params (e.g., from a failed GitHub integration attempt), the Settings page shows an error toast/message.

2. **Stale/expired API key error** — The Settings page has OpenAI and Anthropic API key validation sections. If an API key check fails during page load, it could show an error banner unrelated to analysis.

3. **Account fetch error** — `useSettingsData.ts` line 36-50 fetches Google/Office365/Zoho accounts with `.catch(() => null)` — these are silenced. But if the `/users/me` call fails, it could surface an error.

### Recommendation

Since the screenshot is not viewable, Codebeard should ask Jeremy to describe the error text or re-upload the screenshot. Alternatively, reproduce by:
1. Starting an analysis on the Settings page
2. Looking for any error banners/toasts that appear *outside* the AnalysisProgressModal
3. Checking browser console for unhandled errors during analysis

If the error is the GitHub callback error, it's a URL parameter issue — navigating to `/settings` from the inbox "Analyze emails" button appends `#context` but not `?error=...`, so this is unlikely unless the user has OAuth callback residue in their URL.

---

## Summary of Changes

| Priority | File | Change | Bugs Fixed |
|----------|------|--------|------------|
| P0 | `client/src/hooks/usePollingWithBackoff.ts` | Wrap return in `useMemo` | #1, #3 |
| P0 | `client/src/hooks/settings/useAnalysisProgress.ts` | Remove `backoff` from useEffect deps | #1, #3 |
| P1 | `client/src/hooks/settings/useAnalysisProgress.ts` | Add mount-time resume effect | #2 |
| P1 | `client/src/hooks/settings/useAnalysisProgress.ts` | Allow polling without `analysisId` for resumed analyses | #2 |
| P2 | TBD (need screenshot) | Fix unrelated error | #4 |

## Testing Checklist

- [ ] Start analysis → verify Network tab shows polls ~2s apart (not 200ms)
- [ ] Start analysis → let it run to 30% → reload page → verify modal reappears and polling resumes from last progress (not 0%)
- [ ] Start analysis → let it complete → verify completion message shows with stats
- [ ] Start analysis → dismiss modal → verify polling stops (no more network requests)
- [ ] Start analysis → trigger a 429 → verify exponential backoff works correctly
- [ ] Start analysis with no emails in 5-12 day range → verify it completes gracefully
- [ ] Run ESLint — verify no `react-hooks/exhaustive-deps` warnings from the dep array change (the backoff functions are stable refs, so this is safe)
