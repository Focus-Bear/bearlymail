# Plan: #784 Phase 3 — Archive Status Trust Logic + Debug Accordion UI

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/784
> **Previous work:** PR #800 (debug UI shape fix — merged), PR #831 (error swallowing fix — merged)
> **This plan:** Addresses the updated requirements from the 2026-03-11 and 2026-03-14 issue comments

---

## Overview

Two changes needed:

1. **Archive status trust logic** — Always trust Gmail as source of truth for archive status, only use BearlyMail local state when there are unsynced changes pending. Surface discrepancies clearly in the debug UI.
2. **Debug view UI** — Replace the flat thread list with accordion groups: In Action, In Follow Up, Archived in BearlyMail (with unsynced flag), Missing in BearlyMail.

---

## Part 1: Archive Status Trust Logic

### Current Architecture (Already Mostly Correct)

The codebase already implements a `syncStatus` mechanism:

| Component                         | What it does                                             | File                                                      |
| --------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `EmailThread.syncStatus`          | `"synced"` or `"unsynced"` column on the thread entity   | `server/src/database/entities/email-thread.entity.ts:199` |
| Archive action                    | Sets `isArchived=true, syncStatus="unsynced"` in DB      | `server/src/emails/emails.service.ts:2286`                |
| `archive-email-provider-sync` job | Syncs archive to Gmail, then marks `syncStatus="synced"` | `server/src/emails/archive-email.processor.ts:118`        |
| `syncThreadArchivedStatus`        | Only updates threads where `syncStatus === "synced"`     | `server/src/emails/providers/gmail.provider.ts:843`       |
| `batchUpdateThreadStatus`         | All update queries include `AND syncStatus = 'synced'`   | `server/src/emails/email-thread.service.ts:492`           |

**The safety mechanism exists.** Threads with `syncStatus="unsynced"` are NOT overwritten by Gmail sync. The bug Jeremy is seeing is likely caused by one of:

### Root Cause Investigation

**Hypothesis A: `fixStaleUnsyncedThreads` resets syncStatus too aggressively**

