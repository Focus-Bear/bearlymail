/**
 * One-time helper to KMS-wrap the global encryption key (SAQ Q47).
 *
 * Derives the current global key from the static `ENCRYPTION_KEY` exactly as
 * the app does (`scrypt(ENCRYPTION_KEY, "salt", 32)`), encrypts those 32 bytes
 * under the KMS CMK, and prints the base64 ciphertext blob to set as
 * `ENCRYPTION_KEY_KMS_BLOB`. Because it wraps the *same* derived bytes, the app
 * recovers an identical key at boot — existing ciphertext stays valid and the
 * key fingerprint is unchanged.
 *
 * Cutover:
 *   1. Run this script, capture the blob + the printed fingerprint.
 *   2. Set ENCRYPTION_KEY_KMS_BLOB in Secrets Manager (keep ENCRYPTION_KEY for now).
 *   3. Redeploy. Confirm the boot log shows `Key source: kms` and a fingerprint
 *      matching the one printed here.
 *   4. Only then remove the static ENCRYPTION_KEY secret.
 *
 * Usage (requires ENCRYPTION_KEY, KMS_KEY_ID and valid AWS credentials):
 *   ts-node -r tsconfig-paths/register src/scripts/wrap-global-key.ts
 */

import "reflect-metadata";

import * as crypto from "crypto";
import * as dotenv from "dotenv";

dotenv.config();

import { EncryptCommand, KMSClient } from "@aws-sdk/client-kms";

import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";

async function main(): Promise<void> {
  const keyString = process.env.ENCRYPTION_KEY;
  const kmsKeyId = process.env.KMS_KEY_ID;

  if (!keyString) {
    throw new Error(
      "ENCRYPTION_KEY is not set — cannot derive the global key.",
    );
  }
  if (!kmsKeyId) {
    throw new Error("KMS_KEY_ID is not set — nothing to wrap the key under.");
  }

  // Must match EncryptionKeyProvider.initialize() byte-for-byte.
  const derived = crypto.scryptSync(
    keyString,
    "salt",
    ENCRYPTION_CONSTANTS.KEY_LENGTH,
  );
  const fingerprint = crypto
    .createHash("sha256")
    .update(derived)
    .digest("hex")
    .slice(0, ENCRYPTION_CONSTANTS.FINGERPRINT_LENGTH);

  const client = new KMSClient({
    region: process.env.AWS_REGION,
  });
  const result = await client.send(
    new EncryptCommand({ KeyId: kmsKeyId, Plaintext: derived }),
  );
  if (!result.CiphertextBlob) {
    throw new Error("KMS Encrypt returned no CiphertextBlob.");
  }

  const blob = Buffer.from(result.CiphertextBlob).toString("base64");

  console.log(
    [
      "",
      "Global key wrapped successfully.",
      "",
      "Set this as ENCRYPTION_KEY_KMS_BLOB (Secrets Manager):",
      blob,
      "",
      `Expected boot fingerprint (must match server log): ${fingerprint}`,
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error("Failed to wrap global key:", err);
  process.exit(1);
});
