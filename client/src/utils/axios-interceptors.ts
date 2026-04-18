import axios from 'axios';

import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { API_ENDPOINT_USERS_ME, HTTP_METHOD_GET } from 'constants/strings';

let interceptorsSetup = false;

// For testing purposes only - allows resetting the interceptors flag
export const resetInterceptorsForTesting = () => {
  interceptorsSetup = false;
};

export const setupAxiosInterceptors = (logout: () => void) => {
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

      // Handle 401 errors
      if (error.response?.status === HTTP_UNAUTHORIZED) {
        // Skip interceptor handling for the initial auth check (/users/me)
        // Let the AuthContext handle it instead
        const requestUrl = originalRequest?.url || '';
        const isInitialAuthCheck =
          (requestUrl.includes(API_ENDPOINT_USERS_ME) || requestUrl.endsWith(API_ENDPOINT_USERS_ME)) &&
          originalRequest?.method?.toLowerCase() === HTTP_METHOD_GET &&
          !originalRequest?._skipInterceptor; // Allow explicit skip flag

        if (isInitialAuthCheck) {
          // Let the AuthContext handle the initial auth check failure
          console.log('Skipping interceptor logout for initial /users/me check');
          return Promise.reject(error);
        }

        // Cookie expired or revoked on server — log out
        logout();
        return Promise.reject(error);
      }

      // For other errors, just pass them through
      return Promise.reject(error);
    }
  );
};
