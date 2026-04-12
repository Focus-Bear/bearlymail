# Plan: Fix snooze reliability without overriding Gmail source of truth

**Issue:** #1496 — Snoozed emails reappear after reload
**Rework based on:** Jeremy's feedback on PR #1501 — "should not be overriding Gmail as the source of truth. Only override if the sync status is syncing. I still want optimistic updates to the UI as soon as you click snooze"

## Problem Analysis

Snoozed emails reappear after page reload because:

1. **Snooze doesn't set `syncStatus = "unsynced"` on the thread.** The existing sync guard in `batchUpdateThreadArchivedStatuses` already skips threads where `syncStatus != "synced"`, but snooze never sets this flag — so the sync process freely overwrites snoozed threads' archived status.

2. **Fire-and-forget API call silently fails.** If the server-side snooze call fails, the client doesn't know. The `.catch()` handler tries to restore state, but by that time the user may have navigated away.

3. **Silent degradation on thread-not-found.** If `snoozeService` can't find the thread, it only sets `email.isSnoozed = true` — but the inbox query filters on `thread.isSnoozed`, so the email reappears.

## Previous approach (PR #1501 — rejected)

The previous implementation:

- Added a **blanket snooze filter** in `batchUpdateThreadArchivedStatuses` that queries ALL snoozed threads and excludes them from sync — this bypasses the existing `syncStatus` pattern and makes BearlyMail override Gmail's state for all snoozed threads permanently.
- Changed the client from **fire-and-forget to `await`** — this breaks optimistic UI by making the snooze button wait for the API response.
- Threw on thread-not-found — reasonable but should be paired with the correct sync approach.

**Why Jeremy rejected it:** The sync guard query is a new code path that permanently prevents Gmail sync from updating snoozed threads. Gmail is the source of truth — we should only temporarily protect local state during the window between user action and sync confirmation, using the existing `syncStatus` mechanism.

## Revised Approach

### Principle: Use the existing `syncStatus` pattern

The codebase already has a pattern for protecting user operations from sync overwrites:

1. User action sets `thread.syncStatus = "unsynced"` + `thread.lastUserOperationAt = new Date()`
2. `batchUpdateThreadArchivedStatuses` only updates where `syncStatus = "synced"`
3. After provider sync confirms, `syncStatus` is set back to `"synced"`

Snooze should follow this same pattern. No new sync-guard queries needed.

### Changes Required

#### 1. `server/src/snooze/snooze.service.ts` — Set syncStatus on snooze/unsnooze

**In `snoozeEmail()`:**
When setting `thread.isSnoozed = true`, also set:

```typescript
thread.syncStatus = "unsynced";
thread.syncStatusUpdatedAt = new Date();
thread.lastUserOperationAt = new Date(); // already done
```

This ensures the existing sync guard in `batchUpdateThreadArchivedStatuses` (which checks `syncStatus = "synced"`) will skip this thread until the provider sync confirms.

**In `unsnoozeEmail()`:**
Same pattern — set `syncStatus = "unsynced"` when unsnozing.

**After provider sync succeeds (both snooze and unsnooze):**
After `provider.snoozeThread()` / `provider.unsnoozeThread()` succeeds, set the thread back to synced:

```typescript
thread.syncStatus = "synced";
thread.syncStatusUpdatedAt = new Date();
await this.emailThreadRepository.save(thread);
```

**If provider sync fails:**
Leave `syncStatus = "unsynced"` — the thread stays protected from sync overwrites. A separate reconciliation process (or the next user action) can retry. Log the error but don't fail the request (current behavior is correct here).

**Thread-not-found handling:**
Change the `logger.error` to `throw new Error(...)` as in the original PR. If the thread doesn't exist, snooze cannot work correctly (inbox filters on `thread.isSnoozed`). Hard failure is correct.

#### 2. `client/src/hooks/useEmailActionsBase.ts` — Keep fire-and-forget (optimistic UI)

**Do NOT change from `.catch()` to `await`.** The current fire-and-forget pattern is correct for optimistic updates:

- User clicks snooze → immediately dispatch `removeEmail`, `addOptimisticSnooze`, adjust tab counts
- API call runs in background
- If it fails, `.catch()` restores the email

The only improvement: add a user-visible error notification in the `.catch()` handler so failures aren't silent. Something like:

```typescript
axios.post(`${API_URL}/snooze/${emailId}`, { duration }).catch((error) => {
  console.error("[Snooze] API call failed:", error);
  if (emailToSnooze) {
    dispatch(restoreEmail(emailToSnooze));
  }
  dispatch(removeOptimisticSnooze(emailId));
  adjustTabCount(onTabCountsUpdateOptimistically, mode, 1);
  // Optional: show user-visible toast/notification
  fetchEmails().catch((err) =>
    console.error("Error refreshing after snooze error:", err),
  );
});
```

#### 3. `server/src/snooze/snooze.controller.ts` — Structured response (keep from original PR)

Return `{ id, isSnoozed, snoozeUntil }` instead of the raw entity. This is a clean API improvement and not related to the sync issue.

#### 4. `server/src/emails/email-thread.service.ts` — NO CHANGES

**Remove the snooze-specific filter** added in the original PR. The existing `syncStatus = "synced"` guard already handles this once snooze sets `syncStatus = "unsynced"`.

#### 5. `server/src/snooze/snooze.service.spec.ts` — Update tests

- Keep thread-not-found throw test
- Keep emailThreadId/threadId lookup tests
- Keep lastUserOperationAt test
- **Add:** test that `syncStatus` is set to `"unsynced"` on snooze
- **Add:** test that `syncStatus` is set back to `"synced"` after provider sync succeeds
- **Add:** test that `syncStatus` stays `"unsynced"` if provider sync fails

## Files to Change

| File                                        | Change                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `server/src/snooze/snooze.service.ts`       | Set `syncStatus = "unsynced"` on snooze/unsnooze; set back to `"synced"` after provider confirms; throw on thread-not-found |
| `server/src/snooze/snooze.controller.ts`    | Return structured `{id, isSnoozed, snoozeUntil}` response                                                                   |
| `server/src/snooze/snooze.service.spec.ts`  | Add syncStatus tests, keep thread-not-found and lookup tests                                                                |
| `client/src/hooks/useEmailActionsBase.ts`   | No structural change — keep fire-and-forget. Optionally add error toast.                                                    |
| `server/src/emails/email-thread.service.ts` | **No changes** (revert the snooze filter from original PR)                                                                  |

## What This Achieves

1. **Optimistic UI preserved** — fire-and-forget client pattern unchanged
2. **Gmail stays source of truth** — once provider sync confirms, `syncStatus = "synced"` and future syncs can update freely
3. **Temporary protection during sync window** — `syncStatus = "unsynced"` prevents sync from clobbering the snooze between user action and provider confirmation
4. **Uses existing patterns** — no new sync-guard code paths; leverages the `syncStatus` mechanism already used by archive/star operations
5. **Hard failure on thread-not-found** — prevents silent degradation that causes snooze to appear to work but not persist
