# Plan: Fix keyCache race condition in EncryptionHelper (#1580)

> 🧘 Planned by Monk of Modularity — root cause analysis of recurring decryption failures

## Problem

Decryption is broken **again** despite `ENCRYPTION_KEY` being correctly set in the ECS task definition and Secrets Manager. PR #1581 (merged 05:56 UTC) added `tryDecrypt()`, a boot-check, and removed the default key fallback — but users still see encrypted hex values.

This is the **second** report today. It happens "every time infrastructure changes."

## Root Cause: Static `keyCache` Race Condition

`EncryptionHelper` is a **static class** with a `private static keyCache: Buffer | null = null`. The flow:

1. `getKey()` checks `keyCache` → if populated, returns immediately (never re-reads `process.env`)
2. Once `keyCache` is set, it's **permanent** for the lifetime of the process

### The Race

**Current startup sequence in `main.ts`:**

```
1. verifyEncryptionRoundTrip()     ← calls EncryptionHelper.encrypt() → getKey() → caches key
2. NestFactory.create(AppModule)   ← initializes ConfigModule, TypeORM, entities
```

**This works when `ENCRYPTION_KEY` is in `process.env` from the start** (ECS injects secrets as env vars before the process starts). But here's the critical insight:

### Why It _Actually_ Breaks

The boot-check at step 1 **succeeds** (proving the key IS in `process.env`). Yet TypeORM transformers return encrypted data. This means:

1. **The boot-check caches the CORRECT key** in `keyCache` at step 1
2. **TypeORM transformers use the same static `keyCache`** — so they should work too
3. But `tryDecrypt()` catches ALL errors and returns raw ciphertext

**The real bug is `tryDecrypt()` masking failures.** If decryption fails for ANY reason (corrupted data, encoding issues, auth tag mismatch from a different key used historically), `tryDecrypt()` silently returns the encrypted hex. Combined with the format-check heuristics (`includes(":")`, `parts.length !== 3`), some encrypted values may pass through undecrypted.

### Wait — But ALL Fields Are Showing Encrypted

If ALL fields show encrypted, there's a deeper issue. Let me trace more carefully:

**Possible scenario: Worker process vs Web process**

The ECS task definition has **two containers** or process types:

- Web server (`CMD ["node", "dist/main.js"]`)
- Worker (`WORKER_MODE=true`)

Both read `ENCRYPTION_KEY` from the same Secrets Manager secret. But what if:

- The web container's secret reference resolved correctly
- The worker's did not (or there's a timing issue with Secrets Manager rotation)

OR: **The CDK deployment updated the task definition but the ECS service hasn't restarted with the new definition yet.** Old tasks keep running with old env vars. The `verifyEncryptionRoundTrip()` only runs at boot — if the service wasn't force-restarted after the secret change, old containers keep running.

### The Architectural Root Cause

Regardless of the immediate trigger, the **static `keyCache`** design is fundamentally fragile:

1. **No invalidation mechanism** — once cached, the key is permanent
2. **No observability** — you can't tell WHICH key was cached or when
3. **`tryDecrypt()` masks all failures** — errors are logged but data flows through corrupted
4. **`process.env` is read exactly once** — if env vars change (secret rotation, container restart), the cache is stale
5. **Static class can't participate in NestJS DI** — can't be tested, mocked, or scoped properly
6. **TypeORM transformers are static by design** — they can't inject services, so they're stuck with the static helper

## The Fix

### Phase 1: Eliminate the keyCache race (CRITICAL)

**Replace static `keyCache` with lazy per-call key derivation that validates the key source.**

Since `scryptSync` is expensive (~100ms), we can't call it on every decrypt. But we CAN:

1. **Remove `keyCache` as a static field**
2. **Use a module-scoped singleton** that's initialized explicitly during app bootstrap
3. **Add a `keyVersion` or `keyFingerprint`** so we can detect when the key changes

```typescript
// encryption-key-provider.ts (NEW FILE)

import * as crypto from "crypto";
import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";

/**
 * Module-scoped encryption key provider.
 *
 * The key is derived ONCE via initialize() during bootstrap, AFTER we've
 * confirmed ENCRYPTION_KEY is in process.env. TypeORM transformers read
 * from this provider — if it hasn't been initialized, they throw instead
 * of silently using a wrong key.
 */
class EncryptionKeyProvider {
  private derivedKey: Buffer | null = null;
  private keyFingerprint: string | null = null;
  private initialized = false;

  /**
   * Initialize the key provider. Must be called exactly once during bootstrap,
   * AFTER verifying ENCRYPTION_KEY is present.
   */
  initialize(): void {
    const keyString = process.env.ENCRYPTION_KEY;
    if (!keyString) {
      throw new Error("FATAL: ENCRYPTION_KEY environment variable is not set.");
    }

    this.derivedKey = crypto.scryptSync(
      keyString,
      "salt",
      ENCRYPTION_CONSTANTS.KEY_LENGTH,
    );
    this.keyFingerprint = crypto
      .createHash("sha256")
      .update(this.derivedKey)
      .digest("hex")
      .slice(0, 8);
    this.initialized = true;
  }

  /**
   * Get the derived encryption key. Throws if not initialized.
   */
  getKey(): Buffer {
    if (!this.initialized || !this.derivedKey) {
      throw new Error(
        "FATAL: EncryptionKeyProvider.getKey() called before initialize(). " +
          "This means a TypeORM transformer fired before the encryption key was set up. " +
          "Check NestJS module initialization order.",
      );
    }
    return this.derivedKey;
  }

  getFingerprint(): string | null {
    return this.keyFingerprint;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// Module-scoped singleton — NOT a static class field
export const encryptionKeyProvider = new EncryptionKeyProvider();
```

