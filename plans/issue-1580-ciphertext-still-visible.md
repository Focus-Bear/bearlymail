# Plan: Fix #1580 — Email body still shows raw ciphertext (third investigation)

> 🧘 Planned by Monk of Modularity — third-pass root cause analysis after two merged fixes still leave the bug open

## Context

Two previous fix PRs have been merged:
- **PR #1581** (merged 2026-03-30 05:56Z): Removed default key fallback, added boot-check, introduced `tryDecrypt()`
- **PR #1599** (merged 2026-03-31 01:51Z): Replaced static `keyCache` with `EncryptionKeyProvider` singleton, added circuit-breaker (10 consecutive failures → crash)

**The bug persists.** CloudWatch shows encryption self-test passes (fingerprint `2a7ca482`), but email bodies render as raw ciphertext in the detail pane.

## Root Cause Analysis

### Finding 1: Circuit-breaker never trips — null columns reset the counter

`tryDecrypt()` has a circuit-breaker that crashes after 10 **consecutive** failures. But `EncryptionHelper.decrypt()` has early-return paths for null/empty values that count as **successes** and reset the counter:

```typescript
// In decrypt():
if (!encryptedText) return null;  // ← returns without throwing (success path)
```

When TypeORM hydrates an `Email` entity, it calls `encryptedColumnTransformer.from()` for every column — including the ~30 nullable fields. The interleaving goes:

```
body (encrypted, FAILS)        → consecutiveFailures = 1
htmlBody (null)                 → decrypt returns null → consecutiveFailures = 0  ← RESET!
subject (encrypted, FAILS)     → consecutiveFailures = 1
to (null)                      → consecutiveFailures = 0  ← RESET!
...
```

**The counter never reaches 10.** Every null column resets it. The circuit-breaker is effectively dead for entity-level decryption.

### Finding 2: The real failure mode — data encrypted with a different key

The boot self-test proves the **current key** works for encrypt→decrypt round-trips. But it does NOT prove the current key can decrypt **existing data in the database**.

If `ENCRYPTION_KEY` was ever:
1. Missing (old code fell back to `"default-key-change-in-production-32chars!!"`)
2. Changed/rotated
3. Different between web and worker containers

…then existing rows are encrypted with Key A but the current process has Key B. Every `tryDecrypt()` call fails silently and returns raw ciphertext.

**Evidence supporting this**: The issue says ALL encrypted fields show ciphertext, not just body. The `from`, `subject`, `summary` etc. in the detail pane would also be affected — but the inbox list might show decrypted data because `runInboxQuery` fetches different (newer?) emails for the list view representative.

### Finding 3: `tryDecrypt` fail-open design is the proximate cause

`tryDecrypt` was explicitly designed to return raw ciphertext on failure (to avoid crashing). This was correct during the plaintext→encrypted migration. But now that ALL data is encrypted, fail-open means **silently serving ciphertext to users** — a P0 data exposure risk.

### Finding 4: SQL bug in correspondent matching (bonus)

`email-inbox-query.helpers.ts` line 98:
```sql
AND LOWER(cor."from") != LOWER(u.email)
```

`cor."from"` is AES-GCM encrypted ciphertext. `LOWER()` on ciphertext is meaningless — this comparison never correctly filters out the user's own emails from the correspondent subquery. This is a separate bug but worth fixing.

## Fix Plan

### Step 1: Add boot-time data validation (CRITICAL)

The boot-check currently only does a round-trip self-test with freshly encrypted data. Add a **real data validation** that reads an actual encrypted row from the database and verifies it can be decrypted:

**File: `server/src/encryption/encryption-boot-check.ts`**

Add a new function `verifyExistingDataDecryption(dataSource: DataSource)`:
1. Query one email with a non-null `subject` (small encrypted field): `SELECT subject FROM emails WHERE subject IS NOT NULL LIMIT 1`
2. Attempt `EncryptionHelper.decrypt(subject)` (the throwing version, NOT `tryDecrypt`)
3. If decryption fails → **CRASH with clear error**: "FATAL: Cannot decrypt existing data. Current key fingerprint: X. Data was likely encrypted with a different key."
4. If no rows exist → skip (fresh database)
5. Log success with the decrypted field length (not content) for confirmation

Call this in `main.ts` after `verifyEncryptionRoundTrip()` but before `NestFactory.create()`.

### Step 2: Fix the circuit-breaker null-reset bug

**File: `server/src/encryption/encryption.helper.ts`**

Change `tryDecrypt()` to only reset the counter when decrypting actual ciphertext (not null/empty/plaintext):

```typescript
static tryDecrypt(encryptedText: string | null | undefined): string | null {
  // Null/empty → no decryption needed, don't count as success or failure
  if (!encryptedText) return null;

  // Plaintext detection (no colons, wrong part count, wrong IV length)
  // These are "not encrypted" — don't affect the circuit breaker
  if (!encryptedText.includes(":")) return encryptedText;
  const parts = encryptedText.split(":");
  if (parts.length !== 3) return encryptedText;
  const ivLength = Buffer.from(parts[0], "hex").length;
  if (ivLength !== ENCRYPTION_CONSTANTS.IV_LENGTH) return encryptedText;

  // This IS ciphertext — attempt decryption
  try {
    const result = EncryptionHelper.decrypt(encryptedText);
    EncryptionHelper.consecutiveFailures = 0;  // Real success
    return result;
  } catch (error) {
    EncryptionHelper.consecutiveFailures++;
    if (EncryptionHelper.consecutiveFailures >= MAX_CONSECUTIVE_DECRYPT_FAILURES) {
      throw new Error(
        `FATAL: ${EncryptionHelper.consecutiveFailures} consecutive decryption failures. ` +
        `Key fingerprint: ${encryptionKeyProvider.getFingerprint()}. ` +
        `Crashing to prevent serving encrypted data.`,
      );
    }
    logError(
      `tryDecrypt: failure ${EncryptionHelper.consecutiveFailures}/${MAX_CONSECUTIVE_DECRYPT_FAILURES}`,
      error instanceof Error ? error : new Error(String(error)),
    );
    return encryptedText ?? null;
  }
}
```

