/**
 * AES-256-GCM + scrypt key derivation — must stay compatible with
 * server/src/encryption/encryption.helper.ts and encryption-key-provider.ts
 * (same algorithm, salt "salt", IV length 16, key length 32).
 *
 * The prioritiser writes the `email_threads.urgency_explanation` (text) and
 * `priority_explanation` (text, JSON) columns, both of which are encrypted at
 * rest on the server (encryptedColumnTransformer / encryptedJsonTransformer).
 * It previously wrote them as plaintext; these helpers produce the same
 * ciphertext shape the server reads back.
 */
import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
/** Must match ENCRYPTION_CONSTANTS.IV_LENGTH on the server */
const IV_LENGTH = 16;
/** Must match ENCRYPTION_CONSTANTS.KEY_LENGTH on the server */
const KEY_LENGTH = 32;
const SCRYPT_SALT = "salt";

let cachedKeyMaterial: string | null = null;
let cachedDerivedKey: Buffer | null = null;

export function deriveKey(encryptionKeyEnv: string): Buffer {
  if (cachedDerivedKey && cachedKeyMaterial === encryptionKeyEnv) {
    return cachedDerivedKey;
  }
  cachedKeyMaterial = encryptionKeyEnv;
  cachedDerivedKey = crypto.scryptSync(encryptionKeyEnv, SCRYPT_SALT, KEY_LENGTH);
  return cachedDerivedKey;
}

/**
 * Encrypt a UTF-8 string into the server's `ivHex:authTagHex:cipherHex` shape.
 * For the encryptedJsonTransformer columns, pass `JSON.stringify(value)`.
 */
export function encryptUtf8(plaintext: string, derivedKey: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    derivedKey,
    iv,
  ) as crypto.CipherGCM;
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}