### Phase 2: Update EncryptionHelper to use the provider

```typescript
// In encryption.helper.ts
import { encryptionKeyProvider } from "./encryption-key-provider";

class EncryptionHelper {
  private static algorithm = "aes-256-gcm";
  private static ivLength = ENCRYPTION_CONSTANTS.IV_LENGTH;
  // REMOVED: private static keyCache: Buffer | null = null;

  private static getKey(): Buffer {
    return encryptionKeyProvider.getKey(); // Throws if not initialized
  }
  // ... rest unchanged
}
```

### Phase 3: Update main.ts bootstrap sequence

```typescript
async function bootstrap() {
  // Step 1: Initialize the encryption key provider FIRST
  encryptionKeyProvider.initialize();

  // Step 2: Verify round-trip works
  verifyEncryptionRoundTrip();
  logger.log(
    `Encryption self-test passed (key fingerprint: ${encryptionKeyProvider.getFingerprint()})`,
  );

  // Step 3: NOW create the NestJS app (which loads TypeORM entities + transformers)
  const app = await NestFactory.create(AppModule);
  // ...
}
```

### Phase 4: Add observability

1. **Log the key fingerprint** at boot — so we can compare between deploys
2. **Add a `/health` detail** that includes encryption status (initialized: true/false, fingerprint)
3. **Make `tryDecrypt()` log the key fingerprint** when it catches an error — so we can tell if the wrong key was used

### Phase 5: Defensive — `tryDecrypt()` should detect "all failures" pattern

Add a counter to `tryDecrypt()`. If it fails N times in a row (configurable, default 5), escalate from warning to FATAL and crash the process. This prevents the "silently serving encrypted data" failure mode.

```typescript
static tryDecrypt(encryptedText: string | null | undefined): string | null {
  try {
    return EncryptionHelper.decrypt(encryptedText);
  } catch (error) {
    EncryptionHelper.consecutiveFailures++;
    if (EncryptionHelper.consecutiveFailures >= MAX_CONSECUTIVE_DECRYPT_FAILURES) {
      throw new Error(
        `FATAL: ${EncryptionHelper.consecutiveFailures} consecutive decryption failures. ` +
        `ENCRYPTION_KEY is likely wrong. Key fingerprint: ${encryptionKeyProvider.getFingerprint()}. ` +
        `Crashing to prevent serving encrypted data to users.`,
      );
    }
    logError("tryDecrypt: decryption failed — returning raw ciphertext", ...);
    return encryptedText ?? null;
  }
}
```

On success, reset the counter:

```typescript
EncryptionHelper.consecutiveFailures = 0;
```

## Files to Change

| File                                                  | Change                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `server/src/encryption/encryption-key-provider.ts`    | **NEW** — singleton key provider with explicit init                                                                |
| `server/src/encryption/encryption.helper.ts`          | Remove `keyCache`, use `encryptionKeyProvider.getKey()`, add consecutive failure circuit-breaker to `tryDecrypt()` |
| `server/src/encryption/encryption-boot-check.ts`      | Log key fingerprint on success                                                                                     |
| `server/src/main.ts`                                  | Call `encryptionKeyProvider.initialize()` before `verifyEncryptionRoundTrip()`                                     |
| `server/src/encryption/encryption.helper.spec.ts`     | Update tests for new key provider pattern                                                                          |
| `server/src/encryption/encryption-boot-check.spec.ts` | Update if exists                                                                                                   |

## Why This Fixes the Recurring Issue

1. **Explicit initialization** — the key provider MUST be initialized before any transformer can use it. No more "maybe `process.env` was ready, maybe not"
2. **Fail-loud** — if a transformer fires before init, it throws with a clear message (not a silent wrong-key decryption)
3. **Observable** — key fingerprint in logs lets us instantly compare "which key did this process use?" across deploys
4. **Circuit-breaker** — consecutive failures crash the process instead of silently serving encrypted data
5. **No NestJS DI coupling for transformers** — TypeORM column transformers can't inject services (they're static), so we use a module-scoped singleton that's initialized before NestJS bootstraps

## Risk Assessment

- **Low risk**: The key derivation logic is unchanged (same `scryptSync` with same salt)
- **Medium risk**: The circuit-breaker could crash the process on legitimate mixed-encryption data (mitigation: set threshold high enough, e.g., 10)
- **No data migration needed**: This is a code-path change, not a data format change

## Immediate Action (Operations)

While this code fix is implemented, **force restart the ECS service** to ensure all containers pick up the latest task definition with the correct `ENCRYPTION_KEY`:

```bash
aws ecs update-service --cluster bearlymail --service bearlymail-web --force-new-deployment
aws ecs update-service --cluster bearlymail --service bearlymail-worker --force-new-deployment
```

This should fix the immediate issue. The code fix prevents recurrence.
