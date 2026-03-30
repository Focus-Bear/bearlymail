import { EncryptionHelper } from "./encryption.helper";

const TEST_PLAINTEXT = "bearlymail-encryption-boot-check";

/**
 * Performs a round-trip encrypt/decrypt self-test using the current ENCRYPTION_KEY.
 *
 * Call this in main.ts before app.listen() to catch key misconfigurations at
 * startup rather than silently serving encrypted ciphertext to users.
 *
 * Throws if the round-trip fails — the app should not start in that state.
 */
export function verifyEncryptionRoundTrip(): void {
  const encrypted = EncryptionHelper.encrypt(TEST_PLAINTEXT);
  if (!encrypted) {
    throw new Error(
      "FATAL: Encryption self-test failed — encrypt() returned null.",
    );
  }
  const decrypted = EncryptionHelper.decrypt(encrypted);
  if (decrypted !== TEST_PLAINTEXT) {
    throw new Error(
      "FATAL: Encryption round-trip self-test failed. " +
        "ENCRYPTION_KEY may be incorrect or corrupted.",
    );
  }
}
