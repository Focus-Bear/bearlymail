import * as crypto from "crypto";

import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";
import { captureGlobalEvent } from "../error-tracking/error-tracking-setup";
// `category-format.util` is intentionally entity-free so we can import it here
// without re-creating the cycle that issue #1700 fixed (see file header).
import { parseCategoryName } from "../utils/category-format.util";
import { logError } from "../utils/logger";
import { encryptionKeyProvider } from "./encryption-key-provider";
import { getRequestDecryptContext } from "./user-encryption-context";

const MAX_CONSECUTIVE_DECRYPT_FAILURES = 3;
const DECRYPT_FAILURE_EVENT_THROTTLE_MS = 60_000;

/**
 * Static encryption helper for use in TypeORM column transformers.
 * Delegates key management to encryptionKeyProvider — throws if accessed before
 * encryptionKeyProvider.initialize() has been called in main.ts.
 *
 * When KMS envelope encryption is enabled (`KMS_KEY_ID` set), `getKey()` returns the
 * per-user key from AsyncLocalStorage when available, otherwise falls back to the global key.
 * `getGlobalKey()` always returns the global derived key (used for the User entity itself).
 */
class EncryptionHelper {
  private static algorithm = "aes-256-gcm";
  private static ivLength = ENCRYPTION_CONSTANTS.IV_LENGTH;
  /**
   * Global fallback failure counter for worker/non-request contexts.
   * Request contexts use a per-request counter via AsyncLocalStorage (see
   * getRequestDecryptContext()) to prevent cross-tenant DoS.
   */
  static globalConsecutiveFailures = 0;
  private static lastDecryptFailureEventMs = 0;

  private static getKey(): Buffer {
    return encryptionKeyProvider.getKey();
  }

  private static getGlobalKey(): Buffer {
    return encryptionKeyProvider.getGlobalKey();
  }

