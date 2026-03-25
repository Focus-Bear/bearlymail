# Plan: Fix #1454 — Retry failed email prioritisations + detect stale priority=0

## Problem

Many emails have `priority=0`, categorised as "Other", showing "Calculating..." badges. But when clicked (triggering the `POST /emails/:id/accelerate` endpoint), they recalculate correctly (e.g. to score 25). This means:

1. **Batch prioritisation failed/timed out** for these emails during the initial context analysis
2. **The failed emails were never retried** at the individual thread/email level
3. The on-click recalculation via `refine-priority` job works perfectly — proving the priority logic itself is correct

## Root Cause Analysis

### How batch prioritisation works

1. **Context analysis orchestrator** (`context-analysis-orchestrator.service.ts`) triggers a full inbox scan
2. Threads are split into batches and enqueued as `analyze-context-batch` PgBoss jobs
3. **`ContextBatchAnalysisProcessor`** processes each batch:
   - Fetches threads from Gmail (or uses pre-processed payloads)
   - Calls `LLMService.analyzeEmailPatterns()` to extract user context (goals, priorities, writing style)
   - Saves batch results to the `context_analyses.stats.batchResults` JSON column
4. **`ContextAnalysisFinalizerService`** combines all batch results into user context entries
5. **Separately**, `refine-priority` / `refine-priority-batch` jobs handle per-email priority scoring

### The gap: context analysis ≠ per-email priority scoring

The context analysis batches extract **user-level patterns** (what topics are urgent, goals, writing style) — they do NOT calculate per-email priority scores. Per-email priority scoring happens via the `refine-priority` job, which is queued:

- When a **new email arrives** (via `email-lifecycle.service.ts` → `queuePriorityRefinement()`)
- When user **clicks an email** (via `POST /emails/:id/accelerate`)
- During **bulk recategorization** flows

### Where things go wrong

**Gap 1: `refine-priority` batch job fails silently for some emails**

In `PriorityAnalysisService.analyzePriorityBatch()` (line ~440 in `priority-analysis.service.ts`):
- If the entire LLM call throws, the `catch` block logs the error but then `fillFallbackEntries()` sets ALL emails in the batch to `isFallback: true` with `urgencyScore: 0`, `category: "Other"`
- In `LLMPriorityBatchService.applyBatchResults()`, fallback entries are **deliberately skipped** (`if (llmResult.isFallback) { continue; }`) to "preserve existing priority score"
- **But**: if the email had no existing priority (new email), this means it's left at the default score (0) with no breakdown — the "Calculating..." state

**Gap 2: No retry mechanism for individually failed emails**

- `fillFallbackEntries()` marks missing emails as `isFallback: true` and logs them, but:
  - Does NOT re-queue them for individual retry
  - Does NOT mark them in any way that a background job could pick up
  - The `isProcessingPriority` flag is reset to `false` in `cleanupBatchOnError()`, making the system think processing is "done"

**Gap 3: The existing `requeueMissingBatches` only handles context analysis batches**

`ContextAnalysisProgressService.checkAndSyncJobs()` can detect and re-queue missing **context analysis** batches, but this is for the context/pattern extraction pipeline, NOT for per-email `refine-priority` jobs.

**Gap 4: `fixStuckCalculatingThreads()` exists but is only triggered manually**

`EmailDebugService.fixStuckCalculatingThreads()` finds threads with `isProcessingPriority=true` for >10 minutes and re-queues them. But:
- It's only callable via a manual script (`fix-stuck-calculating.ts`) or admin endpoint
- It relies on `isProcessingPriority=true` — but the cleanup already resets this to `false`
- There's no periodic/automatic invocation

**Gap 5: On-click accelerate only triggers if score equals the default (50)**

In `emails.controller.ts` line ~909:
```typescript
if (priorityScore === EMAIL_CONTROLLER_DEFAULTS.PRIORITY_SCORE || thread?.isProcessingPriority)
```
`EMAIL_CONTROLLER_DEFAULTS.PRIORITY_SCORE` is 50. But `getPriorityScore()` returns 0 when there's no breakdown. So clicking emails with score=0 DOES trigger recalculation (since 0 ≠ 50... wait, let me re-read).

