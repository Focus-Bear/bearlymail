# Plan: Fix #1400 — Backend Analysis Job Hangs

## Issue

After PR #1401 fixed frontend polling, Jeremy reports analysis **still gets stuck** at the loading screen. The frontend fix is working correctly (polling resumes on reload, backoff is stable), but the backend analysis job never reaches "completed" status.

## Root Cause Analysis

### Bug #1 (P0): Finalization processor accesses `job.payload` instead of `job.data`

**File:** `server/src/context/context-finalization.processor.ts:267`

```typescript
// BROKEN — pg-boss v9 uses .data, not .payload
const jobData = job.payload as FinalizationJob;
```

Every other processor in the codebase uses `job.data`:

- `context-analysis.processor.ts:54` → `job.data as { userId, analysisId }`
- `context-batch-analysis.processor.ts:715` → `const jobData = job.data`
- `follow-ups.processor.ts:223` → `job.data as { ... }`
- `contacts/contact-sync.processor.ts:63` → `job.data as { userId }`

pg-boss v9.0.3 (`package.json: "pg-boss": "^9.0.3"`) `Job<T>` interface defines `data: T`, not `payload`. The finalization processor uses a custom `PgBossJob` interface with `payload: unknown` and casts through `unknown`, which bypasses TypeScript's type checking.

**Impact:** `job.payload` is `undefined` at runtime. All destructured fields (`userId`, `analysisRecordId`, `totalBatches`) are `undefined`. The `resolveActualTotalBatches` call passes `undefined` as the analysisRecordId, which either returns null or fails. The finalization job throws, PgBoss retries it 3 times (global `retryLimit: 3`), all fail. **The analysis NEVER transitions from "running" to "completed".**

**Fix:** Change `job.payload` to `job.data` and remove the custom `PgBossJob` interface. Use `PgBoss.Job<FinalizationJob>` directly, matching the pattern of every other processor.

### Bug #2 (P1): `emailBatch` vs `batch` key mismatch in re-queued batch jobs

**File:** `server/src/context/context-analysis-progress.service.ts:326`

```typescript
// In checkAndSyncJobs → requeueMissingBatches:
const jobId = await this.boss.send(
  JOB_NAMES.ANALYZE_CONTEXT_BATCH,
  {
    userId,
    batchIndex,
    emailBatch: batchPayload,  // ← WRONG KEY
    analysisId,                // ← WRONG KEY (should be analysisRecordId)
  },
  ...
);
```

But the batch processor destructures:

```typescript
// context-batch-analysis.processor.ts:715-718
const jobData = job.data;
const { userId, batchIndex, analysisRecordId, totalBatches, threadIds } =
  jobData;
const legacyBatch = jobData.batch; // ← expects "batch", not "emailBatch"
```

**Impact:** Re-queued jobs (from `checkAndSyncJobs`) arrive with `emailBatch` set but `batch` undefined and `threadIds` undefined. The `resolveBatch` method throws `"No threadIds or batch provided"`. Additionally, `analysisId` should be `analysisRecordId`, and `totalBatches` is not provided at all.

**Fix:** Match the field names in the re-queue payload to what the processor expects:

```typescript
{
  userId,
  batchIndex,
  batch: batchPayload,           // was: emailBatch
  analysisRecordId: analysisId,  // was: analysisId
  totalBatches: stats.totalBatches,
  sentPayload: [],
  currentContextForPrompt: [],
}
```

### Bug #3 (P1): No max re-queue limit for finalization job

**File:** `server/src/context/context-finalization.processor.ts:145-185`

When batches aren't complete, `requeueFinalizationJob` re-queues itself every 10 seconds with no upper bound. Combined with Bug #1, this creates an infinite loop of failing finalization jobs.

**Fix:** Add a `retryCount` field to the finalization job data, increment on each re-queue, and fail the analysis after a maximum number of retries (e.g., 30 retries × 10s = 5 minutes max wait, or configurable).

