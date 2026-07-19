import { AUTH_CONSTANTS } from "../constants/auth-constants";

/**
 * Cookie options for the JWT HttpOnly cookie.
 * `secure` is enabled only in production to allow local HTTP development.
 * `sameSite: 'strict'` prevents cross-site request forgery (OWASP ASVS req 3.4.3).
 */
export function jwtCookieOptions(
  isProduction: boolean,
  maxAgeMs?: number,
): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: maxAgeMs ?? AUTH_CONSTANTS.COOKIE_MAX_AGE_MS,
  };
}
