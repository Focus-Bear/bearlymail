# PLAN: Fix thread re-summarization when new emails arrive

## Bug Summary

When a new email arrives in an existing thread, the thread's summary, priority score, and category are NOT reliably updated. Users see stale data that only reflects the original emails.

## Root Cause Analysis

### Root Cause 1: `GENERATE_SUMMARY` job copies stale summary instead of re-summarizing

**File:** `server/src/emails/llm-processor.ts` — `collectSummaryJobsToProcess()` (line ~985-1007)

When a new email arrives in a thread that already has summarized emails, the summary generation job:
1. Finds any sibling email in the same thread that has a summary
2. **Copies that existing (stale) summary** to the new email
3. Increments `skipCount.alreadyHasSummary` and skips LLM processing

```typescript
// line ~988-1007 in collectSummaryJobsToProcess
const emailWithSummary = await this.emailRepository.findOne({
  where: { emailThreadId: email.emailThreadId, summary: Not(IsNull()) },
  select: ["id", "summary", "phishingConfidence", "phishingReason"],
});
if (emailWithSummary?.summary && emailWithSummary.summary.trim() !== "") {
  // Copies OLD summary to new email — never regenerates!
  await this.emailRepository.update({ id: emailId }, {
    summary: emailWithSummary.summary,
    isProcessingSummary: false,
    phishingConfidence: emailWithSummary.phishingConfidence ?? null,
    phishingReason: emailWithSummary.phishingReason ?? null,
  });
  skipCount.alreadyHasSummary++;
  continue; // <--- SKIPS re-summarization entirely
}
```

**Impact:** Thread summary never reflects new email content. The user sees a summary from the first email(s) only.

### Root Cause 2: Batch priority refinement path skips incremental summary update

**File:** `server/src/emails/llm-processor.ts` — `handleRefinePriorityBatchJob()` / `runBatchRefinement()`

The single-email priority refinement path (`handleRefinePriorityJob`) correctly calls `tryIncrementalAnalysis()`, which:
1. Checks if full recalc is needed via `IncrementalAnalysisService.checkIfRecalcNeeded()`
2. Updates the summary incrementally via `updateSummaryIncrementally()`

But the **batch** priority refinement path (`handleRefinePriorityBatchJob`) does NOT:
- It calls `prepareBatchEmails()` → `shouldSkipPriorityRecalculation()` → batch LLM → `applyBatchResults()`
- **No call to `tryIncrementalAnalysis()` or `updateSummaryIncrementally()`**

This means when ≥5 emails arrive in a sync (triggering batch mode via `queueBatchPriorityRefinement`), the summary is never updated even though priority is recalculated.

### Root Cause 3: Category not updated in incremental path

The `tryIncrementalAnalysis()` method updates urgency score and summary, but when `incrementalResult.categoryMightChange` is true, it does NOT trigger a category recalculation. The field is returned by the LLM but never acted upon.

## Flow Diagram

```
New email arrives in existing thread
  └─> processMessage() (gmail-sync.service.ts)
      └─> emailsService.createEmail()
          └─> emailLifecycleService.createEmail()
              ├─> queuePostSaveJobs()
              │   ├─> GENERATE_SUMMARY job queued
              │   │   └─> collectSummaryJobsToProcess()
              │   │       └─> ❌ Finds sibling with summary → copies stale summary, SKIPS
              │   └─> queueBatchPriorityRefinement()
              │       ├─> If single email → REFINE_PRIORITY job
              │       │   └─> handleRefinePriorityJob()
              │       │       ├─> shouldSkipPriorityRecalculation() → hasNewEmails=true → DON'T SKIP
              │       │       └─> tryIncrementalAnalysis() → ✅ Updates summary + priority
              │       └─> If batch (≥5) → REFINE_PRIORITY_BATCH job
              │           └─> handleRefinePriorityBatchJob()
              │               └─> ❌ No incremental summary update
```

**Net result:** For single new emails, the priority path's incremental analysis saves the day — BUT the summary generation path has already copied the stale summary first, and the incremental update overwrites it. For batch syncs (≥5 emails at once), neither path updates the summary.

## Proposed Fix

### Fix 1: Make `GENERATE_SUMMARY` job trigger incremental re-summarization

In `collectSummaryJobsToProcess()`, when a sibling email already has a summary AND the current email is newer than the most recent summary update:

```typescript
// Instead of just copying the stale summary, check if this is a NEW email
const isNewerThanSummary = email.receivedAt > (emailWithSummary.updatedAt ?? emailWithSummary.createdAt);

if (emailWithSummary?.summary && emailWithSummary.summary.trim() !== "" && isNewerThanSummary) {
  // Queue incremental summary update instead of just copying
  jobsToProcess.push({ job, userId, emailId, email, incrementalUpdate: true, existingSummary: emailWithSummary.summary });
} else if (emailWithSummary?.summary && emailWithSummary.summary.trim() !== "") {
  // Older email in thread — safe to copy existing summary
  await this.emailRepository.update({ id: emailId }, {
    summary: emailWithSummary.summary,
    isProcessingSummary: false,
  });
  skipCount.alreadyHasSummary++;
  continue;
}
```

Then in the summary processing pipeline, handle `incrementalUpdate` jobs by calling `IncrementalAnalysisService.updateSummaryIncrementally()` instead of full summarization.

### Fix 2: Add incremental summary update to batch priority path

In `runBatchRefinement()`, after `applyBatchResults()`, iterate through processed emails and call `updateSummaryIncrementally()` for those whose threads have new emails since last summary.

### Fix 3: Act on `categoryMightChange` flag

In `tryIncrementalAnalysis()`, when `incrementalResult.categoryMightChange` is true, trigger a full priority recalculation (return `{ handled: false }`) so the category gets re-evaluated.

### Fix 4: Thread-level summary tracking

Add `lastSummarizedAt` timestamp to `EmailThread` entity to track when the thread was last summarized. Use this to efficiently detect stale summaries:
- Set after any successful summary generation/update
- Compare with newest email's `receivedAt` to detect staleness

## Files to Modify

1. **`server/src/emails/llm-processor.ts`**
   - `collectSummaryJobsToProcess()` — detect new-email-in-thread and queue incremental update
   - `runBatchRefinement()` — add incremental summary update after batch priority
   - `tryIncrementalAnalysis()` — handle `categoryMightChange`

2. **`server/src/database/entities/email-thread.entity.ts`**
   - Add `lastSummarizedAt: Date | null` column

3. **`server/src/emails/email-thread.service.ts`**
   - Update `lastSummarizedAt` after summary generation

4. **Migration file** — add `lastSummarizedAt` column to `email_thread` table

## Testing Strategy

1. **Unit test:** `collectSummaryJobsToProcess` — verify new email in summarized thread triggers incremental update, not stale copy
2. **Unit test:** Batch priority path — verify summary is updated for threads with new emails
3. **Unit test:** `categoryMightChange=true` triggers full recalc
4. **Integration test:** End-to-end: sync new email in existing thread → verify summary, priority, and category are all updated

## Risk Assessment

- **Low risk:** Fix 3 (categoryMightChange) — small conditional change
- **Medium risk:** Fix 1 (summary job) — core summarization path, needs careful testing
- **Medium risk:** Fix 2 (batch priority) — adds processing to batch path, could affect throughput
- **Low risk:** Fix 4 (lastSummarizedAt) — additive schema change

## Priority

**P1** — This is a core data quality issue. Users are seeing stale summaries and potentially wrong categories for their email threads, which directly impacts inbox triage accuracy.