Actually, `getPriorityScore()` returns 0 when `thread.priorityExplanation` has no breakdown. The accelerate endpoint checks `priorityScore === 50` — so score=0 would NOT match. BUT there's also the `thread?.isProcessingPriority` check. If `isProcessingPriority` was already reset to `false` by cleanup, the accelerate endpoint would NOT re-queue.

**Updated finding**: On-click recalculation works because the `shouldSkipPriorityRecalculation()` method in `LLMPriorityBatchService` checks for `hasCalculatingItems` — so even if the refine-priority job runs, it detects "Calculating..." items and forces recalculation. The accelerate endpoint must be triggering because score=0 ≠ 50 (the default). Let me re-check...

Actually, looking more carefully: `getPriorityScore()` returns 0 when no breakdown exists, but `EMAIL_CONTROLLER_DEFAULTS.PRIORITY_SCORE` is 50. So `0 === 50` is false. BUT: the `||` condition also checks `thread?.isProcessingPriority`. If that's `false`, neither condition is met, and priority refinement is NOT queued.

**So how does on-click work?** The issue says "when clicked, they recalculate correctly." This likely happens because the user triggers some other flow that eventually causes recalculation, OR the accelerate endpoint has additional paths I haven't traced.

Regardless, the core issue is clear: **batch priority failures leave emails stuck at score=0 with no retry.**

### How on-click actually recalculates (corrected)

Looking at the accelerate endpoint again (line 909):
```typescript
if (
  priorityScore === EMAIL_CONTROLLER_DEFAULTS.PRIORITY_SCORE ||
  thread?.isProcessingPriority
)
```
This checks if score === 50 OR isProcessingPriority. For stuck emails with score=0 and isProcessingPriority=false, NEITHER condition is true. So the accelerate endpoint does NOT queue a refine-priority job.

The recalculation Jeremy observes when clicking must come from a different path — possibly the `shouldSkipPriorityRecalculation` check detecting `hasCalculatingItems` when a refine-priority job runs for another reason (e.g. new email in the same thread, or batch recategorization).

**This is an additional bug**: the accelerate endpoint should also trigger re-prioritisation when `priorityScore === 0` (no breakdown exists).

## Proposed Changes

### 1. Fix accelerate endpoint to detect score=0 (no breakdown) — `emails.controller.ts`

```typescript
// Current (broken for score=0):
if (priorityScore === EMAIL_CONTROLLER_DEFAULTS.PRIORITY_SCORE || thread?.isProcessingPriority)

// Fixed:
const hasNoBreakdown = !thread?.priorityExplanation?.breakdown || thread.priorityExplanation.breakdown.length === 0;
if (priorityScore === EMAIL_CONTROLLER_DEFAULTS.PRIORITY_SCORE || thread?.isProcessingPriority || hasNoBreakdown)
```

### 2. Add re-queue for individually failed emails in `analyzePriorityBatch` — `priority-analysis.service.ts`

After `fillFallbackEntries()`, emit an event or return metadata indicating which email keys got fallback values, so the caller can re-queue them individually.

**Option A (simpler):** In `LLMPriorityBatchService.runBatchRefinement()`, after `applyBatchResults()`, check for any emails that still have no valid breakdown and re-queue them as individual `refine-priority` jobs with a delay.

```typescript
// After applyBatchResults:
for (const email of emailsNeedingFullAnalysis) {
  const result = batchResults.get(email.id);
  if (!result || result.isFallback) {
    await this.boss.send(
      JOB_NAMES.REFINE_PRIORITY,
      { userId, emailId: email.id, isRetry: true },
      {
        priority: getJobPriority(JOB_NAMES.REFINE_PRIORITY_BACKGROUND, false),
        singletonKey: `refine-priority-retry-${email.id}`,
        startAfter: 60, // retry after 60 seconds
      }
    );
  }
}
```

### 3. Add periodic detection of stale priority=0 threads — new scheduled job

Create a new service `StuckPriorityDetectionService` that runs periodically (every 15 minutes, like the existing `ContextAnalysisCleanupService`):

```typescript
// Pseudo-code
@Injectable()
export class StuckPriorityDetectionService implements OnModuleInit {
  // Schedule: every 15 minutes
  // Logic:
  // 1. Find all threads where:
  //    - priorityScore = 0 or priorityExplanation is null/empty
  //    - isProcessingPriority = false (not currently being processed)
  //    - createdAt > 5 minutes ago (give initial processing time)
  //    - userId has completed at least one context analysis
  // 2. For each stuck thread, queue a refine-priority job
  // 3. Cap at MAX_REQUEUE_PER_RUN (e.g. 50) to avoid flooding
  // 4. Log metrics for monitoring
}
```

