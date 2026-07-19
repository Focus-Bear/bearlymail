import { Logger } from "@nestjs/common";
import { DataSource } from "typeorm";

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
  logger.log(`Encryption self-test passed. Key fingerprint: ${fingerprint}`);
}

/**
 * Verifies the current ENCRYPTION_KEY can decrypt data already stored in the database.
 *
 * A round-trip self-test only proves the key works for freshly generated ciphertext.
 * This check fetches an actual encrypted row and attempts decryption — if the key was
 * rotated or changed, this will throw and crash the app before any user data is served.
 *
 * Queries the `users` table because User fields are always encrypted with the global
 * ENCRYPTION_KEY (see globalEmailTransformer / getGlobalKey() — the JWT guard loads
 * the User before per-user KMS context is available). Querying email-body tables like
 * `emails` would be incompatible with KMS envelope encryption: those rows are
 * encrypted with per-user keys, and the boot check has no user context.
 *
 * If the database has no users yet (fresh install), the check is skipped.
 *
 * Call this in main.ts AFTER verifyEncryptionRoundTrip() and before NestJS bootstraps.
 * Requires an active DataSource connection.
 *
 * Throws if decryption of existing data fails.
 */
export async function verifyExistingDataDecryption(
  dataSource: DataSource,
): Promise<void> {
  const fingerprint = encryptionKeyProvider.getFingerprint();

  let rows: { email: string }[];
  try {
    // Fetch a small batch rather than a single row: if the first row happens to
    // be legacy plaintext (mixed plaintext/ciphertext during migration), we'd
    // skip the check entirely. Scanning a handful gives us a much better chance
    // of finding a ciphertext-shaped row to actually verify the key against.
    rows = (await dataSource.query(
      `SELECT email FROM users WHERE email IS NOT NULL LIMIT 10`,
    )) as { email: string }[];
  } catch (err) {
    logger.warn(
      `verifyExistingDataDecryption: Could not query users table — skipping (${String(err)})`,
    );
    return;
  }

  if (rows.length === 0) {
    logger.log(
      `verifyExistingDataDecryption: No existing users found — skipping (fresh database). Key fingerprint: ${fingerprint}`,
    );
    return;
  }

  const ciphertextRow = rows.find((row) =>
    EncryptionHelper.looksLikeEncryptedPayload(row.email),
  );

  if (!ciphertextRow) {
    // None of the sampled rows look like ciphertext (no separator / wrong shape).
    // This is a data-integrity issue, not a key mismatch — log loudly but don't
    // crash production.
    logger.warn(
      `verifyExistingDataDecryption: No ciphertext-shaped rows in first ${rows.length} users — skipping. Key fingerprint: ${fingerprint}`,
    );
    return;
  }

  try {
    const decrypted = EncryptionHelper.decryptWithExplicitKey(
      ciphertextRow.email,
      encryptionKeyProvider.getGlobalKey(),
    );
    logger.log(
      `verifyExistingDataDecryption: Existing data decryption succeeded (email length: ${decrypted.length}). Key fingerprint: ${fingerprint}`,
    );
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    captureGlobalEvent("encryption-boot-check-failure", {
      error: errMessage,
      keyFingerprint: fingerprint,
      stage: "existing-data",
    });
    throw new Error(
      `FATAL: Cannot decrypt existing database rows. ` +
        `Current key fingerprint: ${fingerprint}. ` +
        `Data was likely encrypted with a different key. ` +
        `Verify ENCRYPTION_KEY matches the value used when data was originally encrypted. ` +
        `Original error: ${errMessage}`,
    );
  }
}