**Key change**: Null values and plaintext pass-through DON'T reset the counter. Only successful decryption of actual ciphertext resets it. This means if the key is wrong, the circuit breaker will trip after 10 actual ciphertext decryption failures.

### Step 3: Lower the circuit-breaker threshold

Change `MAX_CONSECUTIVE_DECRYPT_FAILURES` from 10 to 3. With the null-reset fix above, 3 consecutive real ciphertext failures is a strong signal of a key mismatch. A single email entity has 14 encrypted columns — if 3 fail in a row, the key is definitely wrong.

### Step 4: Add key-mismatch diagnostic endpoint

**File: `server/src/encryption/encryption.module.ts`** or new `encryption.controller.ts`

Add a diagnostic endpoint (admin-only):
```
GET /admin/encryption/status
```
Response:
```json
{
  "initialized": true,
  "keyFingerprint": "2a7ca482",
  "sampleDecryptResult": "success" | "failure",
  "failureCount": 0,
  "uptime": "2h 15m"
}
```

This endpoint attempts to decrypt one actual database row and reports whether it succeeded. This gives immediate visibility without checking logs.

### Step 5: Fix the `LOWER(cor."from")` SQL bug

**File: `server/src/emails/email-inbox-query.helpers.ts`** line 98

The correspondent subquery compares `LOWER(cor."from")` with `LOWER(u.email)`. But `cor."from"` is encrypted. Options:
1. **Use the `senderEmailHmac` column** instead — it's the HMAC of the sender email, designed for exactly this kind of indexed lookup
2. Compare against the user's email HMAC: compute `hmacEmail(u.email)` and compare with `cor.senderEmailHmac`

Replace:
```sql
AND LOWER(cor."from") != LOWER(u.email)
```
With:
```sql
AND cor."senderEmailHmac" != (SELECT "senderEmailHmac" FROM emails WHERE "from" = u.email LIMIT 1)
```

Or better — compute the HMAC in application code and pass it as a parameter:
```sql
AND cor."senderEmailHmac" IS DISTINCT FROM $N
```

**Also fix the same bug in `server/src/auto-responder/auto-responder-analytics.service.ts` line 252.**

### Step 6: Frontend defensive rendering

**File: `client/src/components/email-detail/ThreadItemBody.tsx`**

Add a ciphertext detection guard before rendering:

```typescript
function looksLikeCiphertext(text: string): boolean {
  // AES-GCM ciphertext format: hex:hex:hex with each segment being 32+ chars
  return /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]{32,}$/i.test(text);
}

// In the component:
if (looksLikeCiphertext(body) || (htmlBody && looksLikeCiphertext(htmlBody))) {
  return (
    <div style={{ padding: theme.spacing.md, color: theme.colors.text.secondary }}>
      ⚠️ This email's content could not be decrypted. Please contact support.
    </div>
  );
}
```

This prevents raw ciphertext from ever being displayed to users, even if the backend fails silently.

## Files to Change

| File | Change | Risk |
|------|--------|------|
| `server/src/encryption/encryption-boot-check.ts` | Add `verifyExistingDataDecryption()` — query real DB row, decrypt, crash if fails | Medium — requires DataSource injection |
| `server/src/main.ts` | Call `verifyExistingDataDecryption()` after round-trip check | Low |
| `server/src/encryption/encryption.helper.ts` | Fix tryDecrypt circuit-breaker null-reset bug; lower threshold to 3 | Low |
| `server/src/emails/email-inbox-query.helpers.ts` | Fix `LOWER(cor."from")` SQL bug — use senderEmailHmac | Medium — changes query behaviour |
| `server/src/auto-responder/auto-responder-analytics.service.ts` | Same LOWER fix | Medium |
| `client/src/components/email-detail/ThreadItemBody.tsx` | Add ciphertext detection guard | Low |
| `server/src/encryption/encryption.controller.ts` | NEW — admin diagnostic endpoint | Low |

## Deployment Notes

1. **Before deploying**: Verify `ENCRYPTION_KEY` in Secrets Manager matches what was used when data was originally encrypted
2. **If key mismatch is confirmed**: A data migration script is needed to re-encrypt all data. This is a separate effort — this plan focuses on detection and prevention.
3. **Force restart ECS** after deploy to ensure all containers pick up the new code:
   ```bash
   aws ecs update-service --cluster bearlymail --service bearlymail-web --force-new-deployment
   aws ecs update-service --cluster bearlymail --service bearlymail-worker --force-new-deployment
   ```

## Priority Order

1. **Step 1** (boot-time data validation) — Prevents the app from starting with a wrong key
2. **Step 2+3** (circuit-breaker fix) — Crashes the process when decryption is failing en masse instead of silently serving ciphertext
3. **Step 6** (frontend guard) — Prevents ciphertext display even if backend fails
4. **Step 4** (diagnostic endpoint) — Observability
5. **Step 5** (SQL LOWER fix) — Correctness fix, not directly related to #1580
