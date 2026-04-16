/**
 * Authentication-related constants
 * Use these instead of magic numbers for auth operations
 */

import { MILLISECONDS } from "./time-constants";

export const AUTH_CONSTANTS = {
  // Minimum password length required for user accounts (OWASP ASVS v4.0 req 2.1.1)
  MIN_PASSWORD_LENGTH: 12,
  // Number of salt rounds for bcrypt password hashing (OWASP ASVS v4.0 req 2.4.1 recommends ≥12)
  BCRYPT_SALT_ROUNDS: 12,
} as const;

// Number of random bytes for password reset token generation
export const TOKEN_BYTES = 32;

// Token validity window: 1 hour in milliseconds
export const TOKEN_EXPIRY_MS = MILLISECONDS.HOUR;
