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

  const isTokenExpired = (token: string): boolean => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Math.floor(Date.now() / MS_PER_SECOND);
      return payload.exp ? payload.exp < now : false;
    } catch {
      return true;
    }
  };

  logoutRef.current = logout;

  useEffect(() => {
    setupAxiosInterceptors(() => {
      if (logoutRef.current) {
        logoutRef.current();
      }
    });

    const token = localStorage.getItem('token');
    console.log('Checking for token on app load:', token ? 'FOUND' : 'NOT FOUND');

    if (token) {
      if (isTokenExpired(token)) {
        console.log('Token is expired, clearing');
        localStorage.removeItem('token');
        setLoading(false);
        return;
      }

      console.log('Token found and valid, verifying with server...');

      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
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
          if (status === HTTP_UNAUTHORIZED || isTokenExpired(token)) {
            // Auth failure — clear token and redirect to login
            localStorage.removeItem('token');
            delete axios.defaults.headers.common['Authorization'];
            setUser(null);
          } else {
            // Service error (503, network error etc.) — keep token, show error state
            console.error('Service unavailable after retries, showing error state');
            setServiceError(true);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setUser, setLoading, retryCount]);
};