  /**
   * Throwing counterpart of `silentDecryptWithKey`. Surfaces the underlying
   * crypto error (auth tag mismatch, invalid key length, etc.) on failure.
   * Use in boot checks and admin diagnostics where the specific error must
   * bubble up. Caller is responsible for shape validation — use
   * `looksLikeEncryptedPayload` first if the input might be plaintext.
   */
  static decryptWithExplicitKey(
    encryptedText: string,
    key: Buffer,
  ): string {
    const parts = encryptedText.split(":");
    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(
      EncryptionHelper.algorithm,
      key,
      iv,
    ) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  /**
   * Try to decrypt with an explicit key. Returns null on any failure (wrong key,
   * malformed shape, IV length mismatch). Does NOT log — use this in code that
   * expects many decrypt failures (e.g. the re-encryption job, where every legacy
   * row fails its first decrypt attempt before falling back to the global key).
   *
   * Returns the original input only when it does not look like ciphertext at all
   * (no separator / wrong IV length) — same convention as `tryDecrypt`.
   */
  static silentDecryptWithKey(
    encryptedText: string | null | undefined,
    key: Buffer,
  ): string | null {
    if (!encryptedText) return null;
    if (!encryptedText.includes(":")) return encryptedText;
    const parts = encryptedText.split(":");
    if (parts.length !== 3) return encryptedText;
    const iv = Buffer.from(parts[0], "hex");
    if (iv.length !== EncryptionHelper.ivLength) return encryptedText;
    try {
      return EncryptionHelper.decryptWithExplicitKey(encryptedText, key);
    } catch {
      return null;
    }
  }

  static encrypt(text: string | null | undefined): string | null {
    if (!text) return null;

    const key = this.getKey();
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(
        this.algorithm,
        key,
        iv,
      ) as crypto.CipherGCM;

      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      // Combine IV, authTag, and encrypted data
      return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
    } catch (error) {
      logError(
        "Encryption error",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error("Failed to encrypt data");
    }
  }

  static decrypt(encryptedText: string | null | undefined): string | null {
    if (!encryptedText) return null;

    // Check if this is already decrypted (for backwards compatibility during migration)
    if (!encryptedText.includes(":")) {
      return encryptedText;
    }

    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      // Not in expected format, might be plaintext
      return encryptedText;
    }

    const key = this.getKey();

    try {
      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, "hex");
      // Validate IV length matches expected size — strings with 2 colons (e.g. timestamps
      // like "12:30:45") would otherwise reach createDecipheriv and throw
      // "Invalid initialization vector"
      if (iv.length !== this.ivLength) {
        return encryptedText;
      }
      const authTag = Buffer.from(authTagHex, "hex");

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        key,
        iv,
      ) as crypto.DecipherGCM;
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      // Do NOT call logError() here. The hot caller is tryDecrypt(), which
      // catches this throw and is invoked once per encrypted column per row
      // hydrated by TypeORM. logError forwards to PostHog, which previously
      // captured 250k+ events from a single user with bad ciphertext (see
      // PR #2036, where the same pattern was removed from tryDecrypt's own
      // catch). tryDecrypt has its own throttled `captureGlobalEvent` for
      // telemetry and a `console.warn` for human log readers; the other
      // direct callers of decrypt() (boot checks, admin diagnostics) propagate
      // the error and can decide their own logging.
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Decrypt using a passphrase with the same scrypt derivation as the running server key.
   * For admin diagnostics only — does not affect the tryDecrypt circuit-breaker.
   */
  static decryptWithKeyString(
    encryptedText: string | null | undefined,
    keyMaterial: string,
  ): string | null {
    if (!encryptedText) return null;

    if (!encryptedText.includes(":")) {
      return encryptedText;
    }

    const parts = encryptedText.split(":");
    if (parts.length !== 3) {
      return encryptedText;
    }

    const key = crypto.scryptSync(
      keyMaterial,
      "salt",
      ENCRYPTION_CONSTANTS.KEY_LENGTH,
    );

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, "hex");
    if (iv.length !== EncryptionHelper.ivLength) {
      return encryptedText;
    }
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(
      EncryptionHelper.algorithm,
      key,
      iv,
    ) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Safe decrypt — catches errors and returns the raw ciphertext instead of throwing.
   * Use this in data-mapping contexts (TypeORM transformers, row mappers, processors)
   * where a single corrupted row should not crash the entire request or worker.
   *
   * Circuit-breaker: after MAX_CONSECUTIVE_DECRYPT_FAILURES consecutive ciphertext
   * failures, throws a fatal error to crash the process rather than silently serving
   * encrypted data.
   *
   * Null/empty values and plaintext pass-through do NOT affect the failure counter —
   * only actual ciphertext decryption attempts count. This prevents nullable columns
   * from resetting the counter between real failures.
   *
   * Keep the throwing `decrypt()` for boot checks and token paths where failure must be fatal.
   */
  /**
   * True when the string matches stored AES-256-GCM column shape (`ivHex:tagHex:cipherHex`).
   * Used to treat tryDecrypt fail-open ciphertext as absent plaintext (e.g. inbox category bucketing).
   */
  static looksLikeEncryptedPayload(text: string): boolean {
    if (!text || !text.includes(":")) return false;
    const parts = text.split(":");
    if (parts.length !== 3) return false;
    try {
      const iv = Buffer.from(parts[0], "hex");
      return iv.length === this.ivLength;
    } catch {
      return false;
    }
  }

