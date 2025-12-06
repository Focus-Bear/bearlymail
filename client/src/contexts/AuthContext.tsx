import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { identifyUser, resetPostHog, posthog, isPostHogLoaded } from '../utils/posthog';
import { setupAxiosInterceptors } from '../utils/axios-interceptors';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>; // Added to refresh user data
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const logoutRef = useRef<(() => void) | null>(null);

  // Check if token is expired
  const isTokenExpired = (token: string): boolean => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      return payload.exp ? payload.exp < now : false;
    } catch {
      return true; // If we can't decode it, consider it invalid
    }
  };

  const logout = () => {
    // Track logout event
    if (isPostHogLoaded()) {
      posthog.capture('user_logged_out');
      resetPostHog();
    }
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  logoutRef.current = logout;

  useEffect(() => {
    // Set up axios interceptors once
    setupAxiosInterceptors(() => {
      if (logoutRef.current) {
        logoutRef.current();
      }
    });

    const token = localStorage.getItem('token');
    console.log('Checking for token on app load:', token ? 'FOUND' : 'NOT FOUND');
    
    if (token) {
      // Check if token is expired before making request
      if (isTokenExpired(token)) {
        console.log('Token is expired, clearing');
        localStorage.removeItem('token');
        setLoading(false);
        return;
      }
      
      console.log('Token found and valid, verifying with server...');

      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // Verify token and get user
      axios.get(`${API_URL}/users/me`)
        .then((response) => {
          const userData = response.data;
          console.log('User data fetched successfully:', userData?.email || 'no email');
          setUser(userData);
          // Identify user in PostHog
          if (userData?.id) {
            identifyUser(userData.id, userData.email, {
              name: userData.name,
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
          
          // Only remove token if it's an auth error (401) or token is expired
          if (error.response?.status === 401 || isTokenExpired(token)) {
            console.log('Auth failed (401 or expired), clearing token and user state');
            localStorage.removeItem('token');
            delete axios.defaults.headers.common['Authorization'];
            setUser(null); // Explicitly set user to null
          } else {
            // For other errors (network, server), keep the token but set user to null
            // This way PrivateRoute will redirect to login, but token is preserved for retry
            console.warn('Failed to fetch user (non-auth error), keeping token but setting user to null:', error.message);
            setUser(null);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const response = await axios.post(`${API_URL}/auth/login`, { email, password });
    const { access_token, user } = response.data;
    
    // Store token in localStorage
    localStorage.setItem('token', access_token);
    console.log('Token saved to localStorage:', localStorage.getItem('token') ? 'SUCCESS' : 'FAILED');
    
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setUser(user);
    // Track login event and identify user
    if (isPostHogLoaded()) {
      posthog.capture('user_logged_in', {
        email: user.email,
        method: 'email',
      });
      identifyUser(user.id, user.email, {
        name: user.name,
        isAdmin: user.isAdmin,
      });
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    const response = await axios.post(`${API_URL}/auth/register`, { email, password, name });
    const { access_token, user } = response.data;
    
    // Store token in localStorage
    localStorage.setItem('token', access_token);
    console.log('Token saved to localStorage:', localStorage.getItem('token') ? 'SUCCESS' : 'FAILED');
    
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setUser(user);
    // Track registration event and identify user
    if (isPostHogLoaded()) {
      posthog.capture('user_registered', {
        email: user.email,
      });
      identifyUser(user.id, user.email, {
        name: user.name,
        isAdmin: user.isAdmin,
      });
    }
  };

  const refreshUser = async () => {
    try {
      const response = await axios.get(`${API_URL}/users/me`);
      setUser(response.data);
    } catch (error) {
      console.error('Failed to refresh user', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

