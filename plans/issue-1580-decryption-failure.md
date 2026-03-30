# Plan: Fix Total Decryption Failure (#1580)

**Issue:** #1580 — Email content showing encrypted/hashed values instead of decrypted text
**Priority:** P0 — app is completely unusable
**Author:** Monk of Modularity 🧘

## Root Cause Analysis

### The Symptom
All encrypted fields display raw ciphertext:
- Email subjects: plain hex strings (e.g. `604ff21a0363b70291bf48b23a1...`)
- Email bodies: `iv:authTag:encrypted` format (e.g. `69c82df2d48e102c6f76f4aeee51033c:e1716b5489c1433e...`)
- Categories in settings: encrypted contextValue strings

### The Mechanism
BearlyMail uses AES-256-GCM encryption at rest. All encryption/decryption flows through `EncryptionHelper` (static class in `server/src/encryption/encryption.helper.ts`).

The decrypt function has a **silent failure catch block** (line ~83):
```typescript
catch (error) {
  logError("Decryption error", ...);
  // Return original if decryption fails (might be plaintext from before encryption)
  return encryptedText;  // ← Returns raw ciphertext to the caller
}
```

This means when decryption fails, the raw encrypted string is passed through as if it were the plaintext value. The API serves it to the frontend, which displays it.

### Why EVERYTHING Is Broken
Both decryption paths use the same `EncryptionHelper.getKey()`:

1. **TypeORM column transformers** (`encryptedColumnTransformer`) — used by `findOne()`, `find()`, etc. This affects individual email views AND the categories endpoint (`GET /context`).
2. **Manual decryption** (`decryptRawEmailRow`) — used by the raw SQL inbox query. This affects the email list.

Since both paths fail, the common cause must be at the **key derivation level**.

### Most Likely Root Cause: ENCRYPTION_KEY Env Var Missing or Changed

`EncryptionHelper.getKey()` reads from `process.env.ENCRYPTION_KEY`:
```typescript
const keyString = process.env.ENCRYPTION_KEY || "default-key-change-in-production-32chars!!";
this.keyCache = crypto.scryptSync(keyString, "salt", 32);
```

If `ENCRYPTION_KEY` is absent, empty, or different from the key that originally encrypted the data, the derived key will be wrong and every `decrypt()` call fails silently.

**How this could happen:**
- AWS Secrets Manager secret was rotated, deleted, or the JSON structure changed
- A CDK deployment created new ECS tasks that failed to inject the secret
- The secret JSON key name changed (e.g. `ENCRYPTION_KEY` → `encryption_key`)
- Recent CDK changes (cyclic dependency fix in `#1549`, RDS Proxy SG description fix in `#1553`) triggered a stack redeployment that disrupted secrets injection

**Critical: There is NO startup validation.** The `env.validation.ts` schema does NOT include `ENCRYPTION_KEY`. The app starts happily without it and serves encrypted data to users.

### The Key Is Cached Once
`EncryptionHelper.keyCache` is a static property — once the first `getKey()` call resolves (correctly or incorrectly), that key is used for the entire process lifetime. A restart with the correct key would fix the issue.

## Fix Steps

### Phase 1: Immediate — Verify and Restore the Key (Operations)

**Step 1.1: Check ECS Task Environment**
- SSH/exec into a running ECS task and verify `echo $ENCRYPTION_KEY` is set and non-empty
- If empty or missing: the secret injection is broken → check Secrets Manager

**Step 1.2: Verify Secrets Manager**
- Check the AppSecrets secret in AWS Secrets Manager
- Verify the JSON contains `"ENCRYPTION_KEY": "<value>"` with correct key name and value
- Compare with any backup/known value

**Step 1.3: Restart ECS Tasks**
- Force a new deployment to restart all tasks with fresh secrets injection
- Verify decryption works after restart

### Phase 2: Code Fix — Fail Fast on Missing Key

**File: `server/src/encryption/encryption.helper.ts`**

**Change 2.1: Remove default fallback key — fail fast if ENCRYPTION_KEY is missing**
```typescript
// BEFORE:
const keyString = process.env.ENCRYPTION_KEY || "default-key-change-in-production-32chars!!";

// AFTER:
const keyString = process.env.ENCRYPTION_KEY;
if (!keyString) {
  throw new Error(
    'FATAL: ENCRYPTION_KEY environment variable is not set. ' +
    'All data at rest is encrypted — the app cannot function without it. ' +
    'Set ENCRYPTION_KEY in your environment or Secrets Manager.'
  );
}
```

