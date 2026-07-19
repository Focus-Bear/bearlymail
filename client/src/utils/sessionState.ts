/**
 * Small persisted helpers for the "session expired" login experience.
 *
 * Two pieces of state outlive a logout and the sensitive-cache clear:
 *  - the last login method, so we can offer "Continue with <method>" at the top
 *    of the login screen, and
 *  - a one-shot "session expired" flag, set when the user is logged out
 *    involuntarily (an expired/invalid token → 401), so the login screen can
 *    explain *why* they're back here instead of silently redirecting.
 *
 * Both keys deliberately avoid the `bearlymail_<CACHE_VERSION>_` prefix that
 * `clearSensitiveLocalStorage()` wipes on logout — we WANT them to survive so
 * the next login screen can use them. They hold no sensitive data.
 */

const LAST_LOGIN_METHOD_KEY = 'bearlymail_last_login_method';
const SESSION_EXPIRED_KEY = 'bearlymail_session_expired';

/** Reason passed to logout() for an involuntary, session-expiry logout. */
export const SESSION_EXPIRED_REASON = 'session_expired';

export const LOGIN_METHODS = {
  GOOGLE: 'google',
  MICROSOFT: 'microsoft',
  ZOHO: 'zoho',
  EMAIL: 'email',
} as const;

export type LoginMethod = typeof LOGIN_METHODS[keyof typeof LOGIN_METHODS];

export const LOGIN_METHOD_EMAIL = LOGIN_METHODS.EMAIL;

const VALID_METHODS: ReadonlySet<string> = new Set<string>(Object.values(LOGIN_METHODS));

export function setLastLoginMethod(method: LoginMethod): void {
  try {
    localStorage.setItem(LAST_LOGIN_METHOD_KEY, method);
  } catch {
    // Best-effort — never block a login on storage failure.
  }
}

export function getLastLoginMethod(): LoginMethod | null {
  try {
    const value = localStorage.getItem(LAST_LOGIN_METHOD_KEY);
    return value && VALID_METHODS.has(value) ? (value as LoginMethod) : null;
  } catch {
    return null;
  }
}

/** Mark that the user was logged out involuntarily (expired/invalid session). */
export function markSessionExpired(): void {
  try {
    localStorage.setItem(SESSION_EXPIRED_KEY, '1');
  } catch {
    // Best-effort.
  }
}

/**
 * Read-and-clear the session-expired flag. Returns true only once per expiry
 * so a manual page refresh doesn't keep showing the banner.
 */
export function consumeSessionExpired(): boolean {
  try {
    const expired = localStorage.getItem(SESSION_EXPIRED_KEY) === '1';
    if (expired) {
      localStorage.removeItem(SESSION_EXPIRED_KEY);
    }
    return expired;
  } catch {
    return false;
  }
}