`fixStaleUnsyncedThreads()` in `email-debug.service.ts` marks ANY thread with `syncStatus="unsynced"` older than 5 minutes as `"synced"`. This is a blunt tool — if the `archive-email-provider-sync` job failed (e.g. Gmail rate limit, auth expiry), the thread stays `"unsynced"`. When someone clicks "Fix Stale Unsynced Threads," it marks them as `"synced"` — then the next Gmail sync sees INBOX label present and sets `isArchived=false`, overriding the user's intent. But that's the opposite of what Jeremy describes (threads showing as archived when they shouldn't be).

**Hypothesis B: Initial sync sets `isArchived` incorrectly**

In `gmail-sync.ts`, the initial per-thread fetch checks `latestMessage.labelIds`:

```typescript
isArchived: !latestLabelIds.includes("INBOX");
```

This is correct for Gmail. But `getOrCreateEmailThread()` may not clear `isArchived` when a thread reappears in the inbox (e.g. someone replies to an archived thread).

**Hypothesis C: No "was archived in BearlyMail vs Gmail" distinction in the data model**

The current model stores one `isArchived` boolean that gets written by BOTH user actions AND Gmail sync. There's no separate field to record "archived by user in BearlyMail" vs "archived according to Gmail." When the debug view shows "ARCHIVED," it can't tell whether that was a user action or a Gmail sync conclusion.

### Proposed Fix

#### Step 1: Add `gmailInboxStatus` field to the debug endpoint response

**File:** `server/src/emails/email-debug.service.ts`

Enhance `debugStarredThreads()` to include Gmail's actual inbox status alongside BearlyMail's local status. The data is already being fetched in `syncThreadArchivedStatus` (the `inboxThreadIds` set), but the debug endpoint doesn't currently cross-reference it.

Add to each thread in the response:

```typescript
{
  // Existing fields...
  threadId: string;
  inDb: boolean;
  isStarredInDb: boolean;
  // NEW fields:
  isArchivedInDb: boolean; // BearlyMail's local isArchived flag
  isInGmailInbox: boolean; // Whether Gmail considers this thread in INBOX
  syncStatus: "synced" | "unsynced"; // Current sync status
  hasUnsyncedChanges: boolean; // syncStatus === 'unsynced'
  archiveStatusConflict: boolean; // isArchivedInDb !== !isInGmailInbox AND syncStatus === 'synced'
}
```

Implementation: The debug endpoint already calls `gmailProvider.getStarredInboxThreadIds()`. Add a parallel call to fetch ALL inbox thread IDs (not just starred). Use the existing `fetchAllThreadsWithPagination` with query `"in:inbox"`:

```typescript
const [gmailStarredThreadIds, gmailInboxThreadIds] = await Promise.all([
  this.gmailProvider.getStarredInboxThreadIds(userId),
  this.gmailProvider.getInboxThreadIds(userId), // NEW method — see Step 2
]);
const gmailInboxSet = new Set(gmailInboxThreadIds);
```

Then for each thread, compute:

```typescript
isInGmailInbox: gmailInboxSet.has(thread.threadId),
archiveStatusConflict: thread.isArchived && gmailInboxSet.has(thread.threadId) && thread.syncStatus === 'synced',
```

**Caveat:** Fetching ALL inbox thread IDs could be expensive (thousands of threads). Consider adding a dedicated method that only checks inbox status for the specific starred threads, using `gmail.users.threads.get()` per thread (already done in `syncThreadArchivedStatus`). OR reuse the `inboxThreadIds` already computed by `syncThreadArchivedStatus` by caching/passing them.

#### Step 2: Add `getInboxThreadIds()` to GmailProvider

**File:** `server/src/emails/providers/gmail.provider.ts`

Add a lightweight method (mirrors `getStarredInboxThreadIds`):

```typescript
async getInboxThreadIds(userId: string): Promise<string[]> {
  const gmail = await this.createGmailClient(userId);
  if (!gmail) return [];
  return this.fetchAllThreadsWithPagination(
    gmail,
    "in:inbox -label:SnoozedBearlyMail -label:VA-to-action",
    QUERY_LIMITS.INBOX_TOTAL
  );
}
```

Note: This is the same query used in `syncThreadArchivedStatus` line 821. Consider extracting it to avoid duplication.

#### Step 3: Auto-fix archive conflicts during sync

**File:** `server/src/emails/providers/gmail.provider.ts` — `syncThreadArchivedStatus()`

The current logic already handles this — it sets `isArchived = !inboxThreadIds.has(thread.threadId)` for all synced threads. If a thread is archived in BearlyMail but NOT archived in Gmail (still in inbox), and `syncStatus="synced"`, the sync will un-archive it.

**The key question is: does `syncThreadArchivedStatus` run frequently enough?** It runs during the 2-hour extended sync (`syncEmails` with `isExtendedSync=true`). If a thread was incorrectly marked archived, it could take up to 2 hours to self-correct.

**Proposed enhancement:** Also run archive status reconciliation during the 5-minute sync cycle, not just the 2-hour cycle. Currently `syncThreadArchivedStatus` is only called at line 623 inside `syncEmails`:

```typescript
// server/src/emails/providers/gmail.provider.ts, line 620-623
if (isExtendedSync) {
  // Only full archive/star status reconciliation on extended sync
  await this.syncThreadArchivedStatus(userId, gmail);
}
```

Change to ALWAYS run the archive status sync (or at least run a lightweight version during the 5-min sync that only checks the starred threads, since those are the ones most likely to cause confusion in the Action tab):

```typescript
// Always reconcile archive/star status for starred threads
await this.syncThreadArchivedStatus(userId, gmail);
```

**Performance consideration:** `syncThreadArchivedStatus` makes 2 Gmail API calls (inbox threads list + starred threads list). These are lightweight `threads.list` calls that only return IDs. Running them every 5 minutes is acceptable.

#### Step 4: Update `fixStaleUnsyncedThreads` to be smarter

**File:** `server/src/emails/email-debug.service.ts`

Instead of blindly marking stale unsynced threads as "synced," the fix button should:

1. For each stale unsynced thread, re-check Gmail's actual status
2. Update `isArchived` to match Gmail
3. THEN mark as `synced`

This prevents the scenario where a failed provider sync gets "fixed" by just resetting the flag, leaving the DB in a state that doesn't match Gmail.

```typescript
async fixStaleUnsyncedThreads(userId: string): Promise<{ fixed: number; threadIds: string[] }> {
  // ... find stale threads (existing code) ...

  // NEW: Fetch Gmail inbox status to reconcile before marking synced
  const gmailInboxIds = await this.gmailProvider.getInboxThreadIds(userId);
  const gmailInboxSet = new Set(gmailInboxIds);

  for (const thread of actuallyStale) {
    const shouldBeArchived = !gmailInboxSet.has(thread.threadId);
    await this.emailThreadRepository.update(
      { id: thread.id },
      { isArchived: shouldBeArchived, syncStatus: 'synced', syncStatusUpdatedAt: new Date() }
    );
  }
  // ...
}
```

---

## Part 2: Debug View UI — Accordion Groups

### Current UI

The `StarredThreadsList` component renders ALL threads in a single `<details>` (HTML accordion) with colour-coded backgrounds. The popup modal also renders a flat list.

### Proposed UI

Replace with four accordion groups, each showing count in the header:

| Group                      | Filter logic                                                                                                                  | Colour                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **In Action**              | `inDb && isStarredInDb && appearsInActionOrFollowUp`                                                                          | Green (`#D4EDDA`)                                                    |
| **In Follow Up**           | `inDb && isStarredInDb && !appearsInActionOrFollowUp && !isArchivedInDb` (visible but not in action — snoozed, batched, etc.) | Blue (`#E6F0FF`)                                                     |
| **Archived in BearlyMail** | `inDb && isArchivedInDb` — with ⚠️ flag if `archiveStatusConflict`                                                            | Yellow/Warning (`#FFF3CD`) for conflicts, Grey for expected archives |
| **Missing in BearlyMail**  | `!inDb`                                                                                                                       | Red (`#FFE6E6`)                                                      |

### Implementation

#### Step 1: Update `DebugStarredData` type

**File:** `client/src/components/inbox/debug/types.ts`

Add the new per-thread fields:

```typescript
threads: Array<{
  // ... existing fields ...
  // NEW:
  isArchivedInDb: boolean;
  isInGmailInbox: boolean;
  syncStatus: "synced" | "unsynced";
  hasUnsyncedChanges: boolean;
  archiveStatusConflict: boolean;
}>;
```

Add new summary fields:

```typescript
summary: {
  // ... existing ...
  // NEW:
  archivedInBearlyMail: number;
  archiveConflicts: number; // archived in BM but not in Gmail (syncStatus=synced)
}
```

#### Step 2: Create `AccordionGroup` component

**New file:** `client/src/components/inbox/debug/AccordionGroup.tsx`

A reusable collapsible section:

```tsx
interface AccordionGroupProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  headerColor?: string;
  children: React.ReactNode;
}

export const AccordionGroup: React.FC<AccordionGroupProps> = ({
  title,
  count,
  defaultOpen = false,
  headerColor,
  children,
}) => (
  <details open={defaultOpen}>
    <summary
      style={{
        cursor: "pointer",
        fontWeight: "bold",
        padding: "8px 12px",
        backgroundColor: headerColor || "#f5f5f5",
        borderRadius: "4px",
        marginBottom: "4px",
      }}
    >
      {title} ({count})
    </summary>
    <div style={{ paddingLeft: "12px" }}>{children}</div>
  </details>
);
```

#### Step 3: Replace `StarredThreadsList` with grouped view

**File:** `client/src/components/inbox/debug/StarredThreadsList.tsx`

Group threads into the four categories and render each in an `AccordionGroup`:

```tsx
export const StarredThreadsList: React.FC<StarredThreadsListProps> = ({
  threads = [],
}) => {
  const inAction = threads.filter(
    (t) => t.inDb && t.isStarredInDb && t.appearsInActionOrFollowUp,
  );
  const inFollowUp = threads.filter(
    (t) =>
      t.inDb &&
      t.isStarredInDb &&
      !t.appearsInActionOrFollowUp &&
      !t.isArchivedInDb,
  );
  const archived = threads.filter((t) => t.inDb && t.isArchivedInDb);
  const missing = threads.filter((t) => !t.inDb);

  return (
    <div>
      <AccordionGroup
        title="In Action"
        count={inAction.length}
        headerColor="#D4EDDA"
      >
        {inAction.map((t) => (
          <ThreadRow key={t.threadId} thread={t} />
        ))}
      </AccordionGroup>
      <AccordionGroup
        title="In Follow Up"
        count={inFollowUp.length}
        headerColor="#E6F0FF"
      >
        {inFollowUp.map((t) => (
          <ThreadRow key={t.threadId} thread={t} />
        ))}
      </AccordionGroup>
      <AccordionGroup
        title="Archived in BearlyMail"
        count={archived.length}
        headerColor="#FFF3CD"
      >
        {archived.map((t) => (
          <ThreadRow key={t.threadId} thread={t} showConflictFlag />
        ))}
      </AccordionGroup>
      <AccordionGroup
        title="Missing in BearlyMail"
        count={missing.length}
        headerColor="#FFE6E6"
      >
        {missing.map((t) => (
          <ThreadRow key={t.threadId} thread={t} />
        ))}
      </AccordionGroup>
    </div>
  );
};
```

#### Step 4: Show unsynced conflict flag in `ThreadRow`

For threads in the "Archived in BearlyMail" group where `archiveStatusConflict` is true, show a prominent warning:

```tsx
{
  thread.archiveStatusConflict && (
    <span style={{ color: "#d32f2f", fontWeight: "bold" }}>
      ⚠️ Gmail says INBOX — unsynced change pending
    </span>
  );
}
{
  thread.hasUnsyncedChanges && !thread.archiveStatusConflict && (
    <span style={{ color: "#f57c00" }}>
      🔄 Unsynced change pending ({thread.syncStatus})
    </span>
  );
}
```

#### Step 5: Update the sync popup modal

**File:** `client/src/components/inbox/debug/DebugStarredSection.tsx`

Replace the flat thread list in the popup with the same `StarredThreadsList` component (which now uses accordions). Remove the duplicate rendering code in the modal.

---

## Files to Change

### Server

| File                                            | Change                                                                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/src/emails/email-debug.service.ts`      | Add `isArchivedInDb`, `isInGmailInbox`, `syncStatus`, `hasUnsyncedChanges`, `archiveStatusConflict` to thread response; update `fixStaleUnsyncedThreads` to reconcile with Gmail first |
| `server/src/emails/providers/gmail.provider.ts` | Add `getInboxThreadIds()` method; consider running `syncThreadArchivedStatus` on every sync (not just extended)                                                                        |

### Client

| File                                                        | Change                                                            |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `client/src/components/inbox/debug/types.ts`                | Add new fields to `DebugStarredData`                              |
| `client/src/components/inbox/debug/AccordionGroup.tsx`      | NEW — reusable accordion component                                |
| `client/src/components/inbox/debug/StarredThreadsList.tsx`  | Rewrite to use AccordionGroup with 4 sections                     |
| `client/src/components/inbox/debug/DebugStarredSection.tsx` | Use StarredThreadsList in the popup instead of inline duplication |

---

## Implementation Steps for Codebeard

1. **Server: Add `getInboxThreadIds()`** to GmailProvider
2. **Server: Enhance debug endpoint** — add Gmail inbox status fields to each thread
3. **Server: Enhance `fixStaleUnsyncedThreads()`** — reconcile with Gmail before marking synced
4. **Server: Consider running `syncThreadArchivedStatus` on every sync** (remove the `isExtendedSync` guard)
5. **Client: Update `DebugStarredData` type** with new fields
6. **Client: Create `AccordionGroup` component**
7. **Client: Rewrite `StarredThreadsList`** with accordion groups
8. **Client: Simplify `DebugStarredSection` popup** to reuse `StarredThreadsList`
9. **Tests:** Update `email-debug.service.spec.ts` for new response fields

## Test Approach

1. **Archive trust:** Archive an email in BearlyMail → verify `syncStatus="unsynced"` → verify Gmail sync doesn't override until provider sync job completes → verify once synced, status matches Gmail
2. **Conflict detection:** Manually set a thread as `isArchived=true, syncStatus="synced"` where Gmail has INBOX label → debug endpoint should show `archiveStatusConflict=true`
3. **Fix stale:** Create a stale unsynced thread → click Fix Stale → verify it reconciles with Gmail rather than just blindly marking synced
4. **Accordion UI:** Debug view groups threads correctly into 4 categories, counts in headers match, collapsed by default, conflict flag visible

## Edge Cases / Risks

- **Performance:** Fetching all inbox thread IDs can be expensive for users with thousands of inbox threads. Consider caching the result or limiting to relevant threads only.
- **Rate limits:** Adding an extra Gmail API call per sync cycle. `threads.list` is lightweight but adds 1 API call per 5-min cycle. Monitor for 429 errors.
- **Stale fix side effects:** The smarter `fixStaleUnsyncedThreads` now makes a Gmail API call. If Gmail auth is expired, this will fail — need graceful fallback.
- **Follow Up categorization:** The current API doesn't distinguish "follow up" from "action" — both are `starCount > 0`. If follow-up is a separate concept, the grouping logic may need refinement. For now, use the `reason` field to distinguish.
