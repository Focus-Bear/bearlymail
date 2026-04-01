import { EncryptionHelper } from "../encryption/encryption.helper";

/** UUID v4 pattern — category display names should not be raw context IDs. */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isGarbageEmailCategoryToken(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (EncryptionHelper.looksLikeEncryptedPayload(trimmed)) return true;
  if (UUID_V4_RE.test(trimmed)) return true;
  return false;
}

/**
 * Removes legacy bad segments (ciphertext blobs, UUID-only tokens) from a decrypted
 * comma-separated emailCategories string before API responses or matching.
 */
export function sanitizeEmailCategoriesCsv(
  value: string | null | undefined,
): string | null {
  if (value == null || value === "") return value ?? null;
  const kept = value
    .split(",")
    .map((segment) => segment.trim())
    .filter(
      (segment) => segment.length > 0 && !isGarbageEmailCategoryToken(segment),
    );
  if (kept.length === 0) return null;
  return kept.join(",");
}
