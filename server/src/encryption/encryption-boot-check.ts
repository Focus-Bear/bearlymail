import { Logger } from "@nestjs/common";

import { captureGlobalEvent } from "../error-tracking/error-tracking-setup";
import { EncryptionHelper } from "./encryption.helper";
import { encryptionKeyProvider } from "./encryption-key-provider";

const logger = new Logger("EncryptionBootCheck");

const TEST_PLAINTEXT = "bearlymail-encryption-boot-check";

/**
 * Performs a round-trip encrypt/decrypt self-test using the current ENCRYPTION_KEY.
 *
 * Call this in main.ts AFTER encryptionKeyProvider.initialize() and before
 * NestJS bootstraps. Logs the key fingerprint on success for cross-deploy comparison.
 *
 * Throws if the round-trip fails — the app should not start in that state.
 */
export function verifyEncryptionRoundTrip(): void {
  const fingerprint = encryptionKeyProvider.getFingerprint();

  try {
    const encrypted = EncryptionHelper.encrypt(TEST_PLAINTEXT);
    if (!encrypted) {
      const err = new Error(
        "FATAL: Encryption self-test failed — encrypt() returned null.",
      );
      captureGlobalEvent("encryption-boot-check-failure", {
        error: err.message,
        keyFingerprint: fingerprint,
        stage: "encrypt",
      });
      throw err;
    }
    const decrypted = EncryptionHelper.decrypt(encrypted);
    if (decrypted !== TEST_PLAINTEXT) {
      const err = new Error(
        "FATAL: Encryption round-trip self-test failed. " +
          "ENCRYPTION_KEY may be incorrect or corrupted.",
      );
      captureGlobalEvent("encryption-boot-check-failure", {
        error: err.message,
        keyFingerprint: fingerprint,
        stage: "decrypt",
      });
      throw err;
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("FATAL: Encryption")
    ) {
      throw error;
    }
    captureGlobalEvent("encryption-boot-check-failure", {
      error: error instanceof Error ? error.message : String(error),
      keyFingerprint: fingerprint,
      stage: "unknown",
    });
    throw error;
  }

  captureGlobalEvent("encryption-boot-check-success", {
    keyFingerprint: fingerprint,
  });
  logger.log(
    `Encryption self-test passed. Key fingerprint: ${fingerprint}`,
  );
}
