import * as crypto from "crypto";

import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";
import { captureGlobalEvent } from "../error-tracking/error-tracking-setup";
import { getCurrentUserKey } from "./user-encryption-context";

class EncryptionKeyProvider {
  private derivedKey: Buffer | null = null;
  private keyFingerprint: string | null = null;
  private initialized = false;

  initialize(): void {
    const keyString = process.env.ENCRYPTION_KEY;
    if (!keyString) {
      throw new Error(
        "FATAL: ENCRYPTION_KEY environment variable is not set. " +
          "All data at rest is encrypted — the app cannot function without it. " +
          "Set ENCRYPTION_KEY in your environment or Secrets Manager.",
      );
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
      .slice(0, ENCRYPTION_CONSTANTS.FINGERPRINT_LENGTH);
    this.initialized = true;

    captureGlobalEvent("encryption-key-initialized", {
      keyFingerprint: this.keyFingerprint,
      keyLength: ENCRYPTION_CONSTANTS.KEY_LENGTH,
    });
  }

  /**
   * Returns the encryption key for the current context.
   * When KMS envelope encryption is enabled, prefers the per-user key from
   * AsyncLocalStorage (set by UserEncryptionInterceptor). Falls back to the
   * global derived key for unauthenticated routes and worker processes.
   */
  getKey(): Buffer {
    if (!this.initialized || !this.derivedKey) {
      throw new Error(
        "FATAL: EncryptionKeyProvider.getKey() called before initialize(). " +
          "A TypeORM transformer fired before the encryption key was set up. " +
          "Ensure encryptionKeyProvider.initialize() is called in main.ts before NestJS bootstraps.",
      );
    }
    if (process.env.KMS_KEY_ID) {
      const userKey = getCurrentUserKey();
      if (userKey) return userKey;
    }
    return this.derivedKey;
  }

  /**
   * Always returns the global derived key, ignoring any per-user KMS key.
   * Use this for the User entity itself (avoids chicken-and-egg: the JWT guard
   * loads the User before the per-user key is available in ALS).
   */
  getGlobalKey(): Buffer {
    if (!this.initialized || !this.derivedKey) {
      throw new Error(
        "FATAL: EncryptionKeyProvider.getGlobalKey() called before initialize(). " +
          "Ensure encryptionKeyProvider.initialize() is called in main.ts before NestJS bootstraps.",
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

export const encryptionKeyProvider = new EncryptionKeyProvider();
