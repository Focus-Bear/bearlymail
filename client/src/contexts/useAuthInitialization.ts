import { useEffect, useRef } from 'react';
import axios from 'axios';
import { setupAxiosInterceptors } from 'utils/axios-interceptors';
import { identifyUser } from 'utils/posthog';

import { API_URL } from 'config/api';
import {
  HTTP_SERVER_ERROR_THRESHOLD,
  HTTP_UNAUTHORIZED,
  MAX_RETRIES,
  MS_PER_SECOND,
  RETRY_BASE_DELAY_MS,
} from 'constants/numbers';

interface User {
  id: string;
  email: string;
  name?: string;
  needsRelogin?: boolean;
  hasSeenTour?: boolean;
  hasScannedHistory?: boolean;
  isAdmin?: boolean;
  isApproved?: boolean;
  termsAcceptedAt?: string;
  privacyAcceptedAt?: string;
  termsVersion?: string;
  privacyVersion?: string;
}

const fetchUserWithRetry = async (url: string): Promise<User> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get<User>(url);
      return response.data;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      // Only retry on 5xx or network errors — not on 4xx client errors
      if (status && status < HTTP_SERVER_ERROR_THRESHOLD) {
        throw err;
      }
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** attempt));
      }
    }
  }
  throw lastError;
};

export const useAuthInitialization = (
  setUser: (user: User | null) => void,
  setLoading: (loading: boolean) => void,
  logout: () => void,
  setServiceError: (error: boolean) => void,
  retryCount: number = 0
) => {
  const logoutRef = useRef<(() => void) | null>(null);

  logoutRef.current = logout;

  useEffect(() => {
    setupAxiosInterceptors(() => {
      if (logoutRef.current) {
        logoutRef.current();
      }
    });

    // Remove any legacy localStorage token from before the HttpOnly cookie migration.
    // The JWT is now in an HttpOnly cookie sent automatically by the browser.
    // We still clear old tokens to avoid stale data in localStorage.
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];

    // Attempt to fetch the current user. The HttpOnly cookie is sent automatically
    // by the browser (withCredentials: true is set globally in config/api.ts).
    // A 401 response means the user is not logged in (no cookie or expired token).
    console.log('Checking authentication via /users/me (HttpOnly cookie)');

    fetchUserWithRetry(`${API_URL}/users/me`)
      .then(userData => {
        console.log('User data fetched successfully:', userData?.email || 'no email');
        setUser(userData);
        if (userData?.id) {
          identifyUser(userData.id, {
            isAdmin: userData.isAdmin,
          });
        }
      })
      .catch(error => {
        console.error('Failed to fetch user:', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
        });

        const status = error.response?.status;
        if (status === HTTP_UNAUTHORIZED) {
          // No valid cookie / token — user is not logged in
          setUser(null);
        } else {
          // Service error (503, network error etc.) — show error state
          console.error('Service unavailable after retries, showing error state');
          setServiceError(true);
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-existing: setServiceError is stable
  }, [setUser, setLoading, retryCount]);
};