  static tryDecrypt(encryptedText: string | null | undefined): string | null {
    if (!encryptedText) return null;

    if (!encryptedText.includes(":")) return encryptedText;
    const parts = encryptedText.split(":");
    if (parts.length !== 3) return encryptedText;
    const ivLength = Buffer.from(parts[0], "hex").length;
    if (ivLength !== EncryptionHelper.ivLength) return encryptedText;

    try {
      const result = EncryptionHelper.decrypt(encryptedText);
      EncryptionHelper.resetFailureCount();
      return result;
    } catch (primaryError) {
      // When KMS is enabled, data may have been written with the global key (by worker
      // processes or before KMS was enabled). Try the global key as a fallback.
      if (process.env.KMS_KEY_ID) {
        try {
          const globalKey = encryptionKeyProvider.getGlobalKey();
          const result = EncryptionHelper.decryptWithExplicitKey(
            encryptedText,
            globalKey,
          );
          EncryptionHelper.resetFailureCount();
          return result;
        } catch {
          // Global key also failed — fall through to error handling
        }
      }

      const failures = EncryptionHelper.incrementFailureCount();

      const now = Date.now();
      if (
        now - EncryptionHelper.lastDecryptFailureEventMs >
        DECRYPT_FAILURE_EVENT_THROTTLE_MS
      ) {
        EncryptionHelper.lastDecryptFailureEventMs = now;
        captureGlobalEvent("encryption-decrypt-failure", {
          error:
            primaryError instanceof Error
              ? primaryError.message
              : String(primaryError),
          ciphertextPrefix: encryptedText
            ? encryptedText.slice(
                0,
                ENCRYPTION_CONSTANTS.CIPHERTEXT_DEBUG_PREFIX_LENGTH,
              )
            : "(null)",
          consecutiveFailures: failures,
          keyFingerprint: encryptionKeyProvider.getFingerprint(),
        });
      }

      if (failures >= MAX_CONSECUTIVE_DECRYPT_FAILURES) {
        throw new Error(
          `FATAL: ${failures} consecutive decryption failures. ` +
            `ENCRYPTION_KEY is likely wrong or rotated mid-process. ` +
            `Key fingerprint: ${encryptionKeyProvider.getFingerprint()}. ` +
            `Crashing to prevent serving encrypted data to users.`,
        );
      }

      // Use a plain console.warn rather than logError() — logError forwards every
      // call to PostHog, and a single corrupted column can fire this branch many
      // times per request (one per row × one per encrypted column), which has
      // exhausted the error-tracking quota in the past. The throttled
      // captureGlobalEvent above is the canonical telemetry signal; this line is
      // for human log readers only.
      console.warn(
        `tryDecrypt: decryption failed (failure ${failures}/${MAX_CONSECUTIVE_DECRYPT_FAILURES}) — returning raw ciphertext: ${
          primaryError instanceof Error
            ? primaryError.message
            : String(primaryError)
        }`,
      );
      return encryptedText ?? null;
    }
  }

  private static resetFailureCount(): void {
    const ctx = getRequestDecryptContext();
    if (ctx) {
      ctx.decryptFailures = 0;
    } else {
      EncryptionHelper.globalConsecutiveFailures = 0;
    }
  }

  private static incrementFailureCount(): number {
    const ctx = getRequestDecryptContext();
    if (ctx) {
      ctx.decryptFailures++;
      return ctx.decryptFailures;
    }
    EncryptionHelper.globalConsecutiveFailures++;
    return EncryptionHelper.globalConsecutiveFailures;
  }

  /**
   * Encrypt using the global derived key (ENCRYPTION_KEY), regardless of any per-user
   * KMS key in AsyncLocalStorage. Used for User entity fields to avoid chicken-and-egg
   * with JWT authentication (which loads the User before the interceptor sets the ALS key).
   */
  static encryptWithGlobalKey(text: string | null | undefined): string | null {
    if (!text) return null;
    const key = this.getGlobalKey();
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(
        this.algorithm,
        key,
        iv,
      ) as crypto.CipherGCM;
      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag();
      return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
    } catch (error) {
      logError(
        "Encryption error (global key)",
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error("Failed to encrypt data");
    }
  }

  /** Decrypt using the global key, fail-open (same semantics as tryDecrypt). */
  static tryDecryptWithGlobalKey(
    encryptedText: string | null | undefined,
  ): string | null {
    if (!encryptedText) return null;
    if (!encryptedText.includes(":")) return encryptedText;
    const parts = encryptedText.split(":");
    if (parts.length !== 3) return encryptedText;
    const iv = Buffer.from(parts[0], "hex");
    if (iv.length !== EncryptionHelper.ivLength) return encryptedText;

    try {
      return EncryptionHelper.decryptWithExplicitKey(
        encryptedText,
        encryptionKeyProvider.getGlobalKey(),
      );
    } catch (error) {
      // Plain console.warn instead of logError() — this is the fail-open path
      // for the User entity's per-column transformer, so it runs on every
      // authenticated request and a single bad ciphertext can fire it many
      // times per second. logError forwards to PostHog and exhausts the
      // error-tracking quota; the warn line is for human log readers only.
      // Mirrors the analogous decision in tryDecrypt() above. Pass the Error
      // as a second arg so the stack trace is preserved in CloudWatch (vs.
      // stringifying just the message).
      console.warn(
        "tryDecryptWithGlobalKey: decryption failed — returning raw ciphertext",
        error,
      );
      return encryptedText;
    }
  }

