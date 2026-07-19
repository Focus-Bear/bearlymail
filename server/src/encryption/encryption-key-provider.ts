import * as crypto from "crypto";

import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";
import { captureGlobalEvent } from "../error-tracking/error-tracking-setup";
import { getCurrentUserKey } from "./user-encryption-context";

/**
 * Env var holding the base64 of the global key after it has been wrapped with
 * the KMS CMK (`scripts/wrap-global-key.ts`). When present alongside
 * `KMS_KEY_ID`, the global key is recovered by KMS-decrypting this blob at boot
 * rather than read from a static plaintext `ENCRYPTION_KEY` (SAQ Q47 / ASVS
 * V6: keys managed by KMS, no standing plaintext secret).
 */
const GLOBAL_KEY_KMS_BLOB_ENV = "ENCRYPTION_KEY_KMS_BLOB";

/** Where the in-memory global key came from — surfaced in boot logs for cutover verification. */
export type GlobalKeySource = "static-env" | "kms";

/** Decrypts a KMS-wrapped blob to plaintext bytes. Injectable so tests don't hit AWS. */
export type KmsDecryptFn = (ciphertextBlob: Buffer) => Promise<Buffer>;

class EncryptionKeyProvider {
  private derivedKey: Buffer | null = null;
  private keyFingerprint: string | null = null;
  private initialized = false;
  private keySource: GlobalKeySource | null = null;

  /**
   * Synchronous init from the static `ENCRYPTION_KEY` env var.
   *
   * Retained for tests and as the fallback when the KMS-wrapped blob isn't
   * configured. Production startup should call `initializeFromManagedKey()`,
   * which prefers the KMS path and falls back to this.
   */
  initialize(): void {
    const keyString = process.env.ENCRYPTION_KEY;
    if (!keyString) {
      throw new Error(
        "FATAL: ENCRYPTION_KEY environment variable is not set. " +
          "All data at rest is encrypted — the app cannot function without it. " +
          "Set ENCRYPTION_KEY (or provision ENCRYPTION_KEY_KMS_BLOB for the KMS path).",
      );
    }

    this.setDerivedKey(
      crypto.scryptSync(keyString, "salt", ENCRYPTION_CONSTANTS.KEY_LENGTH),
      "static-env",
    );
  }

  /**
   * Async init that prefers a KMS-wrapped global key over the static secret.
   *
   * When `KMS_KEY_ID` and `ENCRYPTION_KEY_KMS_BLOB` are both set, the 32-byte
   * global key is recovered by KMS-decrypting the blob — there is no standing
   * plaintext key (SAQ Q47). The blob wraps the *same* derived bytes the
   * static path produces, so existing ciphertext stays valid and the key
   * fingerprint is identical (verify the boot-log fingerprint matches before
   * removing `ENCRYPTION_KEY`).
   *
   * Falls back to the static `ENCRYPTION_KEY` path when the blob isn't present,
   * so this is safe to deploy *before* the blob is provisioned.
   *
   * `kmsDecrypt` is injectable for tests; production uses a real KMS client.
   */
  async initializeFromManagedKey(
    kmsDecrypt: KmsDecryptFn = defaultKmsDecrypt,
  ): Promise<void> {
    const blobB64 = process.env[GLOBAL_KEY_KMS_BLOB_ENV];
    if (process.env.KMS_KEY_ID && blobB64) {
      const plaintext = await kmsDecrypt(Buffer.from(blobB64, "base64"));
      if (plaintext.length !== ENCRYPTION_CONSTANTS.KEY_LENGTH) {
        throw new Error(
          `FATAL: KMS-decrypted global key is ${plaintext.length} bytes, ` +
            `expected ${ENCRYPTION_CONSTANTS.KEY_LENGTH}. ` +
            "Re-wrap the key with scripts/wrap-global-key.ts.",
        );
      }
      this.setDerivedKey(Buffer.from(plaintext), "kms");
      return;
    }
    // No KMS blob configured — fall back to the static env key.
    this.initialize();
  }

  private setDerivedKey(key: Buffer, source: GlobalKeySource): void {
    this.derivedKey = key;
    this.keySource = source;
    this.keyFingerprint = crypto
      .createHash("sha256")
      .update(key)
      .digest("hex")
      .slice(0, ENCRYPTION_CONSTANTS.FINGERPRINT_LENGTH);
    this.initialized = true;

    captureGlobalEvent("encryption-key-initialized", {
      keyFingerprint: this.keyFingerprint,
      keyLength: ENCRYPTION_CONSTANTS.KEY_LENGTH,
      keySource: source,
    });
  }

  /** Where the active global key was loaded from. Null until initialized. */
  getKeySource(): GlobalKeySource | null {
    return this.keySource;
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

/**
 * Real KMS decrypt for the global-key blob. Dynamically imports the AWS SDK so
 * the provider has no load-time dependency on it until the KMS path is used.
 * Region falls through to the SDK's default discovery chain (AWS_REGION, IMDS,
 * etc.) — no hardcoded default.
 */
async function defaultKmsDecrypt(ciphertextBlob: Buffer): Promise<Buffer> {
  const { KMSClient, DecryptCommand } = await import("@aws-sdk/client-kms");
  const client = new KMSClient({
    region: process.env.AWS_REGION,
  });
  const result = await client.send(
    new DecryptCommand({
      CiphertextBlob: ciphertextBlob,
      KeyId: process.env.KMS_KEY_ID,
    }),
  );
  if (!result.Plaintext) {
    throw new Error("KMS Decrypt returned empty plaintext for global key blob");
  }
  return Buffer.from(result.Plaintext);
}

export const encryptionKeyProvider = new EncryptionKeyProvider();
