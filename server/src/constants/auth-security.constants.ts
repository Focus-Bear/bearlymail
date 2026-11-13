/**
 * Constants for email verification, login lockout and the per-IP limits on
 * the public auth endpoints.
 */

import { MILLISECONDS } from "./time-constants";

const FIVE = 5;

/** Machine codes in 4xx bodies that the client switches on. */
export const AUTH_ERROR_CODES = {
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
} as const;

export const EMAIL_VERIFICATION = {
  /** Random bytes in a verification token (hex-encoded in the link). */
  TOKEN_BYTES: 32,
  TOKEN_TTL_MS: MILLISECONDS.DAY,
  /** Client route the emailed link opens. */
  CLIENT_PATH: "/verify-email",
} as const;

/**
 * Per-account lockout after repeated wrong passwords. From the
 * MAX_FAILED_ATTEMPTS-th failure on, every further failure locks the account
 * for BASE_LOCK_MS doubled per extra failure, capped at MAX_LOCK_MS. A
 * successful sign-in (or a password reset) clears the count.
 */
export const LOGIN_LOCKOUT = {
  MAX_FAILED_ATTEMPTS: 10,
  BASE_LOCK_MS: FIVE * MILLISECONDS.MINUTE,
  MAX_LOCK_MS: MILLISECONDS.HOUR,
  /**
   * Addresses with no account get the same treatment from an in-memory
   * tracker, so a lockout never reveals which addresses are registered.
   * Bounded so a spray of random addresses can't grow it without limit.
   */
  UNKNOWN_EMAIL_TRACKER_MAX_ENTRIES: 10_000,
  UNKNOWN_EMAIL_TRACKER_IDLE_MS: MILLISECONDS.DAY,
} as const;

const DEFAULT_LOGIN_LIMIT_PER_MINUTE = 20;

/**
 * Password sign-ins allowed per client IP per minute: LOGIN_THROTTLE_LIMIT,
 * read per request (CI's end-to-end suite signs in far more often from one
 * address), else DEFAULT_LOGIN_LIMIT_PER_MINUTE. Per-account lockout guards
 * individual accounts on top of this.
 */
export function loginThrottleLimit(): number {
  const configured = Number(process.env.LOGIN_THROTTLE_LIMIT);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_LOGIN_LIMIT_PER_MINUTE;
}

/** Per-IP limits on the public auth endpoints (ttl in milliseconds). */
export const AUTH_THROTTLES = {
  LOGIN: { default: { limit: loginThrottleLimit, ttl: MILLISECONDS.MINUTE } },
  REGISTER: { default: { limit: 5, ttl: MILLISECONDS.MINUTE } },
  FORGOT_PASSWORD: { default: { limit: 3, ttl: FIVE * MILLISECONDS.MINUTE } },
  RESET_PASSWORD: { default: { limit: 5, ttl: MILLISECONDS.MINUTE } },
  SETUP_PASSWORD: { default: { limit: 5, ttl: MILLISECONDS.MINUTE } },
  VERIFY_EMAIL: { default: { limit: 10, ttl: MILLISECONDS.MINUTE } },
  RESEND_VERIFICATION: {
    default: { limit: 3, ttl: FIVE * MILLISECONDS.MINUTE },
  },
  STEP_UP: { default: { limit: 5, ttl: MILLISECONDS.MINUTE } },
  MFA_VERIFY: { default: { limit: 10, ttl: MILLISECONDS.MINUTE } },
} as const;

/**
 * Proxies in front of the API that append to X-Forwarded-For. Production
 * runs behind one AWS Application Load Balancer, so the client address is
 * the last entry. Override with TRUST_PROXY_HOPS (0 = no proxy).
 */
export const DEFAULT_TRUST_PROXY_HOPS = 1;
