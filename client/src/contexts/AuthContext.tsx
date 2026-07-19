import React, { createContext, useCallback, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { devLog } from 'utils/dev-logger';
import { CACHE_VERSION } from 'utils/emailCache';
import { captureEvent, identifyUser, resetPostHog } from 'utils/posthog';
import { LOGIN_METHOD_EMAIL, markSessionExpired, SESSION_EXPIRED_REASON, setLastLoginMethod } from 'utils/sessionState';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_WHITE } from 'constants/colors';
import { AUTH_ERROR_ACCOUNT_DELETED, AUTH_ERROR_OAUTH_ONLY } from 'constants/strings';
import { useAuthInitialization } from 'contexts/useAuthInitialization';

/**
 * Clears all BearlyMail-owned localStorage entries (email cache, batch status,
 * tab count cache, etc.) that may contain sensitive user data.
 * Called on logout to prevent data leakage to the next browser session or user.
 * (OWASP ASVS req 8.3.6)
 */
function clearSensitiveLocalStorage(): void {
  try {
    const prefix = `bearlymail_${CACHE_VERSION}_`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch {
    // Fail silently — logout must always complete
  }
}

export interface User {
  id: string;
  email: string;
  name?: string;
  needsRelogin?: boolean;
  hasSeenTour?: boolean;
  hasScannedHistory?: boolean;
  /** True when the initial sync skipped older mail (cap/window) — shows the inbox banner. */
  syncWindowLimited?: boolean;
  isAdmin?: boolean;
  isApproved?: boolean;
  termsAcceptedAt?: string;
  privacyAcceptedAt?: string;
  termsVersion?: string;
  privacyVersion?: string;
}

/**
 * Thrown by login() when the server returns OAUTH_ONLY_ACCOUNT.
 * The caller (Login page) should check `error instanceof OAuthOnlyAccountError`
 * to render a specific, actionable message instead of the generic auth error.
 */
export class OAuthOnlyAccountError extends Error {
  constructor() {
    super('OAUTH_ONLY_ACCOUNT');
    this.name = 'OAuthOnlyAccountError';
  }
}

/**
 * Thrown by login() when the server returns ACCOUNT_DELETED.
 * The caller (Login page) should check `error instanceof DeletedAccountError`
 * to render a "your data was deleted per our privacy policy" message.
 */
export class DeletedAccountError extends Error {
  readonly deletionReason: 'manual' | 'inactivity';

  constructor(deletionReason: 'manual' | 'inactivity' = 'manual') {
    super('ACCOUNT_DELETED');
    this.name = 'DeletedAccountError';
    this.deletionReason = deletionReason;
  }
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /**
   * Log in via the local Apple Mail bridge (macOS-only, dev/local server). The
   * server sets the HttpOnly JWT cookie, connects Apple Mail, and starts a sync.
   * Only reachable when GET /auth/apple-mail-local/available returns true.
   */
  loginWithAppleMail: () => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  /**
   * Log the user out. Pass reason 'session_expired' for involuntary logouts
   * (expired/invalid token → 401) so the login screen can explain why and offer
   * the remembered method. Omit the reason for an intentional, user-initiated
   * logout.
   */
  logout: (reason?: typeof SESSION_EXPIRED_REASON) => void;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ServiceErrorScreen: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        gap: '16px',
        fontFamily: 'sans-serif',
      }}
    >
      <p style={{ fontSize: '18px', margin: 0 }}>
        {t('serviceError.message', 'BearlyMail is temporarily unavailable. Please try again.')}
      </p>
      <button
        onClick={onRetry}
        style={{
          padding: '10px 24px',
          fontSize: '16px',
          cursor: 'pointer',
          borderRadius: '6px',
          border: '1px solid #ccc',
          backgroundColor: COLOR_WHITE,
        }}
      >
        {t('serviceError.retry', 'Retry')}
      </button>
    </div>
  );
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [serviceError, setServiceError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const logout = useCallback((reason?: typeof SESSION_EXPIRED_REASON) => {
    captureEvent(ANALYTICS_EVENTS.USER_LOGGED_OUT);
    resetPostHog();
    // Remove any legacy localStorage token that may have been stored before the
    // HttpOnly cookie migration (OWASP ASVS GAP-4). Also clear sensitive cache.
    localStorage.removeItem('token');
    clearSensitiveLocalStorage();
    // Involuntary logout (expired/invalid token): leave a one-shot flag so the
    // login screen shows "you'll need to log in again" instead of appearing
    // unprompted. Set AFTER clearSensitiveLocalStorage so it isn't wiped.
    if (reason === SESSION_EXPIRED_REASON) {
      markSessionExpired();
    }
    delete axios.defaults.headers.common['Authorization'];
    // Ask the server to clear the HttpOnly cookie (client JS cannot clear it directly).
    // Pass _skipInterceptor so a 401 from an already-expired session doesn't re-enter
    // the response interceptor and recursively call logout().
    axios.post(`${API_URL}/auth/logout`, {}, { _skipInterceptor: true }).catch(() => {
      // Ignore errors — the user is logged out locally regardless
    });
    setUser(null);
  }, []);

  const handleRetry = useCallback(() => {
    setServiceError(false);
    setLoading(true);
    setRetryCount(prev => prev + 1);
  }, []);

  useAuthInitialization(setUser, setLoading, logout, setServiceError, retryCount);

  if (serviceError) {
    return <ServiceErrorScreen onRetry={handleRetry} />;
  }

  const login = async (email: string, password: string) => {
    let response;
    try {
      response = await axios.post(`${API_URL}/auth/login`, { email, password });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { error?: string; deletionReason?: string } | undefined;
        // Detect OAUTH_ONLY_ACCOUNT and surface a typed error so the UI can
        // render a specific, actionable message.
        if (data?.error === AUTH_ERROR_OAUTH_ONLY) {
          throw new OAuthOnlyAccountError();
        }
        // Detect ACCOUNT_DELETED and surface a typed error with the reason.
        if (data?.error === AUTH_ERROR_ACCOUNT_DELETED) {
          throw new DeletedAccountError(
            (data.deletionReason as 'manual' | 'inactivity') ?? 'manual',
          );
        }
      }
      throw err;
    }
    const { user } = response.data;
    // The JWT is now set as an HttpOnly cookie by the server (OWASP ASVS GAP-4).
    // No token storage in localStorage; the browser sends the cookie automatically
    // on every subsequent request to the API.
    devLog('Login successful — JWT stored in HttpOnly cookie by server');

    setUser(user);
    // Remember the method so the "session expired" screen can offer it first.
    setLastLoginMethod(LOGIN_METHOD_EMAIL);
    // Track login event and identify user (NO PII)
    captureEvent(ANALYTICS_EVENTS.USER_LOGGED_IN, {
      method: 'email',
    });
    identifyUser(user.id, {
      isAdmin: user.isAdmin,
    });
  };

  const loginWithAppleMail = async () => {
    const response = await axios.post(`${API_URL}/auth/apple-mail-local`);
    const { user } = response.data;
    // JWT is set as an HttpOnly cookie by the server (see login() above).
    devLog('Apple Mail local login successful — JWT stored in HttpOnly cookie by server');
    setUser(user);
    captureEvent(ANALYTICS_EVENTS.USER_LOGGED_IN, {
      method: 'apple-mail-local',
    });
    identifyUser(user.id, {
      isAdmin: user.isAdmin,
    });
  };

  const register = async (email: string, password: string, name?: string) => {
    const response = await axios.post(`${API_URL}/auth/register`, { email, password, name });
    const { user } = response.data;
    // JWT is set as an HttpOnly cookie by the server (see login() above)
    setUser(user);
    // Track registration event and identify user (NO PII)
    captureEvent(ANALYTICS_EVENTS.USER_REGISTERED);
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
    <AuthContext.Provider value={{ user, loading, login, loginWithAppleMail, register, logout, refreshUser }}>
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
