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
 * If the database has no emails yet (fresh install), the check is skipped.
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

  let row: { subject: string } | undefined;
  try {
    const result = (await dataSource.query(
      `SELECT subject FROM emails WHERE subject IS NOT NULL LIMIT 1`,
    )) as { subject: string }[];
    row = result[0];
  } catch (err) {
    logger.warn(
      `verifyExistingDataDecryption: Could not query emails table — skipping (${String(err)})`,
    );
    return;
  }

  if (!row) {
    logger.log(
      `verifyExistingDataDecryption: No existing emails found — skipping (fresh database). Key fingerprint: ${fingerprint}`,
    );
    return;
  }

  try {
    const decrypted = EncryptionHelper.decrypt(row.subject);
    const previewLength = decrypted ? decrypted.length : 0;
    logger.log(
      `verifyExistingDataDecryption: Existing data decryption succeeded (subject length: ${previewLength}). Key fingerprint: ${fingerprint}`,
    );
  } catch (err) {
    throw new Error(
      `FATAL: Cannot decrypt existing database rows. ` +
        `Current key fingerprint: ${fingerprint}. ` +
        `Data was likely encrypted with a different key. ` +
        `Verify ENCRYPTION_KEY matches the value used when data was originally encrypted. ` +
        `Original error: ${String(err)}`,
    );
  }
}
