/**
 * Authentication-related constants
 * Use these instead of magic numbers for auth operations
 */

export const AUTH_CONSTANTS = {
  // Minimum password length required for user accounts
  MIN_PASSWORD_LENGTH: 8,
  // Number of salt rounds for bcrypt password hashing
  BCRYPT_SALT_ROUNDS: 10,
} as const;
