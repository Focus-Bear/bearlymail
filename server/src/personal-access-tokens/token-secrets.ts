import { createHash, randomBytes } from "crypto";

import { PERSONAL_ACCESS_TOKENS } from "../constants/personal-access-tokens.constants";

/**
 * Hex SHA-256 of a bearer secret. Every secret carries 256 random bits, so an
 * unsalted hash is safe and doubles as the indexed lookup key.
 */
export function hashTokenSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** A fresh 256-bit secret behind a recognisable prefix (`bm_pat_…`, `bm_oat_…`). */
export function generateTokenSecret(prefix: string): string {
  return (
    prefix +
    randomBytes(PERSONAL_ACCESS_TOKENS.TOKEN_RANDOM_BYTES).toString("base64url")
  );
}
