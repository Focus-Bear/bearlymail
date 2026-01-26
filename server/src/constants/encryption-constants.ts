/**
 * Encryption-related constants
 * Use these instead of magic numbers for encryption operations
 */

export const ENCRYPTION_CONSTANTS = {
  // AES initialization vector length (16 bytes for AES)
  IV_LENGTH: 16,
  // AES-256 key length (32 bytes)
  KEY_LENGTH: 32,
  // scrypt salt length (32 bytes)
  SALT_LENGTH: 32,
} as const;
