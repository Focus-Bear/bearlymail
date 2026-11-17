import * as crypto from "crypto";

/**
 * SHA-256 (hex) of a single-use emailed token. Only this digest is stored,
 * so a database read never yields a usable link, and lookups are a plain
 * indexed equality match on the digest.
 */
export function hashEmailedToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** A fresh random token for an emailed link, plus the digest to store. */
export function generateEmailedToken(bytes: number): {
  token: string;
  tokenHash: string;
} {
  const token = crypto.randomBytes(bytes).toString("hex");
  return { token, tokenHash: hashEmailedToken(token) };
}
