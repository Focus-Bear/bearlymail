import axios from 'axios';
import { SESSION_EXPIRED_REASON } from 'utils/sessionState';

import { HTTP_PAYMENT_REQUIRED, HTTP_UNAUTHORIZED } from 'constants/numbers';
import { AI_VOLUME_LIMIT_REACHED_CODE, API_ENDPOINT_USERS_ME, HTTP_METHOD_GET } from 'constants/strings';

// Augment axios's request config so callers can pass `_skipInterceptor: true`
// without unsafe casts. When set, the response interceptor below will not
// trigger logout() on a 401 — used by the logout POST itself to avoid
// re-entering logout() when the cookie is already invalid.
declare module 'axios' {
  interface AxiosRequestConfig {
    _skipInterceptor?: boolean;
  }
  interface InternalAxiosRequestConfig {
    _skipInterceptor?: boolean;
  }
}

let interceptorsSetup = false;

// Callback the UI registers (see AiLimitBanner) so the interceptor can surface
// a persistent banner when the API rejects a request with the AI-capacity 402.
// Kept as a module-level hook because interceptors are set up outside React.
// Fired on every AI-limit 402; the banner decides whether to (re)appear, so
// this module stays router- and UI-agnostic.
let aiLimitNotifier: (() => void) | null = null;

export const registerAiLimitNotifier = (notifier: (() => void) | null) => {
  aiLimitNotifier = notifier;
};

// For testing purposes only - allows resetting the interceptors flag
export const resetInterceptorsForTesting = () => {
  interceptorsSetup = false;
  aiLimitNotifier = null;
};

export const setupAxiosInterceptors = (
  logout: (reason?: typeof SESSION_EXPIRED_REASON) => void,
) => {
  // Only set up interceptors once
  if (interceptorsSetup) {
    return;
  }
  interceptorsSetup = true;

  // Response interceptor — handle 401 errors gracefully.
  // The JWT is stored in an HttpOnly cookie (OWASP ASVS GAP-4) so there is no
  // token to read from localStorage here. The browser sends the cookie
  // automatically on every request because axios.defaults.withCredentials = true.
  axios.interceptors.response.use(
    response => {
      return response;
    },
    async error => {
      const originalRequest = error.config;

      // Handle 402 AI-capacity errors: notify the registered UI (the
      // persistent AiLimitBanner) and still reject so callers' own error
      // handling keeps working. No throttling here — the banner ignores
      // repeat notifications while visible and rate-limits re-shows.
      if (
        error.response?.status === HTTP_PAYMENT_REQUIRED &&
        error.response?.data?.code === AI_VOLUME_LIMIT_REACHED_CODE
      ) {
        aiLimitNotifier?.();
        return Promise.reject(error);
      }

      // Handle 401 errors
      if (error.response?.status === HTTP_UNAUTHORIZED) {
        // Explicit opt-out: callers (e.g. the logout POST itself) can set
        // _skipInterceptor to prevent a 401 from triggering another logout().
        if (originalRequest?._skipInterceptor) {
          return Promise.reject(error);
        }

        // Skip interceptor handling for the initial auth check (/users/me)
        // Let the AuthContext handle it instead
        const requestUrl = originalRequest?.url || '';
        const isInitialAuthCheck =
          (requestUrl.includes(API_ENDPOINT_USERS_ME) || requestUrl.endsWith(API_ENDPOINT_USERS_ME)) &&
          originalRequest?.method?.toLowerCase() === HTTP_METHOD_GET;

        if (isInitialAuthCheck) {
          // Let the AuthContext handle the initial auth check failure
          console.log('Skipping interceptor logout for initial /users/me check');
          return Promise.reject(error);
        }

        // Cookie expired or revoked on server — this is an involuntary logout,
        // so flag it as a session expiry to drive the "sign in again" screen.
        logout(SESSION_EXPIRED_REASON);
        return Promise.reject(error);
      }

      // For other errors, just pass them through
      return Promise.reject(error);
    }
  );
};
