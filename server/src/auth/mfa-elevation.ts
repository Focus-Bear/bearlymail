import { AUTH_CONSTANTS } from "../constants/auth-constants";

/**
 * MFA elevation is valid only for a limited window after the user passes the
 * TOTP challenge. Admin access requires a *recent* elevation, decoupled from how
 * long the session JWT itself lives — so when an elevation goes stale we prompt
 * for re-verification rather than logging the user out (SAQ Q35 / GAP-2).
 *
 * `mfaVerifiedAt` is the epoch-ms timestamp stamped into the elevated JWT at
 * verification time. Anything missing, non-numeric, or older than the TTL is
 * treated as not freshly elevated.
 */
export function isMfaElevationFresh(mfaVerifiedAt: unknown): boolean {
  if (typeof mfaVerifiedAt !== "number" || !Number.isFinite(mfaVerifiedAt)) {
    return false;
  }
  const elapsed = Date.now() - mfaVerifiedAt;
  return elapsed >= 0 && elapsed <= AUTH_CONSTANTS.MFA_ELEVATION_TTL_MS;
}
