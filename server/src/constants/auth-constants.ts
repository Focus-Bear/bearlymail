/**
 * Authentication-related constants
 * Use these instead of magic numbers for auth operations
 */

import { MILLISECONDS } from "./time-constants";

export const AUTH_CONSTANTS = {
  // Minimum password length required for user accounts
  MIN_PASSWORD_LENGTH: 8,
  // Number of salt rounds for bcrypt password hashing
  BCRYPT_SALT_ROUNDS: 10,
} as const;

// Number of random bytes for password reset token generation
export const TOKEN_BYTES = 32;

// Token validity window: 1 hour in milliseconds
export const TOKEN_EXPIRY_MS = MILLISECONDS.HOUR;
