# Plan: fix(#1576) — Initial context analysis still really slow

**Issue:** #1576 — "Initial context analysis still really slow"
**Author:** Monk of Modularity 🧘
**Date:** 2026-04-07

---

## Background

PR #1577 moved batch analysis from PgBoss (sequential on ECS) to SQS → Lambda (parallel). This dramatically sped up the **LLM analysis phase** (batches now run 30-way parallel instead of sequentially). However, the **orchestration phase** — everything that happens _before_ batches are dispatched to SQS — is still slow. This phase fetches thread IDs, full thread content, and sent emails from the Gmail API, all sequentially. For a user with 300+ threads, this orchestration alone can take 30-90 seconds before a single Lambda is invoked.

---

## Root Cause Analysis

### Current pipeline timeline (sequential)

```
POST /context/analyze
  └─ PgBoss: ANALYZE_CONTEXT job
       └─ Orchestrator.runAnalysisPipeline()
            ├─ [1] fetchAllThreadIds()                    ~3-8s
            │    ├─ getThreadIdsFromGmail() (general)      ~2-5s  (paginated, up to 300 IDs)
            │    └─ getSentThreadIds()                     ~1-3s  (paginated, up to 150 IDs)
            │
            ├─ [2] fetchSentEmailsContext()                ~5-15s
            │    └─ fetchSentThreadsFromProvider()          fetches 200 messages, filters to 100
            │        └─ searchEmails() + full body parse
            │
            ├─ [3] buildCurrentContextPrompt()             ~0.1-0.5s
            │
            ├─ [4] enqueueAnalysisBatches()                ~15-45s  ← BIGGEST BOTTLENECK
            │    └─ buildAndQueueBatchJobs()
            │         ├─ for each fetch-batch of 30 IDs:
            │         │    └─ fetchThreadsByIds()           ~3-8s per batch (sequential!)
            │         │         └─ for each sub-batch of 50:
            │         │              └─ Promise.all(gmail.threads.get × 50)
            │         └─ SQS dispatch (fast, ~1-2s total)
            │
            └─ [5] queueFinalizationJob()                  ~0.1s
                                                    TOTAL: ~25-70s before Lambda starts
```

### Key bottlenecks identified

1. **Sequential orchestration steps** — Steps [1], [2], [3] run one after another, but [2] and [3] don't depend on [1]'s results (except `threadIds.length` used for stats, easily decoupled).

2. **Full thread content fetched twice** — The orchestrator fetches full thread data in `enqueueAnalysisBatches()` → `fetchThreadsByIds()` (which calls `gmail.users.threads.get({format: 'full'})` for every thread). This data is serialized into the SQS message payload. With 300 threads at ~10KB each, that's ~3MB of Gmail API calls during orchestration.

3. **Sequential fetch-batches** — `buildAndQueueBatchJobs` processes fetch-batches of 30 thread IDs sequentially. With 300 threads, that's 10 sequential fetch rounds, each making 30 parallel Gmail API calls but waiting for all to complete before starting the next batch.

4. **Sent email over-fetching** — `fetchSentThreadsFromProvider()` fetches `limit * 2` (200) messages to filter down to 100. The extra 100 messages are discarded.

5. **Retry payload bloat** — `batchPayloadsForRetry` stores all pre-processed thread payloads in the analysis record's `stats` JSON column. For 300 threads this can be 1-3MB of JSON written to Postgres, slowing saves.

---

## Optimization Plan

### Phase 1: Parallelize orchestration steps (estimated savings: 5-15s)

**File: `server/src/context/context-analysis-orchestrator.service.ts`**

Steps [1], [2], and [3] in `runAnalysisPipeline()` are currently sequential. Parallelize them:

```typescript
// BEFORE (sequential):
const { threadIds } = await this.fetchAllThreadIds(...);
const { sentPayload, analysisStats } = await this.fetchSentEmailsContext(...);
const currentContextForPrompt = await this.buildCurrentContextPrompt(userId);

// AFTER (parallel):
const [threadIdResult, sentResult, currentContextForPrompt] = await Promise.all([
  this.fetchAllThreadIds(userId, analysisRecord, twelveDaysAgo, fiveDaysAgo),
  this.fetchSentEmailsContextEarly(userId, userEmail),  // no longer needs threadIds.length
  this.buildCurrentContextPrompt(userId),
]);
const { threadIds } = threadIdResult;
const { sentPayload } = sentResult;
// Set totalThreads in analysisStats after threadIds are known
const analysisStats = { ...sentResult.analysisStats, totalThreads: threadIds.length };
```

