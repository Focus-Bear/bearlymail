import axios from 'axios';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { API_ENDPOINT_USERS_ME, HTTP_METHOD_GET } from 'constants/strings';

let interceptorsSetup = false;

// For testing purposes only - allows resetting the interceptors flag
export const resetInterceptorsForTesting = () => {
  interceptorsSetup = false;
};

const isTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    return payload.exp ? payload.exp < now : false;
  } catch {
    return true; // If we can't decode it, consider it invalid
  }
};

export const setupAxiosInterceptors = (logout: () => void) => {
  // Only set up interceptors once
  if (interceptorsSetup) {
    return;
  }
  interceptorsSetup = true;

  // Request interceptor - add token to all requests
  axios.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('token');
      if (token && !isTokenExpired(token)) {
        config.headers.Authorization = `Bearer ${token}`;
      } else if (token && isTokenExpired(token)) {
        // Token expired, clear it
        localStorage.removeItem('token');
        delete config.headers.Authorization;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor - handle 401 errors gracefully
  axios.interceptors.response.use(
    (response) => {
      return response;
    },
    async (error) => {
      const originalRequest = error.config;

      // Handle 401 errors
      if (error.response?.status === HTTP_UNAUTHORIZED) {
        // Skip interceptor handling for the initial auth check (/users/me)
        // Let the AuthContext handle it instead
        const requestUrl = originalRequest?.url || '';
        const isInitialAuthCheck = (requestUrl.includes(API_ENDPOINT_USERS_ME) || requestUrl.endsWith(API_ENDPOINT_USERS_ME)) && 
                                  originalRequest?.method?.toLowerCase() === HTTP_METHOD_GET &&
                                  !originalRequest?._skipInterceptor; // Allow explicit skip flag
        
        if (isInitialAuthCheck) {
          // Let the AuthContext handle the initial auth check failure
          // Just pass through the error without calling logout()
          console.log('Skipping interceptor logout for initial /users/me check');
          return Promise.reject(error);
        }

        const token = localStorage.getItem('token');

        // If no token, just logout
        if (!token) {
          logout();
          return Promise.reject(error);
        }

        // Check if token is expired
        if (isTokenExpired(token)) {
          console.log('Token expired (401), logging out');
          localStorage.removeItem('token');
          logout();
          return Promise.reject(error);
        }

        // Token exists and isn't expired, but we got 401
        // This could be:
        // 1. Token was revoked on server
        // 2. User was deleted
        // 3. Some other auth issue
        // For now, clear token and logout to be safe
        console.warn('Got 401 with valid token, clearing and logging out');
        localStorage.removeItem('token');
        logout();
        return Promise.reject(error);
      }

      // For other errors, just pass them through
      return Promise.reject(error);
    }
  );
};

