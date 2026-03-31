import * as crypto from "crypto";

import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";
import { captureGlobalEvent } from "../error-tracking/error-tracking-setup";

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

  getKey(): Buffer {
    if (!this.initialized || !this.derivedKey) {
      throw new Error(
        "FATAL: EncryptionKeyProvider.getKey() called before initialize(). " +
          "A TypeORM transformer fired before the encryption key was set up. " +
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
