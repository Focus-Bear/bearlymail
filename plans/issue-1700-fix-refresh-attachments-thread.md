# Plan: Fix Refresh Attachments From Gmail — Process Entire Thread (#1700)

## Problem

The "Refresh attachments from Gmail" feature only refreshes attachments for a single email message, even when the thread contains multiple emails with attachments. Users expect the refresh to update attachment metadata for **every email in the thread**.

## Root Cause Analysis

The current implementation in `refreshAttachmentsFromGmailForUser()` (`server/src/emails/providers/gmail-sync.refresh-attachments.ts`) operates on a single email:

1. Takes a single `emailId` parameter
2. Fetches that ONE email from the DB
3. Calls Gmail API `messages.get` for that ONE message
4. Parses and updates attachments for that ONE email only

The client (`EmailDetailDebugInfo.tsx`) calls `POST /emails/${emailData.id}/debug/refresh-attachments-from-gmail` with the current email's ID. Since the user is viewing a thread detail page that shows all thread emails, they expect the refresh to cover the entire thread — but it only processes the single email whose debug section the button is in.

### Code Flow

```
Client: EmailDetailDebugInfo → POST /emails/:id/debug/refresh-attachments-from-gmail
  ↓
Controller: EmailDebugController.refreshAttachmentsFromGmail(req, id)
  ↓
Service: GmailSyncService.refreshAttachmentsFromGmail(userId, emailId)
  ↓
Function: refreshAttachmentsFromGmailForUser(deps, userId, emailId)
  → Fetches ONE email by ID
  → Gets ONE Gmail message
  → Updates ONE email's attachments
```

## Implementation Steps

### Step 1: Create Thread-Level Refresh Function

**File:** `server/src/emails/providers/gmail-sync.refresh-attachments.ts`

Add a new function `refreshAttachmentsFromGmailForThread()` that:

1. Takes `emailId` (or `threadId`) to identify the thread
2. Looks up the email to find its `emailThreadId`
3. Queries all emails in the same thread: `emailRepository.find({ where: { emailThreadId, userId } })`
4. For each email that has a `messageId`, calls Gmail API `messages.get` and parses attachments
5. Batch-updates all emails with their refreshed attachment metadata
6. Returns a summary of all processed emails and their attachments

```typescript
export async function refreshAttachmentsFromGmailForThread(
  deps: {
    emailsService: EmailsService;
    gmailProvider: GmailProvider;
    logger: Logger;
    emailRepository: Repository<Email>;
  },
  userId: string,
  emailId: string,
): Promise<{
  threadId: string;
  results: Array<{
    emailId: string;
    gmailMessageId: string;
    attachments: EmailAttachment[] | null;
    error?: string;
  }>;
}> {
  // 1. Find the trigger email to get the thread
  const triggerEmail = await deps.emailsService.getEmailById(userId, emailId);
  if (!triggerEmail) throw new NotFoundException("Email not found");
  if (!triggerEmail.emailThreadId) throw new BadRequestException("Email is not linked to a thread");

  // 2. Find all emails in this thread
  const threadEmails = await deps.emailRepository.find({
    where: { emailThreadId: triggerEmail.emailThreadId, userId },
    select: ["id", "messageId"],
  });

  // 3. Create Gmail client once (not per email)
  const gmail = await deps.gmailProvider.createGmailClientPublic(userId);
  if (!gmail) throw new ServiceUnavailableException("Gmail not connected");

  // 4. Process each email
  const results = [];
  for (const threadEmail of threadEmails) {
    if (!threadEmail.messageId?.trim()) {
      results.push({
        emailId: threadEmail.id,
        gmailMessageId: "",
        attachments: null,
        error: "No Gmail message ID",
      });
      continue;
    }
    try {
      const apiResponse = await gmail.users.messages.get({
        userId: "me",
        id: threadEmail.messageId,
        format: "full",
      });
      const rawEmail = parseGmailMessage(apiResponse.data);
      const attachments = rawEmail?.attachments ?? null;
      await deps.emailsService.updateEmail(threadEmail.id, { attachments });
      results.push({
        emailId: threadEmail.id,
        gmailMessageId: threadEmail.messageId,
        attachments,
      });
    } catch (error) {
      results.push({
        emailId: threadEmail.id,
        gmailMessageId: threadEmail.messageId,
        attachments: null,
        error: formatGaxiosError(error),
      });
    }
  }

  return { threadId: triggerEmail.emailThreadId, results };
}
```

### Step 2: Update Controller Endpoint

**File:** `server/src/emails/email-debug.controller.ts`

Update `refreshAttachmentsFromGmail` to call the new thread-level function. The endpoint signature stays the same (`POST /emails/:id/debug/refresh-attachments-from-gmail`) — the `:id` is the email that triggered the refresh, but the function now processes the entire thread.

### Step 3: Update `GmailSyncService` Wrapper

**File:** `server/src/emails/providers/gmail-sync.service.ts`

Update the `refreshAttachmentsFromGmail` method to delegate to the new thread-level function. Ensure the data source / email repository is available in the deps.

### Step 4: Update Client Response Handling

**File:** `client/src/components/email-detail/EmailDetailDebugInfo.tsx`

Update `handleRefreshAttachmentsFromGmail` to handle the new response format. The response now includes results for multiple emails. After a successful refresh:

1. Call `onAttachmentsSynced()` to re-fetch the email and thread emails (already happens)
2. Optionally show a summary toast/message: "Refreshed attachments for N emails in thread"

### Step 5: Keep Backward Compatibility

Keep the existing `refreshAttachmentsFromGmailForUser()` function available (renamed or kept as-is) in case other code paths need single-email refresh. The thread-level function can call the single-email logic internally for each email.

## Files Changed

| File | Change |
|------|--------|
| `server/src/emails/providers/gmail-sync.refresh-attachments.ts` | Add `refreshAttachmentsFromGmailForThread()`, keep existing single-email function |
| `server/src/emails/providers/gmail-sync.service.ts` | Update `refreshAttachmentsFromGmail()` to use thread-level function |
| `server/src/emails/email-debug.controller.ts` | Update endpoint to return thread-level results |
| `client/src/components/email-detail/EmailDetailDebugInfo.tsx` | Handle multi-email response, show summary |

## Edge Cases

1. **Emails without `messageId`**: Skip them with a note in the results — they can't be refreshed from Gmail
2. **Gmail API rate limits**: Process emails sequentially (not in parallel) to avoid hitting per-user rate limits. The typical thread has <10 emails so sequential is fine.
3. **Partial failures**: If some emails fail to refresh, return results for all (with error info for failures) rather than failing the entire request
4. **Empty thread**: If the thread has no emails (shouldn't happen), return an empty results array
5. **Single-email thread**: Works correctly — processes just the one email (same as current behavior)

## Testing

1. Verify refresh processes all emails in a multi-email thread
2. Verify attachments are updated for each email that has them in Gmail
3. Verify emails without `messageId` are skipped gracefully
4. Verify partial failures don't block other emails from being processed
5. Verify the client UI updates to show all thread emails' attachments after refresh
6. Verify existing single-email refresh behavior is preserved as a fallback
