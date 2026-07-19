/**
 * Authentication-related constants
 * Use these instead of magic numbers for auth operations
 */

import { HOURS, MILLISECONDS } from "./time-constants";

const DAYS_PER_WEEK = 7;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

export const AUTH_CONSTANTS = {
  // Minimum password length required for user accounts (OWASP ASVS v4.0 req 2.1.1)
  MIN_PASSWORD_LENGTH: 12,
  // Number of salt rounds for bcrypt password hashing (OWASP ASVS v4.0 req 2.4.1 recommends ≥12)
  BCRYPT_SALT_ROUNDS: 12,
  // Cookie max-age in milliseconds — matches the JWT "7d" expiry in auth.module.ts
  COOKIE_MAX_AGE_MS:
    DAYS_PER_WEEK *
    HOURS_PER_DAY *
    MINUTES_PER_HOUR *
    SECONDS_PER_MINUTE *
    MS_PER_SECOND,
  // Name of the HttpOnly cookie used to store the JWT (OWASP ASVS req 3.4.2)
  COOKIE_NAME: "access_token",
  // How long an MFA elevation stays valid for admin access after the user passes
  // TOTP. This is a *recency* window enforced by AdminGuard — NOT a cookie/JWT
  // expiry. The session cookie keeps its normal 7d life, so an expired elevation
  // makes admin endpoints prompt for re-verification instead of logging the user
  // out entirely (SAQ Q35 / GAP-2).
  MFA_ELEVATION_TTL_MS: HOURS.EIGHT * MILLISECONDS.HOUR,
} as const;

// Number of random bytes for password reset token generation
export const TOKEN_BYTES = 32;

// Token validity window: 10 minutes in milliseconds (ASVS 2.10.3 requires ≤10 min for password reset tokens)
export const TOKEN_EXPIRY_MS = 10 * MILLISECONDS.MINUTE;

// Step-up token validity: 15 minutes (OWASP ASVS req 4.2.1)
export const STEP_UP_TOKEN_EXPIRY_MINUTES = 15;
