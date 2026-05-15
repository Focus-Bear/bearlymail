/**
 * AES-256-GCM + scrypt key derivation — must stay compatible with
 * server/src/encryption/encryption.helper.ts and encryption-key-provider.ts
 * (same algorithm, salt "salt", IV length 16, key length 32).
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
  cachedDerivedKey = crypto.scryptSync(
    encryptionKeyEnv,
    SCRYPT_SALT,
    KEY_LENGTH,
  );
  return cachedDerivedKey;
}

function looksLikeEncryptedPayload(text: string): boolean {
  if (!text.includes(":")) return false;
  const parts = text.split(":");
  if (parts.length !== 3) return false;
  try {
    return Buffer.from(parts[0], "hex").length === IV_LENGTH;
  } catch {
    return false;
  }
}

export function decryptUtf8(ciphertext: string, derivedKey: Buffer): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, "hex");
  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length");
  }
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv, {
    authTagLength: 16,
  }) as crypto.DecipherGCM;
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * If value matches server column ciphertext shape, decrypt; otherwise treat as plaintext UTF-8
 * (legacy rows or tests).
 */
export function decryptStatsPayload(text: string, derivedKey: Buffer): string {
  if (!looksLikeEncryptedPayload(text)) {
    return text;
  }
  return decryptUtf8(text, derivedKey);
}

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

export function parseStatsFromDb(
  raw: unknown,
  derivedKey: Buffer,
): Record<string, unknown> {
  if (raw == null) {
    return {};
  }

  let payload: string;
  if (typeof raw === "string") {
    payload = raw;
  } else if (typeof raw === "object" && !Array.isArray(raw)) {
    payload = JSON.stringify(raw);
  } else {
    throw new Error(`Unexpected stats column type: ${typeof raw}`);
  }

  const jsonText = decryptStatsPayload(payload, derivedKey);
  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    throw new Error("Failed to parse stats JSON after decrypt");
  }
}

export function encryptStatsForDb(
  stats: Record<string, unknown>,
  derivedKey: Buffer,
): string {
  return encryptUtf8(JSON.stringify(stats), derivedKey);
}