```typescript
interface FinalizationJob {
  // ... existing fields
  retryCount?: number; // track re-queue attempts
}

// In requeueFinalizationJob:
const MAX_FINALIZATION_RETRIES = 30;
const currentRetryCount = (jobData.retryCount || 0) + 1;
if (currentRetryCount > MAX_FINALIZATION_RETRIES) {
  // Mark analysis as failed
  analysisRecord.status = "failed";
  analysisRecord.errorMessage =
    "Analysis timed out waiting for batch completion";
  await this.contextAnalysisRepository.save(analysisRecord);
  return;
}
// Include retryCount in re-queued job
const updatedJobData = {
  ...jobData,
  totalBatches: actualTotalBatches,
  retryCount: currentRetryCount,
};
```

### Bug #4 (P2): No global timeout for stuck "running" analyses

There is no scheduled job or mechanism to detect analyses that have been in "running" status for an unreasonable amount of time (e.g., > 1 hour) and mark them as failed. If PgBoss loses a job or the worker crashes, the analysis stays "running" forever.

**Fix:** Add a periodic cleanup job (via PgBoss schedule or NestJS `@Cron`) that:

1. Finds all analyses with `status = "running"` older than 1 hour
2. Marks them as `status = "failed"` with `errorMessage = "Analysis timed out. Please try again."`
3. Runs every 15 minutes

## Implementation Plan

### Step 1: Fix P0 — `job.payload` → `job.data` (Bug #1)

- **File:** `server/src/context/context-finalization.processor.ts`
- Remove custom `PgBossJob` interface
- Change `job as unknown as PgBossJob` to `job as PgBoss.Job<FinalizationJob>`
- Change `job.payload` to `job.data`
- Add PgBoss import for the Job type

### Step 2: Fix P1 — Re-queue payload field names (Bug #2)

- **File:** `server/src/context/context-analysis-progress.service.ts`
- In `requeueMissingBatches`: change `emailBatch` → `batch`, `analysisId` → `analysisRecordId`, add `totalBatches`, `sentPayload`, `currentContextForPrompt`

### Step 3: Fix P1 — Add finalization re-queue limit (Bug #3)

- **File:** `server/src/context/context-finalization.processor.ts`
- Add `retryCount` to `FinalizationJob` interface
- Track and increment retry count on each re-queue
- Fail analysis after max retries (30 × 10s = 5 minutes)
- Add constant `MAX_FINALIZATION_RETRIES` to `server/src/constants/service-constants.ts`

### Step 4: Fix P2 — Add stuck analysis cleanup (Bug #4)

- **File:** New `server/src/context/context-analysis-cleanup.service.ts`
- Schedule a periodic job (every 15 min) to detect and fail stuck analyses
- Criteria: `status = "running"` AND `updatedAt < NOW() - 1 hour`
- Register in `server/src/context/context.module.ts`

## Testing Strategy

1. **Unit test for finalization job data access:** Mock a PgBoss job with `.data` set, verify processor reads it correctly
2. **Unit test for re-queue payload:** Verify `requeueMissingBatches` sends correct field names
3. **Unit test for finalization retry limit:** Verify analysis is failed after max retries
4. **Integration test:** Start analysis, simulate batch completion, verify finalization triggers and completes
5. **E2E smoke test:** Run full analysis flow, verify progress reaches 100% and status becomes "completed"

## Risk Assessment

- **Bug #1 fix is zero-risk** — it's clearly wrong (using `.payload` when every other processor uses `.data`)
- **Bug #2 fix is low-risk** — corrects field names to match processor expectations
- **Bug #3 fix is low-risk** — adds a safety net without changing happy path
- **Bug #4 fix is low-risk** — cleanup only affects stuck analyses, does not touch active ones

## Files Changed

| File                                                      | Change                                    |
| --------------------------------------------------------- | ----------------------------------------- |
| `server/src/context/context-finalization.processor.ts`    | Fix `.payload` → `.data`, add retry limit |
| `server/src/context/context-analysis-progress.service.ts` | Fix re-queue payload field names          |
| `server/src/constants/service-constants.ts`               | Add `MAX_FINALIZATION_RETRIES` constant   |
| `server/src/context/context-analysis-cleanup.service.ts`  | NEW: stuck analysis cleanup               |
| `server/src/context/context.module.ts`                    | Register cleanup service                  |

## References

- Issue: #1400
- PR #1401 (frontend fix, merged)
- pg-boss v9.0.3 types: `Job<T>` has `data: T`, not `payload`
