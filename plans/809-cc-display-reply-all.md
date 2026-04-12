# Plan: #809 — CC'd email addresses not displaying, Reply All not working

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/809

---

## Problem Analysis

Two related issues:

1. **CC field not displaying in email view** — CC'd recipients are not shown in the email detail header/thread item, even though the `Email` entity has a `cc` field and `EmailDetailHeader.tsx` has conditional rendering for it (`{email.cc && ...}`).

2. **Reply All not including CC'd recipients** — When user clicks "Reply All", the CC recipients from the original email are not included in the reply.

---

## Root Cause Hypothesis

### Issue 1: CC not displaying

The `cc` field exists on the `Email` entity (`server/src/database/entities/email.entity.ts:81`). However:

**Option A:** The CC header is not being parsed/saved from incoming emails during sync.

- Gmail provider: check if `Cc` header is extracted when fetching message headers.
- Office365 provider: check if `ccRecipients` from the API is mapped to the `cc` field.

**Option B:** The `cc` field is saved to DB but not included in the API response.

- Check the email query in `emails.service.ts` — the `select` clause or `toDto` mapping may exclude `cc`.
- Reference: `server/src/emails/emails-query-columns.spec.ts` — check which columns are selected.

**Option C:** The frontend `Email` type doesn't include `cc`, so it's stripped during type-safe mapping.

- Check `client/src/types/email.ts` — if `cc?: string` is missing, the field won't reach the component.

**Most likely:** The field is stored but not included in the query columns returned to the frontend.

### Issue 2: Reply All not including CC

The Reply All button triggers `onOpenReplyComposer('replyAll')`. The composer should pre-populate the `cc` field with the original email's CC recipients. If `email.cc` is `null/undefined` (because of Issue 1 — CC not being fetched), then Reply All would also fail.

Additionally, even if `cc` is available, the `sendReply` call must pass the CC recipients. Check:

- `client/src/hooks/useEmailDetailReplyOps.ts` or similar — does it pass `cc` when `mode === 'replyAll'`?
- `server/src/replies/replies.service.ts` — does the `replyAll` path add CC recipients from the original email?

---

## Implementation Steps

### Step 1: Ensure CC is parsed during email sync

**File:** `server/src/emails/providers/gmail.provider.ts`

- Find where email headers are parsed (likely in `parseGmailMessage` or similar).
- Check for `Cc` or `cc` header extraction:
  ```typescript
  const cc = headers.find((h) => h.name.toLowerCase() === "cc")?.value || "";
  ```
- Ensure this value is saved to the `email.cc` column.

**File:** `server/src/emails/providers/office365/` or `office365.provider.ts`

- Map `ccRecipients` from the Office365 API response to the `cc` field.
- Format as comma-separated email string (consistent with Gmail format).

**File:** `server/src/emails/providers/zoho.provider.ts` (if applicable)

- Similar CC extraction.

### Step 2: Include CC in email query columns

**File:** `server/src/emails/emails-query-columns.ts` (likely) or `emails.service.ts`

- Add `'email.cc'` to the selected columns list.
- Reference: `server/src/emails/email-thread.service.ts:50` already selects `"email.cc"` — check if the main emails query does too.

### Step 3: Include CC in email API response / DTO

**File:** `server/src/emails/emails.service.ts` (or `dto/email.dto.ts`)

- Ensure `cc` is included in the DTO/API response for the email list and email detail endpoints.
- Check both `GET /emails` and `GET /emails/:id`.

### Step 4: Add CC to frontend Email type

**File:** `client/src/types/email.ts`

- Add `cc?: string;` if not already present.
- This ensures the field passes through TypeScript's type checking.

### Step 5: Fix Reply All to include CC

**File:** `client/src/hooks/useEmailDetailReplyOps.ts` (or wherever reply is constructed)

- When `mode === 'replyAll'`:
  - Set the `to` field to include the original sender + all `to` recipients (minus the current user).
  - Set the `cc` field to the original email's `cc` recipients.
- Pass `cc` in the `sendReply` API call.

**File:** `server/src/replies/replies.service.ts`

- When `replyAll = true`:
  - Fetch the original email's `to` and `cc` fields.
  - Add them to the reply's recipient list (excluding the current user's email).
  - Pass them to the email provider's `sendEmail` / `sendReply` method.

---

## Files to Modify

| File                                                            | Change                                              |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `server/src/emails/providers/gmail.provider.ts`                 | Extract and save `Cc` header during message parse   |
| `server/src/emails/providers/office365/office365-operations.ts` | Map `ccRecipients` to `cc` field                    |
| `server/src/emails/emails-query-columns.ts` (or service)        | Include `email.cc` in select columns                |
| `server/src/emails/emails.service.ts`                           | Include `cc` in email DTO/response                  |
| `client/src/types/email.ts`                                     | Add `cc?: string` field                             |
| `client/src/hooks/useEmailDetailReplyOps.ts`                    | Pass CC recipients in Reply All mode                |
| `server/src/replies/replies.service.ts`                         | Include original CC recipients when replyAll = true |

---

## Testing Approach

1. **CC display:**
   - Send an email to user@test.com with cc@test.com in CC.
   - Sync inbox, open the email.
   - Assert: CC field shows "cc@test.com" in the email header.

2. **Reply All:**
   - Open an email where you're one of multiple recipients.
   - Click Reply All.
   - Assert: reply composer shows CC recipients pre-populated.
   - Send the reply, assert the CC recipients received it.

3. **Unit tests:**
   - Gmail provider: given a Gmail message with `Cc` header, `parsedEmail.cc` equals the CC address.
   - Office365 provider: given `ccRecipients` in the API response, `email.cc` is correctly mapped.
   - Reply All: given `email.cc = "a@test.com,b@test.com"`, the reply includes these in CC.

---

## Notes

- The `email-thread.service.ts` already selects `email.cc` (line 50), which suggests the field is queryable — the issue is likely in the main email list query or the API response DTO.
- For Reply All, need to be careful not to include the current user's own email in the reply recipients.
- CC field format: should be consistent (comma-separated email addresses, with or without display names like `"Name <email@domain.com>"`).