**Changes:**

- `fetchSentEmailsContext()` currently takes `totalThreads` as a param, but only uses it to set `analysisStats.totalThreads`. Decouple this: set `totalThreads` after the parallel block.
- Wrap all three calls in `Promise.all()`.
- This overlaps Gmail thread-ID pagination with sent-email fetching and DB context query.

### Phase 2: Parallelize thread content fetching (estimated savings: 10-30s)

**File: `server/src/context/context-enqueue.service.ts`**

Currently `buildAndQueueBatchJobs` processes fetch-batches of 30 **sequentially**:

```typescript
for (let start = 0; start < threadIds.length; start += fetchBatchSize) {
  const fetchedThreads = await this.gmailDataService.fetchThreadsByIds(
    userId,
    batchIds,
  );
  // ... process into analysis batches
}
```

With 300 threads and fetchBatchSize=30, this is 10 sequential rounds. Each round makes 30 parallel Gmail API calls (via `fetchThreadsByIds` which uses `Promise.all` internally with batch size 50), but rounds are sequential.

**Option A (recommended): Increase fetch parallelism**

Fetch all thread content in one parallel pass before batching:

```typescript
// Fetch ALL threads in parallel (fetchThreadsByIds already uses Promise.all internally)
const allThreads = await this.gmailDataService.fetchThreadsByIds(
  userId,
  threadIds,
);
// Then batch the already-fetched threads for SQS dispatch
const processedBatches = this.batchPayloadService.buildBatchPayloads(
  allThreads,
  userEmail,
  analysisBatchSize,
);
```

`fetchThreadsByIds` already parallelizes internally in sub-batches of 50. For 300 threads, this becomes 6 parallel sub-batches of 50 instead of 10 sequential rounds of 30. More importantly, **all 300 threads are fetched in a single pass** (~3-8s) rather than 10 sequential passes (~30-80s).

**Risk:** Gmail API rate limits. The existing 50-concurrent cap in `fetchThreadsByIds` already respects this. We're not increasing per-batch parallelism, just removing the artificial sequential rounds in the enqueue service.

**Option B (if rate limits are a concern): Concurrent fetch rounds with controlled concurrency**

Use a concurrency limiter (e.g., `p-limit`) to fetch 3-4 rounds simultaneously instead of all at once:

```typescript
import pLimit from "p-limit";
const limit = pLimit(3); // 3 concurrent fetch rounds
const fetchPromises = [];
for (let start = 0; start < threadIds.length; start += fetchBatchSize) {
  const batchIds = threadIds.slice(start, start + fetchBatchSize);
  fetchPromises.push(
    limit(() => this.gmailDataService.fetchThreadsByIds(userId, batchIds)),
  );
}
const allFetchedBatches = await Promise.all(fetchPromises);
```

### Phase 3: Reduce sent-email over-fetching (estimated savings: 2-5s)

**File: `server/src/context/context-gmail-data.service.ts`**

`fetchSentThreadsFromProvider()` fetches `limit * 2` messages (200 for a limit of 100) then filters by date and slices. This wastes bandwidth.

**Change:** For Gmail, use the optimized sent-thread-ID pagination (already exists as `fetchGmailSentThreadIds`) and then fetch full content only for the needed threads. For non-Gmail, keep the over-fetch as a safety margin but reduce multiplier from 2x to 1.5x.

```typescript
// Instead of fetching 200 messages and discarding 100:
const messages = await provider.searchEmails(userId, sentQuery, limit * 2);

// Fetch only what's needed (the date filter is already in the query):
const messages = await provider.searchEmails(userId, sentQuery, limit);
```

**Why this is safe:** The `sentQuery` already includes date range filters (`after:` / `before:`). The 2x multiplier was defensive against providers not respecting date queries, but Gmail's `q` parameter is reliable. Add a comment explaining the provider-specific trust level.

### Phase 4: Remove retry payload bloat from analysis record (estimated savings: 0.5-2s per save)

**File: `server/src/context/context-analysis-orchestrator.service.ts`**

The `persistBatchState` method stores `batchPayloadsForRetry` — a copy of **all pre-processed thread payloads** — in the analysis record's `stats` JSON column. For 300 threads at ~10KB each, this is ~3MB of JSON serialized to Postgres on every save.

