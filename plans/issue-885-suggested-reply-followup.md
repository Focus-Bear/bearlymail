# Plan: Fix #885 — Suggested Replies Are Poor Quality on Follow-Up Emails

## Problem

When the user sent the last email in a thread (i.e. `userSentLast === true`), the suggested reply processor takes the **follow-up path** which generates a single "Follow Up" nudge via `generateFollowUpDraft`. However, this path has a critical bug in how it determines context:

### Root Cause: `fetchLatestEmailInThread` returns the user's own email

In `SuggestedRepliesProcessor.handleGenerateSuggestedRepliesJob()`:

```typescript
const latestEmailInThread = await this.fetchLatestEmailInThread(
  threadId,
  userId,
);
```

This fetches the **most recent email overall** (ordered by `receivedAt DESC`). When the user sent the last message, `latestEmailInThread` is the user's own email.

Then in `buildReplyContext()`:

```typescript
const lastEmailFrom = latestEmail.from?.toLowerCase() || "";
const userSentLast = Boolean(userEmail && lastEmailFrom === userEmail);
```

This correctly identifies that the user sent last. But the problem is that **all downstream context is built around `latestEmailInThread`** — the user's own email — rather than the email the user should be _following up on_ (the most recent email from the other party).

### Specific Issues

1. **`buildFollowUpContext` only fetches 5 messages** (`take: 5`). In a long thread, this may miss important context from the other party's most recent reply.

2. **`recipientName` detection is fragile** — it finds the first non-user email in the (possibly truncated) 5-message window:

   ```typescript
   const recipientName =
     threadEmails.find(
       (emailEntry) => emailEntry.from?.toLowerCase() !== userEmail,
     )?.fromName || "there";
   ```

   If the 5 most recent emails are all from the user (e.g., multiple follow-ups), `recipientName` falls back to `"there"`.

3. **`daysSinceLastEmail` is calculated from the user's own last email**, not from the other party's last email. This means the "business days waiting" metric is wrong — it shows how long since the user last emailed, not how long the user has been waiting for a response.

4. **The follow-up prompt receives thread context where the user's own messages dominate**, making the LLM generate a generic nudge rather than a contextually aware follow-up that references what was discussed.

5. **The `latestEmail.subject` passed to the follow-up generator is from the user's own email**, which may have a different subject than the original thread if the user modified it.

## Fix Plan

### Change 1: Find the last email from the OTHER party for follow-up context

**File:** `server/src/suggested-replies/suggested-replies.processor.ts`

In `handleGenerateSuggestedRepliesJob`, after determining `userSentLast === true`, fetch the most recent email from someone OTHER than the user to use as the "email being followed up on":

```typescript
// After building replyContext and confirming userSentLast:
const lastEmailFromOther = await this.emailRepository.findOne({
  where: {
    emailThreadId: threadId,
    userId,
    // TypeORM Not() to exclude user's own emails
  },
  order: { receivedAt: "DESC" },
});
```

This requires comparing against `userEmail`. Use a query builder or raw `Not(userEmail)` on the `from` field.

### Change 2: Fix `daysSinceLastEmail` to measure wait time from other party's email

**File:** `server/src/suggested-replies/suggested-replies.processor.ts`  
**Method:** `buildFollowUpContext`

Calculate `daysSinceLastEmail` from the last email sent by the OTHER party, not from `latestEmail` (which is the user's own email when `userSentLast === true`):

```typescript
const lastOtherPartyEmail = threadEmails
  .filter((e) => e.from?.toLowerCase() !== userEmail)
  .sort(
    (a, b) =>
      new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
  )[0];

const referenceDate = lastOtherPartyEmail
  ? new Date(lastOtherPartyEmail.receivedAt)
  : new Date(latestEmail.receivedAt); // fallback

const daysSinceLastEmail = Math.floor(
  (now.getTime() - referenceDate.getTime()) / MILLISECONDS.DAY,
);
```

### Change 3: Increase thread message window for follow-ups

**File:** `server/src/suggested-replies/suggested-replies.processor.ts`  
**Method:** `buildFollowUpContext`

Change `take: 5` to `take: 10` (or a constant) to ensure we capture enough context in long threads. The existing constant `QUERY_LIMITS` may already have an appropriate value, or add one.

### Change 4: Improve the follow-up prompt to explicitly identify the conversation state

**File:** `server/promptfoo/prompts/generate-follow-up.md`

Add context to the prompt about what the user is following up on:

```markdown
## Context

The user sent the most recent email in this thread and is waiting for a response.
The last email from the other party was sent {{daysSinceOtherPartyEmail}} days ago.
{% if lastOtherPartyMessage %}
The other party's most recent message:
{{lastOtherPartyMessage}}
{% endif %}

The user's most recent email (what they sent last):
{{userLastMessage}}
```

This gives the LLM clear context about:

- What the other party last said
- What the user last said
- That the user wants to follow up (not reply to their own email)

### Change 5: Pass richer context to `generateFollowUpDraft`

**File:** `server/src/suggested-replies/suggested-replies.processor.ts`  
**Method:** `generateReplySuggestions` (the `userSentLast` branch)

Update the call to include:

- The other party's last message body (extracted from thread)
- The user's own last message body
- Correct days-waiting based on the other party's last email

**File:** `server/src/llm/llm-reply.service.ts`  
**Method:** `generateFollowUpDraft`

Add optional parameters for `lastOtherPartyMessage` and `userLastMessage` and pass them to the prompt renderer.

### Change 6: Add/update Promptfoo test cases for follow-up scenarios

**File:** `server/promptfoo/promptfooconfig.yaml` (or relevant test config)

Add test cases that cover:

- Thread where user sent last → follow-up should reference what the other party said
- Long thread with multiple user follow-ups → should still find the right context
- Thread where the other party never replied → appropriate "initial follow-up" nudge

## Files to Modify

| File                                                               | Change                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `server/src/suggested-replies/suggested-replies.processor.ts`      | Fetch last email from other party; fix daysSinceLastEmail; increase thread window |
| `server/src/llm/llm-reply.service.ts`                              | Accept and pass through `lastOtherPartyMessage` and `userLastMessage` to prompt   |
| `server/src/llm/llm.service.ts`                                    | Update `generateFollowUpDraft` signature to pass new fields                       |
| `server/promptfoo/prompts/generate-follow-up.md`                   | Add other-party and user-last-message context sections                            |
| `server/src/suggested-replies/suggested-replies.processor.spec.ts` | Update tests for new follow-up context logic                                      |

## Testing

1. Unit tests in `suggested-replies.processor.spec.ts` — mock thread with user-sent-last scenario
2. Promptfoo eval for `generate-follow-up.md` with thread context including user's last email
3. Manual test: open a thread where you sent the last email → verify suggested reply references the other party's last message and suggests a contextual follow-up

## Risk Assessment

- **Low risk** — changes are isolated to the follow-up branch of suggested reply generation
- **No schema changes** — all data already exists in the emails table
- **Prompt change is additive** — adds more context to the existing prompt without removing anything
- **Backward compatible** — new parameters are optional with sensible defaults
