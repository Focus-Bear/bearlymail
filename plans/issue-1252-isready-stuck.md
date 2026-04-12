# Plan: Fix `isReady` never becoming `true` for users with < 100 emails

**Issue:** #1252
**Priority:** P0 — user completely blocked from inbox
**Author:** Monk of Modularity [AI planner]

## Root Cause

The bug is in `server/src/onboarding/onboarding.service.ts`, method `getEmailImportProgress()`:

```typescript
async getEmailImportProgress(userId: string): Promise<{
  prioritizedCount: number;
  isReady: boolean;
}> {
  const count = await this.emailThreadRepository.count({
    where: { userId },
  });

  return {
    prioritizedCount: count,
    isReady: count >= 100,  // <-- THE BUG
  };
}
```

**`isReady` is hardcoded to `count >= 100`.** If a user has fewer than 100 email threads total, `isReady` will **never** be `true`. The user is stuck on the "Importing and prioritizing emails..." screen forever.

The frontend (`client/src/components/setup-wizard/EmailImportStep.tsx`) also has a matching hardcoded constant:

```typescript
const TARGET_EMAILS = 100;
// ...
const progressPercent = Math.min(
  100,
  Math.round((progress.prioritizedCount / TARGET_EMAILS) * 100),
);
```

The button to proceed is gated on `disabled={!progress.isReady}`, so users with few emails are permanently blocked.

### Why it wasn't caught earlier

Most test accounts probably had ≥ 100 emails. The 3-email account exposed the flaw in the completion logic — it doesn't check whether the import/analysis is actually **done**, only whether a fixed threshold count has been reached.

## Fix

### 1. Backend: Use analysis completion status instead of hardcoded threshold

**File:** `server/src/onboarding/onboarding.service.ts`

Inject the `ContextAnalysis` repository and check whether the analysis has completed, rather than comparing against a magic number:

```typescript
async getEmailImportProgress(userId: string): Promise<{
  prioritizedCount: number;
  isReady: boolean;
}> {
  const count = await this.emailThreadRepository.count({
    where: { userId },
  });

  // Check if the context analysis has completed (or failed — don't block the user on failure either)
  const latestAnalysis = await this.contextAnalysisRepository.findOne({
    where: { userId },
    order: { createdAt: 'DESC' },
  });

  const analysisFinished = latestAnalysis != null &&
    (latestAnalysis.status === 'completed' || latestAnalysis.status === 'failed');

  // isReady when:
  // 1. The analysis job has finished (completed or failed), OR
  // 2. There are enough emails imported (legacy threshold for accounts with many emails)
  const isReady = analysisFinished || count >= 100;

  return {
    prioritizedCount: count,
    isReady,
  };
}
```

This ensures:

- Users with < 100 emails proceed once analysis completes (or fails).
- Users with ≥ 100 emails still proceed at the 100-email mark (backwards-compatible).
- Failed analyses don't block the user indefinitely.

### 2. Frontend: Add a timeout fallback

**File:** `client/src/components/setup-wizard/EmailImportStep.tsx`

Add a timeout so the user is never stuck permanently, even if both the backend check and analysis somehow stall:

```typescript
const IMPORT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Inside the component:
const [timedOut, setTimedOut] = useState(false);

useEffect(() => {
  const timer = setTimeout(() => setTimedOut(true), IMPORT_TIMEOUT_MS);
  return () => clearTimeout(timer);
}, []);

// Change the button disabled condition:
// disabled={!progress.isReady || isLoading}
// becomes:
// disabled={(!progress.isReady && !timedOut) || isLoading}
```

Also update the progress display to show a message when timed out:

```typescript
{timedOut && !progress.isReady && (
  <p>{t('setupWizard.emailImport.timeoutMessage')}</p>
)}
```

### 3. Frontend: Fix progress calculation for small inboxes

**File:** `client/src/components/setup-wizard/EmailImportStep.tsx`

The progress bar should reflect actual completion rather than distance to an arbitrary 100-email target. Return `totalCount` from the backend (once known) and use that:

Option A (simpler): Just use `isReady` to show 100%:

```typescript
const progressPercent = progress.isReady
  ? 100
  : Math.min(99, Math.round((progress.prioritizedCount / TARGET_EMAILS) * 100));
```

Option B (better UX — requires backend change): Return an estimated total from the analysis job and calculate against that. This is a nice-to-have, not blocking for the fix.

## Files to Change

| File                                                     | Change                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `server/src/onboarding/onboarding.service.ts`            | Inject `ContextAnalysis` repo, check analysis status for `isReady` |
| `server/src/onboarding/onboarding.module.ts`             | Add `ContextAnalysis` entity to module imports (if not already)    |
| `client/src/components/setup-wizard/EmailImportStep.tsx` | Add timeout fallback, fix progress % for `isReady`                 |

## Testing

1. **Unit test:** `getEmailImportProgress` returns `isReady: true` when analysis status is `completed` and count < 100
2. **Unit test:** `getEmailImportProgress` returns `isReady: true` when analysis status is `failed` (don't block user on failure)
3. **Unit test:** `getEmailImportProgress` returns `isReady: false` when analysis is still `running` and count < 100
4. **Unit test:** `getEmailImportProgress` returns `isReady: true` when count ≥ 100 regardless of analysis status (backwards-compat)
5. **E2E/manual:** Create a new account, connect a Gmail with < 100 emails, verify the import screen completes and the "Enter My Inbox" button becomes active
6. **E2E/manual:** Verify the 5-minute frontend timeout works if the backend is artificially stalled

## Risk Assessment

- **Low risk.** The fix adds a proper completion check alongside the existing threshold.
- **No breaking changes.** The ≥ 100 threshold is preserved as a fallback.
- **Edge case:** If no analysis record exists at all (e.g., user navigated to import screen before triggering analysis), `isReady` falls back to the count check — same as current behavior.
