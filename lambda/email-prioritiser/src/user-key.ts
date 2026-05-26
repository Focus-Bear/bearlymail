/**
 * Per-user AES data-key resolution for the email-prioritiser Lambda.
 *
 * Mirrors the server's UserEncryptionService.getUserKey() (and the
 * batch-analyzer Lambda): the `email_threads` explanation columns this Lambda
 * writes are per-user encrypted after the KMS re-encryption migration, so they
 * must be written under each user's data key — not the global key.
 *
 * Key selection (matches the server):
 *  - KMS disabled (`KMS_KEY_ID` unset — local dev / not yet wired) → global key.
 *  - User has no `encryptedDataKey` → global key (their data is under it).
 *  - Otherwise → KMS-Decrypt the user's wrapped data key.
 *  - On a KMS *failure* → THROW. Never fall back to the global key: the data is
 *    under the per-user key, so a global-key write would corrupt it. SQS will
 *    redrive the message on the retry.
 */
import { DecryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { Client } from "pg";

import { deriveKey } from "./encryption";
import { getEncryptionKeyString } from "./secrets";

const KEY_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedKey {
  key: Buffer;
  expiresAt: number;
}

const userKeyCache = new Map<string, CachedKey>();
let kmsClient: KMSClient | null = null;

function getKmsClient(): KMSClient {
  if (!kmsClient) {
    kmsClient = new KMSClient({
      region: process.env.AWS_REGION || "ap-southeast-2",
    });
  }
  return kmsClient;
}

async function globalKey(): Promise<Buffer> {
  return deriveKey(await getEncryptionKeyString());
}

/** Resolve the AES-256 key for a user's encrypted columns. See module docs. */
export async function resolveUserKey(
  db: Client,
  userId: string,
): Promise<Buffer> {
  if (!userId) {
    throw new Error("userId is required for user key resolution");
  }
  const kmsKeyId = process.env.KMS_KEY_ID;
  if (!kmsKeyId) {
    return globalKey();
  }

  const cached = userKeyCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  const { rows } = await db.query<{ encryptedDataKey: string | null }>(
    `SELECT "encryptedDataKey" FROM users WHERE id = $1`,
    [userId],
  );
  if (rows.length === 0) {
    throw new Error(`User ${userId} not found for encryption key lookup`);
  }

  const encryptedDataKey = rows[0].encryptedDataKey;
  if (!encryptedDataKey) {
    // User was never provisioned a per-user key — their data is under the
    // global key, so that's the correct key for them.
    return globalKey();
  }

  let plaintextKey: Buffer;
  try {
    const result = await getKmsClient().send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedDataKey, "base64"),
        KeyId: kmsKeyId,
      }),
    );
    if (!result.Plaintext) {
      throw new Error("KMS Decrypt returned empty plaintext");
    }
    plaintextKey = Buffer.from(result.Plaintext);
  } catch (err) {
    // Do NOT fall back to the global key: this user's data is under their
    // per-user key, so a global-key write would corrupt it. KMS errors are
    // usually transient — throwing lets SQS redrive the message.
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `KMS key resolution failed for user ${userId}: ${reason}. ` +
        `Not falling back to the global key (would corrupt per-user data).`,
    );
  }

  userKeyCache.set(userId, {
    key: plaintextKey,
    expiresAt: Date.now() + KEY_CACHE_TTL_MS,
  });
  return plaintextKey;
}