**Change:** Remove `batchPayloadsForRetry` from the stats column. Lambda retries are handled by SQS DLQ — if a message fails, SQS automatically re-delivers it. The PgBoss fallback path (which used these payloads for retry) is dead code now that SQS → Lambda is the only path.

```typescript
// BEFORE:
analysisRecord.stats = {
  ...existingStats,
  totalBatches,
  batchJobIds,
  batchPayloadsForRetry, // 1-3MB of redundant data
};

// AFTER:
analysisRecord.stats = {
  ...existingStats,
  totalBatches,
  batchJobIds,
  // batchPayloadsForRetry removed — SQS DLQ handles retries
};
```

Also remove `batchPayloadsForRetry` initialization from `resetStatsForAnalysis` and the controller's `POST /context/analyze` handler.

### Phase 5: Reduce finalization delay (estimated savings: ~25s perceived time)

**File: `server/src/context/context-analysis-orchestrator.service.ts`**

The finalization job is currently queued with a **30-second delay**:

```typescript
const finalizationDelayMs = 30_000;
```

With Lambda processing batches in ~15-30s, this fixed delay means the user waits 30s after orchestration completes even if Lambda finishes in 10s.

**Change:** Reduce to 15 seconds, or better, use an event-driven approach where the finalization job polls for completion:

```typescript
// Option A: Reduce fixed delay
const finalizationDelayMs = 15_000;

// Option B (better): Queue immediately with a short initial delay,
// let the finalizer poll with backoff
const finalizationDelayMs = 5_000;
```

The finalization processor already handles the case where not all batches are complete (it checks `completedBatches < totalBatches`). A shorter delay with re-queue on incomplete is better than a long fixed delay.

---

## Files to Modify

| File                                                          | Change                                                                             | Phase      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| `server/src/context/context-analysis-orchestrator.service.ts` | Parallelize steps [1-3]; remove `batchPayloadsForRetry`; reduce finalization delay | P1, P4, P5 |
| `server/src/context/context-enqueue.service.ts`               | Single-pass thread fetch instead of sequential rounds                              | P2         |
| `server/src/context/context-gmail-data.service.ts`            | Reduce sent-email over-fetch multiplier                                            | P3         |
| `server/src/context/context.controller.ts`                    | Remove `batchPayloadsForRetry` from initial stats                                  | P4         |

---

## Expected Impact

| Phase                                | Estimated Time Saved | Risk                                                                 |
| ------------------------------------ | -------------------- | -------------------------------------------------------------------- |
| Phase 1: Parallelize orchestration   | 5-15s                | Low — independent operations                                         |
| Phase 2: Parallelize thread fetching | 10-30s               | Medium — Gmail rate limits (mitigated by existing 50-concurrent cap) |
| Phase 3: Reduce over-fetching        | 2-5s                 | Low — query already includes date filter                             |
| Phase 4: Remove payload bloat        | 0.5-2s per DB save   | Low — SQS DLQ handles retries                                        |
| Phase 5: Reduce finalization delay   | ~15-25s perceived    | Low — finalizer already handles incomplete batches                   |
| **Total**                            | **~30-75s**          |                                                                      |

Current total orchestration time: ~25-70s. Expected after optimization: ~5-15s.

---

## Testing

1. **Unit tests:** Verify `fetchSentEmailsContext` works without `totalThreads` param
2. **Integration test:** Trigger context analysis, verify all batches dispatched correctly
3. **Performance:** Measure orchestration phase time before/after (CloudWatch metric `JOB_ANALYZE_CONTEXT` already tracks this)
4. **Rate limit monitoring:** Watch for Gmail API 429 errors after Phase 2 changes
5. **Regression:** Verify batch retry via SQS DLQ still works after removing `batchPayloadsForRetry`

---

## Risk Assessment

- **Gmail API rate limits** (Phase 2): The existing 50-concurrent cap in `fetchThreadsByIds` is well within Gmail's per-user quota (250 requests/second). Removing sequential rounds doesn't increase peak concurrency, just removes idle time between rounds.
- **Data loss on retry** (Phase 4): SQS messages contain the full batch payload. DLQ re-delivers the same message body. No data loss possible.
- **Finalization timing** (Phase 5): The finalizer already handles incomplete batches gracefully. A shorter delay only means it may need to re-queue once, which is better than always waiting 30s.
