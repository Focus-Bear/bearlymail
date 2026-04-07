# Plan: Fix priority filter count mismatch and premature inbox-zero (#1052)

## Problem

When a user selects a priority bucket filter (e.g. "Medium"), two bugs manifest:

1. **Badge count mismatch** — the priority badge shows "3 medium priority emails" but the filtered inbox view shows fewer or zero threads.
2. **Premature inbox-zero** — when the filtered view returns 0 threads, the inbox-zero / empty state fires even though `priorityCounts` says threads exist at that tier.

## Root Cause Analysis

### Bug 1: Boundary mismatch between count query and filter query

The `getPriorityCounts` SQL in `email-status.service.ts` (line ~190) uses **exclusive lower / inclusive upper** boundaries:

```sql
-- Medium bucket in getPriorityCounts:
COUNT(*) FILTER (WHERE "priorityScore" > 15 AND "priorityScore" <= 30) AS medium
```

But the inbox fetch filter in `email-inbox-query.helpers.ts` (`appendInboxAdditionalFilters`, line ~51) and `email-inbox.types.ts` (`buildSummaryFiltersAndParams`, line ~170) uses **inclusive lower / exclusive upper** boundaries:

```sql
-- Medium filter in inbox query (min=15, max=30):
AND COALESCE(thread."priorityScore", 0) >= 15
AND COALESCE(thread."priorityScore", 0) < 30
```

| Score | Counted as (getPriorityCounts) | Fetched by Medium filter (inbox query) |
|-------|-------------------------------|---------------------------------------|
| 15    | Low (`>= 0 AND <= 15`)       | ✅ Yes (`>= 15`)                      |
| 16    | Medium (`> 15 AND <= 30`)     | ✅ Yes                                 |
| 30    | Medium (`> 15 AND <= 30`)     | ❌ No (`< 30` excludes it)            |
| 31    | High (`> 30 AND <= 50`)       | ❌ No                                  |

A thread with `priorityScore = 30` is counted in the "Medium" bucket but displayed under the "High" filter. A thread with `priorityScore = 15` is counted in "Low" but fetched by "Medium". This means the count and the displayed list diverge.

### Bug 2: `EmailListStates` only receives `minPriority`, not `maxPriority`

In `Inbox.tsx` (line ~350), `EmailListStates` is passed:
```tsx
minPriority={filters.minPriority}
```

But `maxPriority` is never passed. The `EmailListStates` component uses `minPriority` alone to determine `hasActiveFilter` and to compute `computeTotalLowerPriority`. When a user selects a bounded range like "Medium" (min=15, max=30), the component thinks the filter is "everything ≥ 15" and miscomputes which tiers are "lower".

### Bug 3: `COALESCE(priorityScore, 0)` in filters vs `priorityScore IS NOT NULL` in counts

`getPriorityCounts` excludes NULL-priority threads from all buckets (explicit `IS NOT NULL` guards). But the inbox filter uses `COALESCE(thread."priorityScore", 0)`, which treats NULL as 0 — placing NULL-priority threads into the Low bucket filter (`>= 0 AND < 15`). This causes additional count/display drift for the "Low" bucket.

## Implementation Plan

### Step 1: Align boundary operators in `getPriorityCounts`

**File:** `server/src/emails/email-status.service.ts` (lines ~190-200)

Change the SQL boundaries to match the inclusive-lower / exclusive-upper convention used by the inbox query:

```sql
-- Before (current):
COUNT(*) FILTER (WHERE "priorityScore" IS NOT NULL AND "priorityScore" > 50) AS "veryHigh"
COUNT(*) FILTER (WHERE "priorityScore" IS NOT NULL AND "priorityScore" > 30 AND "priorityScore" <= 50) AS high
COUNT(*) FILTER (WHERE "priorityScore" IS NOT NULL AND "priorityScore" > 15 AND "priorityScore" <= 30) AS medium
COUNT(*) FILTER (WHERE "priorityScore" IS NOT NULL AND "priorityScore" >= 0 AND "priorityScore" <= 15) AS low
COUNT(*) FILTER (WHERE "priorityScore" IS NOT NULL AND "priorityScore" < 0) AS "veryLow"

-- After (aligned with inbox filter >= min AND < max):
COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) >= 50) AS "veryHigh"
COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) >= 30 AND COALESCE("priorityScore", 0) < 50) AS high
COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) >= 15 AND COALESCE("priorityScore", 0) < 30) AS medium
COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) >= 0 AND COALESCE("priorityScore", 0) < 15) AS low
COUNT(*) FILTER (WHERE COALESCE("priorityScore", 0) < 0) AS "veryLow"
```

Key changes:
- Use `COALESCE("priorityScore", 0)` to match how the inbox filter treats NULLs.
- Use `>=` lower bound and `<` upper bound (half-open intervals) matching `appendInboxAdditionalFilters`.
- Remove the separate `unprioritised` count (NULL threads are now folded into the appropriate bucket via COALESCE) — OR keep `unprioritised` as a separate informational count but make it clear it's not part of the filterable buckets.

**Alternative approach (if we want to keep NULL as separate):** Instead of changing the count query, change the inbox filter to use `IS NOT NULL AND > min AND <= max`. This is a bigger change and touches more queries. The COALESCE approach is simpler and consistent.

### Step 2: Align `buildSummaryFiltersAndParams` boundary values

