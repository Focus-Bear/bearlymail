# Plan: Fix Tone Check — Weekend Nag + Trivial Suggestions + Attachment Loss

**Issue:** #855 — bug: Tone Check issues — weekend scheduling nag + unnecessary revision suggestions
**Summary:** Three tone check bugs: (1) scheduling nag ignores already-set send time, (2) trivial suggestions shown when email is fine, (3) attachments lost after tone check rejection. Fix all three.

---

## Bug 1: Weekend scheduling nag when send time already set

### Root Cause

The tone check doesn't receive the scheduled send time from the compose context. It blindly checks the current day/time and suggests scheduling, even when the user already scheduled the email.

### Fix

**File:** `server/src/emails/` — find the tone check service (likely `server/promptfoo/prompts/check-tone-style.md` and the service that calls it)

**File:** `client/src/components/email-detail-inline/` — the compose component that triggers tone check

1. **Pass scheduled send time to tone check:**
   - When calling the tone check API, include `scheduledSendAt` in the request payload
   - If `scheduledSendAt` is set (and is in the future), pass it as context

2. **Update the tone check prompt** (`server/promptfoo/prompts/check-tone-style.md`):
   - Add context: "If `scheduledSendAt` is provided and is a future timestamp, DO NOT suggest scheduling — the user has already set a send time."
   - Add to the system prompt explicitly: scheduling suggestions should be omitted when a future send time is already set

3. **Backend service** that processes tone check results:
   - Before returning weekend/timing suggestions to the client, check if `scheduledSendAt` is set
   - Filter out scheduling-related suggestions if a future send time exists
   - This is a safety net even if the LLM ignores the prompt instruction

---

## Bug 2: Trivial revision suggestions shown for fine emails

### Root Cause

The LLM is suggesting minor rewording even when the email is perfectly adequate. The threshold for "this email needs revision" is too low.

### Fix

**File:** `server/promptfoo/prompts/check-tone-style.md`

Update the prompt to include a significance threshold:

- "Only suggest revisions if they meaningfully improve clarity, tone, or professionalism. Do NOT suggest rewording that has the same meaning with trivial word choice differences."
- "If the email is clear, professional, and appropriate, return `hasIssues: false` with no revision — even if minor stylistic improvements exist."
- "A 2-sentence transactional email confirming a payment does NOT need revision unless it has a genuine tone, clarity, or professional issue."

**File:** Backend tone check response processor

Add a significance check:

- If the suggested revision differs from the original by less than N% (e.g., edit distance / word count ratio), treat it as `hasIssues: false`
- Or: require the LLM to provide a `significance: 'low' | 'medium' | 'high'` field; only show warning if `significance >= 'medium'`

---

## Bug 3: Tone check wipes attachments (DATA LOSS)

### Root Cause

The tone check flow doesn't preserve the full compose state (attachments) when the user dismisses/rejects the tone check. The attachment list is reset.

### Fix

**File:** `client/src/components/email-detail-inline/` — the compose component and the tone check modal

1. **Before opening the tone check modal**, save a snapshot of the full compose state:

   ```typescript
   const savedComposeState = {
     attachments: [...currentAttachments],
     scheduledSendAt: currentScheduledTime,
     to: currentRecipients,
     cc: currentCC,
     bcc: currentBCC,
     body: currentBody,
   };
   ```

2. **When the tone check modal closes** (accept OR reject OR dismiss), restore the compose state from the snapshot. The only thing that should change is the email body IF the user clicked "Use revised text".

3. Specifically: attachment state must never be touched by the tone check flow. The attachment list should be stored outside the tone check's component scope.

4. Add an integration test: open compose, add attachment, trigger tone check, dismiss — verify attachment is still present.

---

## Bug 4 (Enhancement): Separate attachment reminder from scheduling nag

The attachment reminder ("confirm the Stripe file is attached") is genuinely useful. It gets dismissed with the scheduling noise.

### Fix

**File:** Backend tone check response / `server/promptfoo/prompts/check-tone-style.md`

Separate the tone check response into distinct fields:

```json
{
  "hasIssues": true,
  "schedulingSuggestion": { ... },  // omit if scheduledSendAt is set
  "attachmentReminder": "You mentioned Stripe transaction details — ensure the file is attached",
  "toneIssues": [],
  "suggestedRevision": "..."
}
```

**Client:** Show attachment reminder as a separate, persistent banner in the compose UI (not inside the tone check modal) so it survives modal dismissal.

---

_Plan authored by Monk of Modularity (AI agent). Review before implementation._
