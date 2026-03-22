import * as crypto from "crypto";

import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";
import { logError } from "../utils/logger";

/**
 * Static encryption helper for use in TypeORM column transformers
 * Gets encryption key from environment variable
 */
class EncryptionHelper {
  private static algorithm = "aes-256-gcm";
  private static ivLength = ENCRYPTION_CONSTANTS.IV_LENGTH;
  private static keyCache: Buffer | null = null;

  private static getKey(): Buffer {
    if (this.keyCache) {
      return this.keyCache;
    }

    const keyString =
      process.env.ENCRYPTION_KEY ||
      "default-key-change-in-production-32chars!!";
    this.keyCache = crypto.scryptSync(
      keyString,
      "salt",
      ENCRYPTION_CONSTANTS.KEY_LENGTH,
    );
    return this.keyCache;
  }

  static encrypt(text: string | null | undefined): string | null {
    if (!text) return null;

    try {
      const key = this.getKey();
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

    try {
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
      // Return original if decryption fails (might be plaintext from before encryption)
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
 * TypeORM transformer for encrypted columns
 */
export const encryptedColumnTransformer = {
  to: (value: string | null | undefined): string | null =>
    EncryptionHelper.encrypt(value),
  from: (value: string | null | undefined): string | null =>
    EncryptionHelper.decrypt(value),
};

/**
 * For email addresses - we need to query by them, so we store:
 * - emailHash: SHA-256 hash for querying (not encrypted)
 * - email: encrypted actual email
 */
export const emailTransformer = {
  to: (value: string | null | undefined): string | null =>
    EncryptionHelper.encrypt(value),
  from: (value: string | null | undefined): string | null =>
    EncryptionHelper.decrypt(value),
};

/**
 * TypeORM transformer for encrypted JSON fields.
 * Encrypts arbitrary JSON data on write, decrypts on read.
 */
export const encryptedJsonTransformer = {
  to: (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const stringified = JSON.stringify(value);
    return EncryptionHelper.encrypt(stringified);
  },
  from: (value: string | null | undefined): unknown => {
    const decrypted = EncryptionHelper.decrypt(value);
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
  const decrypted = EncryptionHelper.decrypt(raw);
  if (!decrypted) return null;
  return decrypted.split(" - ")[0].trim();
}

export { EncryptionHelper };
