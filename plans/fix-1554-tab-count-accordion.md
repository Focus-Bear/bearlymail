# Plan: Fix #1554 — Tab Count Mismatch in Action Mode

## Problem

The inbox summary tab counts (shown in the accordion headers) don't match the
actual number of visible emails. A user sees **30** in the tab count but only
**7** emails render.

## Root Cause

`getInboxSummary()` and `runInboxQuery()` (called by `getInbox()`) use
**different SQL** to determine the "latest email" per thread, which causes them
to disagree on which threads are visible.

### `getInboxSummary()` — lateral join (line ~100)

```sql
LEFT JOIN LATERAL (
  SELECT em."from" AS "latestFrom" FROM emails em
  WHERE em."emailThreadId" = thread.id
  ORDER BY em."receivedAt" DESC LIMIT 1
) latest_email ON true
```

**Missing:** No `em."userId" = $1` filter.  
This picks the latest email across **all users** who share a thread row (e.g.
shared accounts, forwarded threads). In a multi-account setup this can return an
email belonging to a different user, so:

- The `from` address used by `shouldSkipSummaryRow()` is wrong.
- In action mode, threads that should be filtered out (user sent last) are kept,
  inflating the count.

### `runInboxQuery()` — lateral join (line ~310)

```sql
CROSS JOIN LATERAL (
  SELECT ... FROM emails em
  WHERE em."emailThreadId" = thread.id AND em."userId" = $1
  ORDER BY em."receivedAt" DESC, em.id DESC LIMIT 1
) e
```

**Correct:** Filters by `userId`, so only emails belonging to the current user
are considered. Threads where no email matches are excluded entirely by `CROSS
JOIN`.

### Same issue in `thread_labels` lateral join

`getInboxSummary()`:

```sql
LEFT JOIN LATERAL (
  SELECT array_agg(em.labels) AS "allLabels" FROM emails em
  WHERE em."emailThreadId" = thread.id AND em.labels IS NOT NULL
) thread_labels ON true
```

`runInboxQuery()`:

```sql
LEFT JOIN LATERAL (
  SELECT array_agg(em.labels) AS "allThreadLabels" FROM emails em
  WHERE em."emailThreadId" = thread.id AND em.labels IS NOT NULL
) thread_labels ON true
```

Both lack `userId` filter here, but because blocked-mode label checks use
thread-level labels this is less impactful. Still worth aligning for
consistency.

### Effect

| Path              | userId filter | Join type  | Result                                                                    |
| ----------------- | ------------- | ---------- | ------------------------------------------------------------------------- |
| `getInboxSummary` | ❌ missing    | LEFT JOIN  | Over-counts — includes threads whose latest email belongs to another user |
| `runInboxQuery`   | ✅ present    | CROSS JOIN | Correct — only user's emails, excludes empty threads                      |

The summary returns 30 threads but `getInbox` returns 7 because 23 threads are
filtered out by the stricter userId-scoped query + post-query action-mode
filters.

## Fix Plan

### Step 1: Add `userId` filter to summary lateral joins

In `getInboxSummary()`, change the `latest_email` lateral join to:

```sql
LEFT JOIN LATERAL (
  SELECT em."from" AS "latestFrom" FROM emails em
  WHERE em."emailThreadId" = thread.id AND em."userId" = $1
  ORDER BY em."receivedAt" DESC LIMIT 1
) latest_email ON true
```

This aligns it with `runInboxQuery()`.

### Step 2: Consider upgrading to CROSS JOIN LATERAL

The summary currently uses `LEFT JOIN LATERAL`, which means threads with **no**
emails for this user still appear (with `latestFrom = NULL`). Using `CROSS JOIN
LATERAL` (like `runInboxQuery`) would automatically exclude those ghost threads
from the count.

However, changing to CROSS JOIN would alter the count semantics — threads with
no user-owned emails would disappear from the summary entirely. This is actually
**desired behaviour** (we shouldn't count threads we can't show), but should be
validated:

- If we keep LEFT JOIN: threads with no user emails get `latestFrom = NULL`,
  `shouldSkipSummaryRow` won't skip them (no blocked check triggers), and
  they'll be counted. This inflates counts.
- If we switch to CROSS JOIN: only threads with at least one user email are
  counted, matching `getInbox` exactly.

**Recommendation:** Switch to CROSS JOIN LATERAL for `latest_email` to match
`runInboxQuery`.

### Step 3: Align `thread_labels` lateral join (optional, low risk)

Add `em."userId" = $1` to the `thread_labels` lateral join in
`getInboxSummary()` for consistency. This only matters for blocked mode where
label checks gate visibility, but keeps the two queries aligned.

### Step 4: Extract shared SQL builder (stretch goal)

Both methods build nearly identical WHERE clauses (batched, snoozed, thread
filter, etc). Extract a shared helper to prevent future drift. This is a larger
refactor and can be a follow-up PR.

## Files to Modify

1. **`server/src/emails/email-inbox.service.ts`**
   - `getInboxSummary()` method — update lateral join SQL (lines ~100-105)
   - Add `AND em."userId" = $1` to `latest_email` subquery
   - Optionally change `LEFT JOIN LATERAL` → `CROSS JOIN LATERAL`
   - Optionally add `em."userId" = $1` to `thread_labels` subquery

## Testing

- **Unit test:** Mock `emailThreadRepository.query()` to verify the generated
  SQL includes `em."userId" = $1` in both lateral joins.
- **Integration test:** Seed threads where some emails belong to a different
  userId. Verify `getInboxSummary` count matches `getInbox` results for action
  mode.
- **Manual QA:** Check action mode tab shows count matching visible emails.

## Risk Assessment

- **Low risk.** The fix adds a WHERE clause filter that makes summary match the
  existing (correct) inbox query behaviour.
- No schema changes, no new dependencies, no API contract changes.
- The count will decrease for affected users (now accurate), which is the
  desired fix.

---

_Planned by Monk of Modularity 🧘 — 2026-03-30_
_Closes #1554_
