import { useEffect, useRef } from 'react';
import axios from 'axios';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { identifyUser } from 'utils/posthog';
import { setupAxiosInterceptors } from 'utils/axios-interceptors';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

export const useAuthInitialization = (
  setUser: (user: User | null) => void,
  setLoading: (loading: boolean) => void,
  logout: () => void
) => {
  const logoutRef = useRef<(() => void) | null>(null);

  const isTokenExpired = (token: string): boolean => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
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
      axios.get(`${API_URL}/users/me`)
        .then((response) => {
          const userData = response.data;
          console.log('User data fetched successfully:', userData?.email || 'no email');
          setUser(userData);
          if (userData?.id) {
            identifyUser(userData.id, {
              isAdmin: userData.isAdmin,
            });
          }
        })
        .catch((error) => {
          console.error('Failed to fetch user:', {
            status: error.response?.status,
            message: error.message,
            url: error.config?.url,
          });
          
          if (error.response?.status === HTTP_UNAUTHORIZED || isTokenExpired(token)) {
            console.log('Auth failed (401 or expired), clearing token and user state');
            localStorage.removeItem('token');
            delete axios.defaults.headers.common['Authorization'];
            setUser(null);
          } else {
            console.warn('Failed to fetch user (non-auth error), keeping token but setting user to null:', error.message);
            setUser(null);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [setUser, setLoading]);
};


