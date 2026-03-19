# Plan: Fix Signup Flow Infinite Analysis Loop (P0)

## Problem

New users cannot complete signup. The setup wizard's "Context Analysis" step (step 2/3) spawns `POST /context/analyze` ~5 times and never completes, blocking users from reaching the inbox.

## Root Cause (Two-Part)

### 1. Frontend: Auto-retry loop in `ContextAnalysisStep.tsx`

**File:** `client/src/components/setup-wizard/ContextAnalysisStep.tsx` (lines 168-174)

The `useEffect` auto-calls `startAnalysis()` whenever `!analyzing && !analyzeProgress.isComplete`. When analysis fails:

1. Error is shown to user
2. After 10 seconds, error auto-clears via `setTimeout` in `useAnalysisProgress.ts` (line ~148)
3. `analyzeProgress` resets to `{show: false, error: null, isComplete: false}`
4. `useEffect` dependency changes → triggers `startAnalysis()` again
5. Cycle repeats (~12-15s per iteration, ~5 times before user gives up)

### 2. Backend: Analysis throws for users with no recent emails

**File:** `server/src/context/context.service.ts` (line ~810)

`analyzeAndLearnFromEmails()` throws when no threads found in 5-12 day range. New users (new Gmail, corporate migration, etc.) often have no emails in this window. The throw marks analysis as "failed", which feeds the frontend retry loop.

## Fix (3 changes)

### Change 1: Prevent auto-retry in ContextAnalysisStep

**File:** `client/src/components/setup-wizard/ContextAnalysisStep.tsx`

```tsx
// BEFORE (line 168-174):
const { analyzing, analyzeProgress, startAnalysis } = useAnalysisProgress(handleAnalysisComplete);

useEffect(() => {
  if (!analyzing && !analyzeProgress.isComplete) {
    startAnalysis();
  }
}, [analyzing, analyzeProgress.isComplete, startAnalysis]);

// AFTER:
const { analyzing, analyzeProgress, startAnalysis } = useAnalysisProgress(handleAnalysisComplete);
const hasStartedRef = useRef(false);

useEffect(() => {
  if (!hasStartedRef.current && !analyzing && !analyzeProgress.isComplete) {
    hasStartedRef.current = true;
    startAnalysis();
  }
}, [analyzing, analyzeProgress.isComplete, startAnalysis]);
```

Add `import { useCallback, useEffect, useRef } from 'react';` (add `useRef`).

### Change 2: Don't auto-clear errors in useAnalysisProgress

**File:** `client/src/hooks/settings/useAnalysisProgress.ts`

Remove the auto-clear `setTimeout` in the `startAnalysis` catch block (~lines 148-150):

```ts
// BEFORE (in catch block of startAnalysis):
setTimeout(() => {
  setAnalyzeProgress({ show: false, progress: null, error: null, isComplete: false });
}, LONG_TIMEOUT_MS);

// AFTER: Remove these 3 lines entirely.
// Errors should persist until user clicks "Retry" or "Skip".
```

### Change 3: Gracefully handle zero threads in backend

**File:** `server/src/context/context.service.ts`

```ts
// BEFORE (line ~810):
if (totalThreads === 0) {
  this.logger.warn(`... No threads found ...`);
  await this.usersService.update(userId, {
    scanProgress: -1,
    scanTotal: 100,
  });
  throw new Error(
    "No threads found in the analysis date range. Please ensure you have emails from 5-12 days ago.",
  );
}

// AFTER:
if (totalThreads === 0) {
  this.logger.log(
    `[CONTEXT-ANALYSIS] No threads found in date range for user ${userId}. Completing analysis with empty results.`,
  );
  analysisRecord.status = "completed";
  analysisRecord.progress = 100;
  analysisRecord.total = 100;
  analysisRecord.stats = {
    ...(analysisRecord.stats || {}),
    totalThreads: 0,
    outboundEmails: 0,
    threadsNeverOpened: 0,
    threadsReadButNotReplied: 0,
    vipContactsEvaluated: 0,
  };
  await this.contextAnalysisRepository.save(analysisRecord);
  await this.usersService.update(userId, {
    scanProgress: 100,
    scanTotal: 100,
  });
  return; // Complete gracefully — user can re-analyze later from Settings
}
```

## Testing

1. **New user with no recent emails:** Should pass through step 2 automatically (analysis completes with 0 threads)
2. **New user with emails:** Should analyze normally, show progress, complete
3. **Analysis fails for other reason:** Error persists on screen. User can click "Retry" or "Skip"
4. **Retry button:** Should work (resets `hasStartedRef.current` is not needed — retry button calls `startAnalysis` directly, bypassing the useEffect guard)
5. **Existing users re-running analysis from Settings:** Unaffected (Settings uses `useSettingsData` → `useAnalysisProgress` directly, not `ContextAnalysisStep`)

## Files Changed

| File | Change |
|------|--------|
| `client/src/components/setup-wizard/ContextAnalysisStep.tsx` | Add `useRef` guard to prevent auto-retry loop |
| `client/src/hooks/settings/useAnalysisProgress.ts` | Remove 10s auto-clear of error state |
| `server/src/context/context.service.ts` | Handle zero threads gracefully (complete instead of throw) |

---
*Plan by Monk of Modularity (AI agent)*
