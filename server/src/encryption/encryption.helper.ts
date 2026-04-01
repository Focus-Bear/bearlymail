import * as crypto from "crypto";

import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";
import { captureGlobalEvent } from "../error-tracking/error-tracking-setup";
import { parseCategoryName } from "../utils/category-name.util";
import { logError } from "../utils/logger";
import { encryptionKeyProvider } from "./encryption-key-provider";

const MAX_CONSECUTIVE_DECRYPT_FAILURES = 3;
const DECRYPT_FAILURE_EVENT_THROTTLE_MS = 60_000;

/**
 * Static encryption helper for use in TypeORM column transformers.
 * Delegates key management to encryptionKeyProvider — throws if accessed before
 * encryptionKeyProvider.initialize() has been called in main.ts.
 */
class EncryptionHelper {
  private static algorithm = "aes-256-gcm";
  private static ivLength = ENCRYPTION_CONSTANTS.IV_LENGTH;
  private static consecutiveFailures = 0;
  private static lastDecryptFailureEventMs = 0;

  private static getKey(): Buffer {
    return encryptionKeyProvider.getKey();
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
      logError(
        "Decryption error",
        error instanceof Error ? error : new Error(String(error)),
      );
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
      EncryptionHelper.consecutiveFailures = 0;
      return result;
    } catch (error) {
      EncryptionHelper.consecutiveFailures++;

      const now = Date.now();
      if (
        now - EncryptionHelper.lastDecryptFailureEventMs >
        DECRYPT_FAILURE_EVENT_THROTTLE_MS
      ) {
        EncryptionHelper.lastDecryptFailureEventMs = now;
        captureGlobalEvent("encryption-decrypt-failure", {
          error: error instanceof Error ? error.message : String(error),
          ciphertextPrefix: encryptedText
            ? encryptedText.slice(
                0,
                ENCRYPTION_CONSTANTS.CIPHERTEXT_DEBUG_PREFIX_LENGTH,
              )
            : "(null)",
          consecutiveFailures: EncryptionHelper.consecutiveFailures,
          keyFingerprint: encryptionKeyProvider.getFingerprint(),
        });
      }

      if (
        EncryptionHelper.consecutiveFailures >= MAX_CONSECUTIVE_DECRYPT_FAILURES
      ) {
        throw new Error(
          `FATAL: ${EncryptionHelper.consecutiveFailures} consecutive decryption failures. ` +
            `ENCRYPTION_KEY is likely wrong or rotated mid-process. ` +
            `Key fingerprint: ${encryptionKeyProvider.getFingerprint()}. ` +
            `Crashing to prevent serving encrypted data to users.`,
        );
      }

      logError(
        `tryDecrypt: decryption failed (failure ${EncryptionHelper.consecutiveFailures}/${MAX_CONSECUTIVE_DECRYPT_FAILURES}) — returning raw ciphertext`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return encryptedText ?? null;
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
