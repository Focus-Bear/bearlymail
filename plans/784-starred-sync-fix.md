# Plan: Fix Starred Thread Sync — #784

**Issue**: [#784 — Starred Sync Check Results: No stale unsynced threads found / All Starred Threads in DB (0)](https://github.com/Focus-Bear/BearlyMail/issues/784)

---

## Root Cause

### PRIMARY — Client/Server response shape mismatch (debug UI reads wrong fields)

The `debugStarredThreads` API endpoint was **refactored** to a new response format in the same body of work that introduced `b2189bf8` but the **client-side types and UI components were never updated** to match.

**Old server response (what clients still expect via `DebugStarredData` in `types.ts`):**
```ts
{
  gmail: { starredThreadCount, starredThreadIds, error? },
  database: { starredThreadCount, starredEmailCount },
  actionTabResults: number,
  comparison: { inGmailNotInDb, inDbNotInGmail, inDbButArchived },
  starredThreads: [{ threadId, starCount, isArchived, isSnoozed, emailCount, latestSubject, latestFrom, issues, inGmail, syncStatus }],
  missingFromProcessTab: [...],
  gmailVisibilityChecks: [...],
  staleUnsyncedThreads: [...]
}
```

**New server response (what `EmailDebugService.debugStarredThreads()` actually returns at HEAD):**
```ts
{
  gmailError?: string,
  summary: { gmailStarredCount, foundInDb, notInDb, inActionOrFollowUp, starredInDbButHidden, notStarredInDb },
  threads: [{ threadId, subject, inDb, isStarredInDb, category, appearsInActionOrFollowUp, reason }]
}
```

This causes every starred debug field to be `undefined` at runtime:

| What Jeremy sees | Why |
|---|---|
| "All Starred Threads in DB (0)" | `StarredThreadsList` receives `debugStarredData.starredThreads ?? []` → `undefined ?? [] = []` → 0 items |
| "No stale unsynced threads found" | `debugStarredData.staleUnsyncedThreads?.length` → `undefined?.length` → falsy → fallback text |
| StarredComparisonGrid missing | `debugStarredData.gmail && debugStarredData.database` → both undefined → component skipped |
| Popup shows nothing useful | `gmailVisibilityChecks`, `comparison`, `gmail` all undefined |

**Key files with the mismatch:**
- `client/src/components/inbox/debug/types.ts` — `DebugStarredData` interface (old shape)
- `client/src/components/inbox/debug/StarredThreadsList.tsx` — reads `threads.starCount`, `threads.isSnoozed`, etc. (old thread shape)
- `client/src/components/inbox/debug/StarredComparisonGrid.tsx` — reads `gmail.starredThreadCount`, `database.starredThreadCount`
- `client/src/components/inbox/debug/DebugStarredSection.tsx` — reads `gmail`, `gmailVisibilityChecks`, `staleUnsyncedThreads`
- `client/src/components/inbox/debug/ComparisonResultsGrid.tsx` — reads `comparison.inGmailNotInDb`, etc.
- `server/src/emails/emails.service.ts` — TypeScript return type annotation updated to new shape BUT `email-debug.service.ts` actual runtime already returns the new shape (they are consistent server-side)

### SECONDARY — `staleUnsyncedThreads` no longer in response

The new `debugStarredThreads()` implementation removed `staleUnsyncedThreads` from the response. The "Fix Stale Unsynced Threads" button in the debug popup relies on this data existing.

### NOT a sync data bug (the sync itself is correct)

After tracing the full sync flow:
- Regular 5-min sync (`schedule-email-fetch-jobs`) includes `starredQuery = "is:starred in:inbox {baseQuery}"` with date filter
- Extended 2-hour sync (`fetch-user-emails-extended`) includes the same starred query WITHOUT date filter (all history)
- `processThreadBatches` correctly computes `starCount = isThreadStarred(messages) ? 3 : 0` via `isThreadStarred()` which checks all messages, not just the latest
- `syncThreadArchivedStatus()` re-evaluates ALL DB threads' starred status against Gmail on every sync
- `batchUpdateThreadStarCount` correctly UPDATEs starCount on existing threads

The data pipeline is sound. The problem is that Jeremy cannot SEE the actual state because the debug UI is reading undefined fields.

---

## Fix Plan

### Part 1 — Update client-side types to match new API format

**File: `client/src/components/inbox/debug/types.ts`**

Replace `DebugStarredData` interface with the new shape:

```ts
export interface DebugStarredData {
  // Optional Gmail error (e.g. auth expired)
  gmailError?: string;
  // Aggregate counts
  summary: {
    gmailStarredCount: number;      // threads matching "is:starred in:inbox" in Gmail
    foundInDb: number;              // how many of those are in our DB
    notInDb: number;                // how many are missing from DB
    inActionOrFollowUp: number;     // how many appear in Action/Follow-up tab
    starredInDbButHidden: number;   // in DB with starCount>0 but blocked/snoozed/batched
    notStarredInDb: number;         // in DB but starCount=0
  };
  // Per-thread breakdown
  threads: Array<{
    threadId: string;
    subject: string | null;
    inDb: boolean;
    isStarredInDb: boolean;
    category: string | null;
    appearsInActionOrFollowUp: boolean;
    reason: string;                 // human-readable reason code (see EmailDebugService)
  }>;
  // Stale unsynced threads (added back by server — see Part 2)
  staleUnsyncedThreads?: Array<{
    threadId: string;
    syncStatusUpdatedAt: string | null;
    minutesUnsynced: number;
    isArchived: boolean;
    starCount: number;
  }>;
}
```

### Part 2 — Re-add `staleUnsyncedThreads` to server response

The fix-stale-unsynced button in the popup needs this data. Add it back to `EmailDebugService.debugStarredThreads()`.

**File: `server/src/emails/email-debug.service.ts`**

Inside `debugStarredThreads()`, after step 5 (compute summary), add:

```ts
// Step 6: stale unsynced threads (syncStatus='unsynced' for >5 min)
const fiveMinutesAgo = new Date(Date.now() - 5 * MILLISECONDS.MINUTE);
const staleUnsyncedEntities = await this.emailThreadRepository.find({
  where: { userId, syncStatus: 'unsynced' },
  select: ['threadId', 'syncStatusUpdatedAt', 'isArchived', 'starCount'],
});
const staleUnsyncedThreads = staleUnsyncedEntities
  .filter(t => t.syncStatusUpdatedAt && t.syncStatusUpdatedAt < fiveMinutesAgo)
  .map(t => ({
    threadId: t.threadId.substring(0, QUERY_LIMITS.THREAD_ID_PREVIEW) + '...',
    syncStatusUpdatedAt: t.syncStatusUpdatedAt?.toISOString() ?? null,
    minutesUnsynced: Math.floor(
      (Date.now() - new Date(t.syncStatusUpdatedAt || 0).getTime()) / MILLISECONDS.MINUTE,
    ),
    isArchived: t.isArchived,
    starCount: t.starCount,
  }));
```

Then add `staleUnsyncedThreads` to the return object.

Also update the TypeScript return type annotation to include `staleUnsyncedThreads`.

**File: `server/src/emails/emails.service.ts`**

Update the `debugStarredThreads()` return type to include `staleUnsyncedThreads?`.

### Part 3 — Update `StarredComparisonGrid` to use new format

**File: `client/src/components/inbox/debug/StarredComparisonGrid.tsx`**

Change props interface and bindings:

```ts
interface StarredComparisonGridProps {
  summary: {
    gmailStarredCount: number;
    foundInDb: number;
    notInDb: number;
    inActionOrFollowUp: number;
    starredInDbButHidden: number;
    notStarredInDb: number;
  };
  gmailError?: string;
}
```

Render:
- "Gmail" box: `summary.gmailStarredCount` starred threads (replace `gmail.starredThreadCount`)  
- "DB" box: `summary.foundInDb` in DB, `summary.notInDb` not in DB (replace `database.starredThreadCount`)
- Extra row: `summary.inActionOrFollowUp` in Action tab, `summary.notStarredInDb` in DB but not starred
- Show `gmailError` if present

Update the call site in `DebugStarredSection.tsx`:
```tsx
{debugStarredData.summary && (
  <StarredComparisonGrid
    summary={debugStarredData.summary}
    gmailError={debugStarredData.gmailError}
  />
)}
```

### Part 4 — Update `StarredThreadsList` to use new thread format

**File: `client/src/components/inbox/debug/StarredThreadsList.tsx`**

The new thread objects have a different shape. Update the component to render:
- `thread.threadId`
- `thread.subject` (replaces `latestSubject`)
- `thread.inDb` (boolean — was implicit via presence in array)
- `thread.isStarredInDb` (replaces `starCount > 0`)
- `thread.appearsInActionOrFollowUp` (replaces `inGmail` + issue detection)
- `thread.reason` (replaces `issues[]` — the reason code is now a single descriptive string)
- `thread.category`

The summary line should now read: `All Gmail Starred Threads ({threads?.length ?? 0})` since the new API shows threads from Gmail's perspective (not just DB-starred ones).

Background colour logic: green if `appearsInActionOrFollowUp`, red if `!inDb`, orange if `inDb && !isStarredInDb`.

### Part 5 — Update `DebugStarredSection` popup

**File: `client/src/components/inbox/debug/DebugStarredSection.tsx`**

1. Replace `gmailVisibilityChecks` section (removed from new API) with the per-thread `reason` codes from `threads[]`
2. Update "Starred Sync Check Results" header to show `summary.gmailStarredCount` (via `debugStarredData.summary?.gmailStarredCount`)
3. Keep `staleUnsyncedThreads` section — it will now come from the re-added field
4. The "Fix Stale Unsynced Threads" button calls `/emails/debug/fix-stale-unsynced` — no change needed

### Part 6 — Remove or update `ComparisonResultsGrid`

**File: `client/src/components/inbox/debug/ComparisonResultsGrid.tsx`**

The new API no longer returns a `comparison` object with `inGmailNotInDb` / `inDbNotInGmail` arrays. Options:
- **Option A (recommended)**: Remove `ComparisonResultsGrid` entirely; the same info is now in `summary.notInDb` and `summary.inActionOrFollowUp`
- **Option B**: Keep it but derive the data from `threads[]`: `inGmailNotInDb = threads.filter(t => !t.inDb).map(t => t.threadId)`

Use Option B to preserve UI surface while eliminating the removed `comparison` field:
```tsx
const inGmailNotInDb = (debugStarredData.threads ?? [])
  .filter(t => !t.inDb)
  .map(t => t.threadId);
const inDbNotInGmail: string[] = []; // Not available in new API; omit
```

Update `DebugStarredSection.tsx` call site to pass derived values instead of `debugStarredData.comparison`.

---

## Files to Change

### Server
| File | Change |
|---|---|
| `server/src/emails/email-debug.service.ts` | Add `staleUnsyncedThreads` to return value and TypeScript type |
| `server/src/emails/emails.service.ts` | Update `debugStarredThreads` return type to include `staleUnsyncedThreads?` |

### Client
| File | Change |
|---|---|
| `client/src/components/inbox/debug/types.ts` | Replace `DebugStarredData` with new shape |
| `client/src/components/inbox/debug/StarredComparisonGrid.tsx` | Use `summary` instead of `gmail`/`database` |
| `client/src/components/inbox/debug/StarredThreadsList.tsx` | Use new thread fields (`reason`, `isStarredInDb`, `appearsInActionOrFollowUp`) |
| `client/src/components/inbox/debug/DebugStarredSection.tsx` | Update popup, remove `gmailVisibilityChecks` section, use `summary` |
| `client/src/components/inbox/debug/ComparisonResultsGrid.tsx` | Derive `inGmailNotInDb` from `threads[]` instead of `comparison` field |

---

## What Codebeard Should NOT Change

- `email-sync.processor.ts` — scheduler/worker logic is correct
- `gmail.provider.ts` `performSync()` flow — starred thread fetching is correct
- `gmail-sync.ts` `isThreadStarred()` — logic is correct (checks all messages)
- `email-thread.service.ts` `batchUpdateThreadStarCount()` — works correctly
- `email-thread.service.ts` `getOrCreateEmailThread()` — star preservation logic is intentional

---

## Testing

After the fix, clicking "Check starred sync" should show:
- A grid with **Gmail starred count** (real number, not 0)
- **DB starred count** showing how many are synced
- **`notInDb` count** showing how many Gmail starred threads haven't been synced yet (these need a manual sync trigger or will be caught in the next 2-hour extended sync)
- Thread-level `reason` strings explaining visibility status for each

If `notInDb` is high after a sync, investigate whether `syncThreadArchivedStatus()` is running correctly and whether the starred threads are outside the 2-hour sync window.