  static hashEmail(email: string): string {
    if (!email) return "";
    return crypto
      .createHash("sha256")
      .update(email.toLowerCase().trim())
      .digest("hex");
  }
}

/**
 * TypeORM transformer for encrypted columns.
 * Uses tryDecrypt on read so a single corrupted column does not crash entity hydration.
 */
export const encryptedColumnTransformer = {
  to: (value: string | null | undefined): string | null =>
    EncryptionHelper.encrypt(value),
  from: (value: string | null | undefined): string | null =>
    EncryptionHelper.tryDecrypt(value),
};

/**
 * For email addresses - we need to query by them, so we store:
 * - emailHash: SHA-256 hash for querying (not encrypted)
 * - email: encrypted actual email
 *
 * Uses tryDecrypt on read so a corrupted email column does not crash entity hydration.
 */
export const emailTransformer = {
  to: (value: string | null | undefined): string | null =>
    EncryptionHelper.encrypt(value),
  from: (value: string | null | undefined): string | null =>
    EncryptionHelper.tryDecrypt(value),
};

/**
 * TypeORM transformer for encrypted JSON fields.
 * Encrypts arbitrary JSON data on write, decrypts on read.
 * Uses tryDecrypt on read so a corrupted JSON column does not crash entity hydration.
 */
export const encryptedJsonTransformer = {
  to: (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const stringified = JSON.stringify(value);
    return EncryptionHelper.encrypt(stringified);
  },
  from: (value: string | null | undefined): unknown => {
    const decrypted = EncryptionHelper.tryDecrypt(value);
    if (!decrypted) return null;
    try {
      return JSON.parse(decrypted);
    } catch (err) {
      logError(
        "Failed to parse decrypted JSON",
        err instanceof Error ? err : new Error(String(err)),
      );
      return null;
    }
  },
};

/**
 * TypeORM transformers for User entity fields.
 *
 * Always use the global ENCRYPTION_KEY — never the per-user KMS key.
 * Reason: the JWT guard loads the User entity before the UserEncryptionInterceptor
 * sets the per-user key in AsyncLocalStorage, causing a chicken-and-egg failure.
 */
export const globalEncryptedColumnTransformer = {
  to: (value: string | null | undefined): string | null =>
    EncryptionHelper.encryptWithGlobalKey(value),
  from: (value: string | null | undefined): string | null =>
    EncryptionHelper.tryDecryptWithGlobalKey(value),
};

export const globalEmailTransformer = {
  to: (value: string | null | undefined): string | null =>
    EncryptionHelper.encryptWithGlobalKey(value),
  from: (value: string | null | undefined): string | null =>
    EncryptionHelper.tryDecryptWithGlobalKey(value),
};

export const globalEncryptedJsonTransformer = {
  to: (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    return EncryptionHelper.encryptWithGlobalKey(JSON.stringify(value));
  },
  from: (value: string | null | undefined): unknown => {
    const decrypted = EncryptionHelper.tryDecryptWithGlobalKey(value);
    if (!decrypted) return null;
    try {
      return JSON.parse(decrypted);
    } catch (err) {
      logError(
        "Failed to parse decrypted JSON (global key)",
        err instanceof Error ? err : new Error(String(err)),
      );
      return null;
    }
  },
};

/**
 * Shared helper: decrypt an encrypted contextValue and extract the display name.
 *
 * EMAIL_CATEGORY contextValue is stored as "Category Name - optional description"
 * (encrypted at rest). This helper decrypts and returns only the name part.
 *
 * Usage:
 *   decryptContextValue(row.category)       // → "Newsletters" | null
 *   decryptContextValue(ctx.contextValue)   // → "Customer Support" | null
 *
 * @param raw  Encrypted (or plaintext) contextValue string from a raw query result
 * @returns    The category display name (before " - "), or null if input is null/empty
 */
export function decryptContextValue(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const decrypted = EncryptionHelper.tryDecrypt(raw);
  if (!decrypted) return null;
  return parseCategoryName(decrypted);
}

export { EncryptionHelper };