### 4. Add `retryCount` tracking to prevent infinite retry loops

Add a `priorityRetryCount` field to the `EmailThread` entity (or track in `priorityExplanation` JSON):
- Increment on each retry attempt
- Stop retrying after MAX_PRIORITY_RETRIES (e.g. 3)
- Log to error tracking when max retries exceeded

### 5. Fix batch error handling to preserve per-email granularity — `priority-analysis.service.ts`

In `analyzePriorityBatch()`, when the LLM call throws entirely:
- Currently: ALL emails get `isFallback: true`
- Better: Attempt to split the batch and retry smaller sub-batches (e.g. if batch of 10 fails, try 2 batches of 5)
- Even better: Fall back to individual `analyzePriority()` calls for each email

```typescript
// In analyzePriorityBatch, catch block:
catch (error) {
  this.logger.error(`Batch analysis failed, falling back to individual analysis...`);
  // Try individual analysis for each email
  for (const email of emails) {
    try {
      const result = await this.analyzePriority({
        email: { from: email.from, subject: email.subject, body: email.body },
        userContext,
        userId,
      });
      results.set(email.emailKey, { ...result, isFallback: false });
    } catch (individualError) {
      // Only mark as fallback if individual also fails
      this.logger.error(`Individual analysis also failed for ${email.emailKey}`);
    }
  }
}
```

### 6. UI: Show "Calculating..." for score=0 without breakdown

On the frontend, when `priorityScore === 0` and `priorityExplanation?.breakdown` is empty/null:
- Display "Calculating..." badge instead of "Other (0)"
- This is already partially implemented (the issue mentions "Calculating..." badges) but should be made explicit

## Implementation Order

1. **Fix 1 (accelerate endpoint)** — Quick win, fixes on-click for stuck emails
2. **Fix 3 (periodic detection)** — Safety net to catch any stuck emails automatically
3. **Fix 2 (re-queue fallback emails)** — Prevents the problem from occurring in the first place
4. **Fix 4 (retry count tracking)** — Prevents infinite retry loops
5. **Fix 5 (batch error resilience)** — Graceful degradation for LLM failures
6. **Fix 6 (UI)** — Better UX while emails are in stuck state

## Files to Modify

| File | Change |
|------|--------|
| `server/src/emails/emails.controller.ts` | Fix accelerate endpoint to detect score=0 |
| `server/src/emails/llm-priority-batch.service.ts` | Add retry queueing for fallback results in `runBatchRefinement()` |
| `server/src/llm/priority-analysis.service.ts` | Add individual-fallback in batch catch block |
| `server/src/emails/stuck-priority-detection.service.ts` | **NEW** — periodic job to detect and re-queue stuck threads |
| `server/src/database/entities/email-thread.entity.ts` | Add `priorityRetryCount` field (or use JSON in priorityExplanation) |
| `server/src/emails/emails.module.ts` | Register new service |
| `server/src/context/context.module.ts` | Possibly register detection service here |

## Risk Assessment

- **Low risk**: Fix 1 (accelerate endpoint) — trivial condition change
- **Low risk**: Fix 6 (UI) — display-only change
- **Medium risk**: Fix 2 (re-queue fallback) — could cause duplicate processing if not properly deduplicated (mitigated by PgBoss singletonKey)
- **Medium risk**: Fix 3 (periodic detection) — needs careful query to avoid re-queuing emails that are legitimately low priority
- **Medium risk**: Fix 4 (retry count) — DB migration needed
- **Higher risk**: Fix 5 (batch fallback to individual) — increases LLM costs during failures, needs rate limiting

## Key Insight

The architecture has TWO separate pipelines:
1. **Context analysis pipeline** (`analyze-context-batch`) — extracts user-level patterns (goals, urgency rules, writing style)
2. **Priority refinement pipeline** (`refine-priority` / `refine-priority-batch`) — scores individual emails using those patterns

The context analysis pipeline HAS retry/requeue logic (`ContextAnalysisProgressService.requeueMissingBatches()`). The priority refinement pipeline does NOT. This is the root cause.

---

*Investigation by Monk of Modularity 🧘 — 2026-03-25*
*Issue: Focus-Bear/BearlyMail#1454*
