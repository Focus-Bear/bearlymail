import React, { createContext, useContext, useState } from 'react';
import axios from 'axios';
import { identifyUser, resetPostHog, captureEvent } from 'utils/posthog';
import { useAuthInitialization } from 'contexts/useAuthInitialization';
import { devLog } from 'utils/dev-logger';

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

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = () => {
    captureEvent('user_logged_out');
    resetPostHog();
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  useAuthInitialization(setUser, setLoading, logout);

  const login = async (email: string, password: string) => {
    const response = await axios.post(`${API_URL}/auth/login`, { email, password });
    const { access_token, user } = response.data;
    
    // Store token in localStorage
    localStorage.setItem('token', access_token);
    devLog('Token saved to localStorage:', localStorage.getItem('token') ? 'SUCCESS' : 'FAILED');
    
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setUser(user);
    // Track login event and identify user (NO PII)
    captureEvent('user_logged_in', {
      method: 'email',
    });
    identifyUser(user.id, {
      isAdmin: user.isAdmin,
    });
  };

  const register = async (email: string, password: string, name?: string) => {
    const response = await axios.post(`${API_URL}/auth/register`, { email, password, name });
    const { access_token, user } = response.data;
    
    // Store token in localStorage
    localStorage.setItem('token', access_token);
    devLog('Token saved to localStorage:', localStorage.getItem('token') ? 'SUCCESS' : 'FAILED');
    
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setUser(user);
    // Track registration event and identify user (NO PII)
    captureEvent('user_registered');
    identifyUser(user.id, {
      isAdmin: user.isAdmin,
    });
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

