# Plan: #1173 — BearlyMail not showing CC participants

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/1173
> **Branch:** `plan/issue-1173-cc-participants`

---

## Problem Analysis

The issue reports that BearlyMail is missing CC'd participants in the UI, and this also affects Reply All functionality.

### History

Issue #809 addressed CC not displaying and Reply All not including CC recipients. PRs #821 and #842 were merged and fixed:
- Gmail CC header extraction (`parseGmailMessage` in `gmail-message-parser.ts`)
- Office365 and Zoho CC field mapping
- Query column selection to include `email.cc`
- Frontend Reply All logic to populate CC

**Issue #1173 appears to be a regression or a gap in the original fix.** After investigating the current codebase state:

---

## Root Cause Investigation

### 1. CC Parsing (Server)

All three providers now correctly parse CC:
- **Gmail** (`server/src/emails/providers/gmail/gmail-message-parser.ts:29–31`): Extracts `Cc` header ✅
- **Office365** (`server/src/emails/providers/office365/office365-message-parser.ts:28,111`): Maps `ccRecipients` ✅
- **Zoho** (`server/src/emails/providers/zoho/zoho-message-parser.ts:22,77`): Maps `ccAddress` ✅

### 2. CC in Query Results (Server)

- `email-thread.service.ts:50` — selects `email.cc` in thread query ✅
- `emails.service.ts:1114` — includes `e."cc"` in the main inbox LATERAL SQL query ✅

### 3. CC in Frontend Type

- `client/src/types/email.ts:32` — has `cc?: string` ✅

### 4. CC Display in EmailDetailHeader

- `EmailDetailHeader.tsx:233–242` — conditionally renders CC: `{email.cc && <div>...{email.cc}</div>}` ✅
- `ThreadItemHeader.tsx:126` — renders `{cc && <AddressField label="CC" value={cc} />}` ✅

### 5. Reply All CC Logic

- `useEmailDetailReplies.ts:158–168` — correctly reads `email.cc`, splits it, filters current user, populates reply CC field ✅

### Likely Root Cause: CC not persisting for newly synced emails

The fix in PR #842 updated the **parsers** but **existing emails already in the DB** will have `cc = null` because they were synced before the fix. The issue reporter is likely seeing old emails where CC was never populated.

Additionally, there's a subtle issue: **the CC field from the email entity may not be decrypted before it reaches the frontend in some code paths.** The `cc` column uses `encryptedColumnTransformer` (see `email.entity.ts`). In the main inbox SQL query (`emails.service.ts:1114`), the raw `e."cc"` value is selected but the transformer is NOT applied because it's a raw SQL query, not TypeORM entity loading. This means the CC field returned to the frontend will be **AES-encrypted ciphertext**, not the plain-text email address!

This is the most likely root cause for regression: the encrypted cc value appears in the frontend but isn't a valid email address, so even if it renders, it would show garbage or the conditional `{email.cc && ...}` would evaluate to `true` with garbled content.

Let's verify: `email-thread.service.ts` uses QueryBuilder with `.select()` — TypeORM DOES apply transformers here. So `getThreadEmails()` returns decrypted CC. But the **main inbox getInbox() raw SQL query** does NOT apply transformers.

Check: `emails.service.ts` at lines 1100–1130 — this is a raw query. How are the other encrypted fields (like `from`, `to`) handled? If they're all decrypted in a post-processing step, we need to confirm CC is included in that step.

---

## Investigation Tasks for Codebeard

Before implementing, confirm the following in `server/src/emails/emails.service.ts`:

1. **Find the decryption post-processing step** for the raw `getInbox()` SQL query. Are `from`, `to`, and `cc` fields decrypted after the raw query returns? If so, is `cc` included?

2. **Check the `toDto` or mapping function** that converts raw SQL rows to the API response. Does it include and decrypt `cc`?

3. **For existing emails with `cc = null`**, is there a backfill migration planned? (This is a separate concern from the rendering bug.)

---

## Probable Fix

### Scenario A: CC is encrypted in raw SQL output and not decrypted in the mapping step

**File:** `server/src/emails/emails.service.ts`
- Find the post-SQL row mapping (where `from`, `fromName`, `to` etc. are decrypted using `EncryptionHelper.decrypt`)
- Add `cc: row.cc ? EncryptionHelper.decrypt(row.cc) : null` to ensure CC is decrypted before being sent to the frontend

**File:** `server/src/emails/emails.service.ts` (or the DTO mapper)
- Ensure `cc` is included in the API response object for the inbox endpoint

### Scenario B: CC is missing from the raw SQL response mapping

**File:** `server/src/emails/emails.service.ts`
- Confirm `e."cc"` is in the outer SELECT of the LATERAL subquery (already present at line 1114)
- Confirm the post-processing loop maps `cc` from the SQL row to the response DTO

### Scenario C: Old emails have null CC (backfill gap)

For emails synced before the #809 fix, CC will never be populated. Consider:
- Adding a background job to re-fetch CC headers for recent emails where `cc IS NULL`
- OR accepting this as a known limitation and relying on fresh syncs going forward

**Recommended scope for this issue: Fix Scenario A or B (the decryption/mapping gap) only. Backfill is a separate issue.**

---

## Files to Examine and Modify

| File | Action |
|------|--------|
| `server/src/emails/emails.service.ts` | Find the row-to-DTO mapper for `getInbox()` raw SQL; verify/add CC decryption |
| `server/src/emails/emails.service.ts` | Confirm `cc` is included in the API response shape |
| `server/src/emails/emails.service.spec.ts` | Add a test: inbox response includes decrypted `cc` when CC is present on the email |

---

## Testing Approach

1. **Unit test:** In `emails.service.spec.ts`, mock a raw SQL row with an encrypted `cc` value, assert the response DTO contains the decrypted CC.
2. **Integration test:** Send an email with CC to a test account, sync, fetch inbox, assert `cc` field is populated and readable.
3. **Manual verification:** Open an email known to have CC recipients (e.g., from the reporter's screenshots) and confirm CC appears in the thread item header.

---

## Notes

- This issue affects Reply All indirectly: if `email.cc` is null/encrypted on the frontend, `useEmailDetailReplies.ts` will not populate the CC field in the Reply All composer.
- The `email-thread.service.ts` uses TypeORM QueryBuilder (applies transformers) — so CC is correctly decrypted in the full thread view. This explains why CC may appear when opening an individual email detail but not in the inbox email list view.
- The `contacts.service.ts` query at line 579 uses QueryBuilder and selects `email.cc` — this path is also safe.
- Investigate whether the inline `EmailDetailHeader` (shown in split-view / compact mode) fetches the email via the inbox endpoint (raw SQL, potentially broken) vs. the thread endpoint (TypeORM, safe).