**File:** `server/src/emails/email-inbox.types.ts` (lines ~153-168)

Verify that `buildSummaryFiltersAndParams` already uses `>= min` and `< max`. It does — no change needed here. But double-check the bucket definitions sent from the client match:

**File:** `client/src/constants/priorityBuckets.ts`

The `PRIORITY_BUCKET_DEFS` define:
- Medium: `{ min: 15, max: 30 }` → sent as `minPriority=15, maxPriority=30`
- Server applies: `>= 15 AND < 30`

After Step 1, counts will use the same boundaries. ✅

### Step 3: Pass `maxPriority` to `EmailListStates`

**File:** `client/src/pages/Inbox.tsx` (line ~350)

```tsx
// Before:
minPriority={filters.minPriority}

// After:
minPriority={filters.minPriority}
maxPriority={filters.maxPriority}
```

**File:** `client/src/components/inbox/InboxContent.tsx`

Add `maxPriority` to the props interface and pass it through to `InboxEmailListPanel` → `EmailListStates`.

**File:** `client/src/components/inbox/EmailListStates.tsx`

1. Add `maxPriority?: number | null` to `EmailListStatesProps`.
2. Update `hasActiveFilter` check: `const hasActiveFilter = (minPriority !== null && minPriority !== undefined) || (maxPriority !== null && maxPriority !== undefined)`.
3. Update `computeTotalLowerPriority` to account for both `minPriority` and `maxPriority` — when a bounded range is active, "lower" means tiers whose range is entirely below the current filter's `minPriority`.
4. Update `getCurrentTierLabel` to handle bounded ranges (e.g. "Medium" not just "≥ Medium").

### Step 4: Update `priorityBuckets.ts` comments for clarity

**File:** `client/src/constants/priorityBuckets.ts`

Update the header comment to explicitly document that boundaries use half-open intervals `[min, max)`:
```
 *   Very High:  >= 50         → min: 50, max: null
 *   High:       >= 30, < 50   → min: 30, max: 50
 *   Medium:     >= 15, < 30   → min: 15, max: 30
 *   Low:        >= 0,  < 15   → min: 0,  max: 15
 *   Very Low:   < 0           → min: null, max: 0
```

### Step 5: Update `usePriorityCounts` interface comment

**File:** `client/src/hooks/usePriorityCounts.ts`

Update the `PriorityCounts` interface comments to match the new boundaries:
```typescript
/** Threads with COALESCE(priorityScore, 0) >= 50 */
veryHigh: number;
/** Threads with COALESCE(priorityScore, 0) >= 30 and < 50 */
high: number;
// etc.
```

### Step 6: Update tests

**Files to update:**
- `server/src/emails/emails-priority-inbox.service.spec.ts` — update boundary assertions for the count query changes.
- `client/src/components/inbox/EmailListStates.test.tsx` — add `maxPriority` prop to existing test cases; add new test cases for bounded range filters.
- `client/src/hooks/usePriorityCounts.test.ts` — verify count interface comments match.
- `client/src/components/inbox/inboxContentParts.helpers.test.ts` — no changes needed (orthogonal).

### Step 7: Add regression test for boundary scores

**File:** `server/src/emails/email-status.service.spec.ts` (new or existing)

Add a test that verifies: for every priority bucket boundary score (0, 15, 30, 50), the count query and the inbox filter query agree on which bucket the thread belongs to.

## Files Changed (Summary)

| File | Change |
|------|--------|
| `server/src/emails/email-status.service.ts` | Align count SQL boundaries to `[min, max)` with COALESCE |
| `client/src/pages/Inbox.tsx` | Pass `maxPriority` to `InboxContent` |
| `client/src/components/inbox/InboxContent.tsx` | Thread `maxPriority` through props |
| `client/src/components/inbox/InboxContentParts.tsx` | Thread `maxPriority` through to EmailListStates |
| `client/src/components/inbox/EmailListStates.tsx` | Accept `maxPriority`, fix `hasActiveFilter` and lower-tier logic |
| `client/src/constants/priorityBuckets.ts` | Update comments to document `[min, max)` convention |
| `client/src/hooks/usePriorityCounts.ts` | Update interface comments |
| `server/src/emails/emails-priority-inbox.service.spec.ts` | Update boundary tests |
| `client/src/components/inbox/EmailListStates.test.tsx` | Add maxPriority test cases |

## Risk Assessment

- **Low risk:** Comment updates, prop threading.
- **Medium risk:** Changing the SQL boundary operators in `getPriorityCounts`. This will shift threads at exact boundary scores (15, 30, 50) between buckets. For most users the visible difference is ≤ a few threads. The key invariant is: **what the count says matches what the filter shows.**
- **Edge case:** Users who have stored filters with boundary-score threads may see a one-time shift in their bucket counts. No migration needed — the filter and count will simply agree now.

## Acceptance Criteria

1. Selecting "Medium" priority filter shows exactly the threads counted in the "Medium" badge.
2. Selecting any single priority bucket shows exactly `priorityCounts[bucket]` threads.
3. When a bounded priority filter is active and returns 0 results, `FilteredEmptyState` or `ProgressiveUnlockPrompt` is shown — never the generic `EmptyState` or `AllCaughtUpState` (unless all lower tiers are genuinely empty).
4. The sum of all 5 bucket counts equals the total thread count for that inbox mode.
