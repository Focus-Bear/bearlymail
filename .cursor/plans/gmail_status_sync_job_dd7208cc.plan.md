---
name: Gmail Status Sync Job
overview: Extend the existing 5-minute sync job to check all non-archived emails in the database against Gmail, updating their archived status and star count. This will be added to the existing GmailProvider.syncEmails method that already runs every 5 minutes.
todos:
  - id: extend-gmail-provider-sync
    content: Add logic to GmailProvider.syncEmails to check all non-archived threads from DB against Gmail API
    status: pending
  - id: add-batch-verification-method
    content: Create helper method in GmailProvider to verify thread statuses in batches with concurrency limits
    status: pending
  - id: test-compilation
    content: Verify TypeScript compilation succeeds after changes
    status: pending
    dependencies:
      - extend-gmail-provider-sync
      - add-batch-verification-method
---

# Gmail Status Verification - Extend Existing Sync

## Problem

Emails are showing in triage but are actually archived in Gmail. The current sync only checks:

1. Threads currently in INBOX or starred (from Gmail search)
2. Existing starred threads in the DB

It doesn't check ALL non-archived threads in the DB, so threads that were archived in Gmail but are still marked `isArchived: false` in our DB never get updated.

## Solution

Extend the existing `GmailProvider.syncEmails` method (which already runs every 5 minutes via `sync-all-users-urgent` job) to also check all non-archived threads from the database against Gmail.

## Implementation

### 1. Extend GmailProvider.syncEmails

**File**: `server/src/emails/providers/gmail.provider.ts`

After the existing logic that checks starred threads (around line 523), add a new section that:

- Gets all non-archived thread IDs from DB using `EmailThreadService.getAllNonArchivedThreadIds(userId)`
- Filters out threads already processed in the main sync (skip if in `allThreadIds` set)
- Processes threads in batches with concurrency limits (similar to existing starred thread check)
- Uses `format: "metadata"` for efficiency
- Collects updates and batch updates DB

### 2. Add Batch Verification Helper Method

**File**: `server/src/emails/providers/gmail.provider.ts`

Create a private method `verifyThreadStatusesInGmail()` that:

- Takes userId, threadIds array, and gmail client
- Processes threads in batches (e.g., 50 at a time) with concurrency limit (e.g., 10 parallel)
- Returns array of updates: `{ threadId, starCount, isArchived }[]`
- Handles 404 errors (thread deleted) by marking as archived
- Handles other errors gracefully (log and continue)

### 3. Performance Considerations

- Use `format: "metadata"` for Gmail API calls (already used for starred threads)
- Process threads in batches with Promise.all and concurrency limits
- Skip threads already processed in main sync to avoid duplicate work
- Limit threads checked per run if needed (e.g., 500 max) to avoid timeouts
- Use existing batch update methods: `batchUpdateThreadStarCount()` and `batchUpdateThreadArchivedStatuses()`

### 4. Error Handling

- Handle 404 errors (thread deleted) by marking as archived
- Handle auth errors by setting `needsRelogin: true` on user (already handled in syncEmails)
- Log errors but don't fail entire sync for individual thread failures
- Use try-catch around each thread check (similar to existing pattern)

## Files to Modify

1. **Modify**: `server/src/emails/providers/gmail.provider.ts`
   - Add batch verification helper method
   - Extend `syncEmails()` to check all non-archived threads after checking starred threads

## Dependencies

- Uses existing `EmailThreadService.getAllNonArchivedThreadIds()` (already exists)
- Uses existing `EmailThreadService.batchUpdateThreadStarCount()` (already used)
- Uses existing `EmailThreadService.batchUpdateThreadArchivedStatuses()` (already used)
- Uses existing Gmail OAuth setup (already in syncEmails)
- Uses existing job infrastructure (no changes needed - already runs every 5 min)

## Implementation Details

The new logic should be added after line 523 in `gmail.provider.ts`, following the same pattern as the existing starred thread check:

```typescript
// After checking existing starred threads, check all non-archived threads
const allNonArchivedThreadIds =
  await this.emailThreadService.getAllNonArchivedThreadIds(userId);
const threadsToCheck = allNonArchivedThreadIds.filter(
  (threadId) => !allThreadIds.has(threadId), // Skip already processed
);

if (threadsToCheck.length > 0) {
  this.logger.debug(
    `Checking ${threadsToCheck.length} non-archived threads against Gmail`,
  );

  const nonArchivedUpdates = await this.verifyThreadStatusesInGmail(
    userId,
    threadsToCheck,
    gmail,
  );

  // Batch update...
}
```

## Testing Considerations

- Test with users having many non-archived threads
- Test with threads that are archived in Gmail but not in DB
- Test with threads that are starred in Gmail but not in DB
- Test that already-processed threads are skipped
- Test error handling (404, auth errors, rate limits)
- Verify it doesn't slow down existing sync significantly