This ensures the app crashes at startup (on first DB read) rather than silently serving encrypted data.

**Change 2.2: Add startup validation in env.validation.ts**
```typescript
// In EnvironmentVariables class:
@IsString()
@MinLength(16, { message: 'ENCRYPTION_KEY must be at least 16 characters' })
ENCRYPTION_KEY: string;
```

This makes ConfigModule reject the app at bootstrap if the key is missing.

**File: `server/src/encryption/encryption.service.ts`**

**Change 2.3: Same fail-fast for the injectable service**
```typescript
// BEFORE:
const keyString = this.configService.get<string>("ENCRYPTION_KEY") || "default-key-change-in-production-32chars!!";

// AFTER:
const keyString = this.configService.get<string>("ENCRYPTION_KEY");
if (!keyString) {
  throw new Error('FATAL: ENCRYPTION_KEY is not configured.');
}
```

### Phase 3: Defensive Improvements

**Change 3.1: Add a health check that verifies decryption**

Create a self-test in the encryption module that encrypts and decrypts a known string at startup. If the round-trip fails, the app should refuse to start.

**File: `server/src/encryption/encryption-boot-check.ts` (new)**
```typescript
import { EncryptionHelper } from './encryption.helper';

const TEST_PLAINTEXT = 'bearlymail-encryption-boot-check';

export function verifyEncryptionRoundTrip(): void {
  const encrypted = EncryptionHelper.encrypt(TEST_PLAINTEXT);
  const decrypted = EncryptionHelper.decrypt(encrypted);
  if (decrypted !== TEST_PLAINTEXT) {
    throw new Error(
      'FATAL: Encryption round-trip self-test failed. ' +
      'ENCRYPTION_KEY may be incorrect or corrupted.'
    );
  }
}
```

Call `verifyEncryptionRoundTrip()` in `main.ts` before `app.listen()`.

**Change 3.2: Improve decrypt error handling — don't silently swallow key failures**

The current catch block returns the ciphertext. For production, consider logging to an external monitoring service (PostHog/Sentry) with high severity when decryption fails, rather than silently passing through.

## Affected Files

| File | Change |
|------|--------|
| `server/src/encryption/encryption.helper.ts` | Remove default key fallback, fail fast |
| `server/src/encryption/encryption.service.ts` | Remove default key fallback, fail fast |
| `server/src/config/env.validation.ts` | Add ENCRYPTION_KEY as required |
| `server/src/encryption/encryption-boot-check.ts` | New: round-trip self-test |
| `server/src/main.ts` | Call boot check before listen |
| `server/src/encryption/encryption.helper.spec.ts` | Update tests for new behavior |
| `server/src/encryption/encryption.service.spec.ts` | Update tests for new behavior |
| `.github/workflows/deploy.yml` | Already has `ENCRYPTION_KEY` in smoke test — good |

## Testing

1. **Unit test:** Verify `EncryptionHelper.getKey()` throws when `ENCRYPTION_KEY` is unset
2. **Unit test:** Verify `verifyEncryptionRoundTrip()` passes with correct key, throws with wrong key
3. **Integration test:** Start app without `ENCRYPTION_KEY` → app should fail to start
4. **Smoke test:** Start app with `ENCRYPTION_KEY` → encrypt/decrypt round-trip passes
5. **Manual verification:** After restoring the key in production, verify emails display correctly

## Risk Assessment

- **Phase 1** (operations): Zero code risk — just verify and restart
- **Phase 2** (fail-fast): Low risk — changes failure mode from "silently broken" to "loudly broken". Existing deployments with correct key are unaffected. CI smoke test already provides ENCRYPTION_KEY.
- **Phase 3** (boot check): Low risk — adds a startup gate that only fails if encryption is actually broken

## Notes

- The `keyCache` static property means a restart is required to pick up a new key
- The `"salt"` parameter in `scryptSync` is hardcoded — this is fine for the current design but should eventually be improved
- There are two parallel encryption implementations (`EncryptionHelper` static + `EncryptionService` injectable) — they should eventually be unified, but that's a separate issue
