import type { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";

/**
 * Normalizes a user profile text column that may still be ciphertext (e.g. if read
 * outside TypeORM column transformers). Plaintext values pass through unchanged.
 */
export function normalizeEncryptedUserText(
  value: string | null | undefined,
): string {
  if (value == null || value === "") {
    return "";
  }
  const normalized = EncryptionHelper.tryDecrypt(value);
  return (normalized ?? "").trim();
}

export function resolveUserDisplayName(
  user: Pick<User, "displayName" | "name"> | null | undefined,
): string {
  if (!user) {
    return "User";
  }
  return (
    normalizeEncryptedUserText(user.displayName) ||
    normalizeEncryptedUserText(user.name) ||
    "User"
  );
}

export function resolveUserJobTitle(
  user: Pick<User, "jobTitle"> | null | undefined,
): string {
  if (!user?.jobTitle) {
    return "";
  }
  return normalizeEncryptedUserText(user.jobTitle);
}
