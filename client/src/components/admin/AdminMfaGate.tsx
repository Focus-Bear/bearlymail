import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';
import { MFA_SETUP_REQUIRED, MFA_VERIFICATION_REQUIRED, MfaErrorType } from 'utils/mfaErrors';

import { API_URL } from 'config/api';
import { useAuth } from 'contexts/AuthContext';

const ADMIN_ROUTE_PREFIX = '/admin';

const MFA_TOKEN_LENGTH = 6;
const ENTER_KEY = 'Enter';
const COLOR_WHITE = '#fff';
const FOCUS_DELAY_MS = 50;

const MFA_STATES = {
  NONE: 'none',
  VERIFICATION_REQUIRED: 'verification-required',
  SETUP_REQUIRED: 'setup-required',
} as const;
type MfaGateState = typeof MFA_STATES[keyof typeof MFA_STATES];

interface AdminMfaContextValue {
  /** Call when an admin API request returns a 403 MFA challenge. */
  onMfaRequired: (type: MfaErrorType) => void;
  /** Increments on each successful MFA verification so data hooks can refetch. */
  mfaVerifiedAt: number;
}

const AdminMfaContext = createContext<AdminMfaContextValue>({
  onMfaRequired: () => undefined,
  mfaVerifiedAt: 0,
});

export function useAdminMfa(): AdminMfaContextValue {
  return useContext(AdminMfaContext);
}

interface AdminMfaProviderProps {
  children: React.ReactNode;
}

export const AdminMfaProvider: React.FC<AdminMfaProviderProps> = ({ children }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const isOnAdminRoute = location.pathname.startsWith(ADMIN_ROUTE_PREFIX);
  const [mfaState, setMfaState] = useState<MfaGateState>(MFA_STATES.NONE);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaVerifiedAt, setMfaVerifiedAt] = useState(0);
  const mfaInputRef = useRef<HTMLInputElement>(null);

  const onMfaRequired = useCallback((type: MfaErrorType) => {
    if (type === MFA_SETUP_REQUIRED) {
      setMfaState(MFA_STATES.SETUP_REQUIRED);
    } else if (type === MFA_VERIFICATION_REQUIRED) {
      setMfaState(prev => {
        if (prev === MFA_STATES.NONE) {
          setTimeout(() => mfaInputRef.current?.focus(), FOCUS_DELAY_MS);
        }
        return MFA_STATES.VERIFICATION_REQUIRED;
      });
    }
  }, []);

  const handleVerify = useCallback(async () => {
    if (mfaToken.length !== MFA_TOKEN_LENGTH) {
return;
}
    setMfaLoading(true);
    setMfaError(null);
    try {
      await axios.post(`${API_URL}/auth/mfa/verify`, { token: mfaToken });
      setMfaToken('');
      setMfaState(MFA_STATES.NONE);
      setMfaVerifiedAt(prev => prev + 1);
    } catch {
      setMfaError(t('admin.mfa.error'));
    } finally {
      setMfaLoading(false);
    }
  }, [mfaToken, t]);

  // Proactively prompt for MFA when an admin enters the dashboard, so tab
  // actions don't fail with 403 mid-flight. Scoped to /admin* routes — other
  // pages (inbox, email detail) only prompt reactively when an admin action
  // returns 403 via onMfaRequired.
  useEffect(() => {
    if (user?.isAdmin !== true || !isOnAdminRoute) {
return;
}
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await axios.get<{ enabled: boolean; verified: boolean }>(
          `${API_URL}/auth/mfa/status`,
        );
        if (cancelled) {
return;
}
        if (data.enabled === false) {
          onMfaRequired(MFA_SETUP_REQUIRED);
        } else if (data.verified === false) {
          onMfaRequired(MFA_VERIFICATION_REQUIRED);
        }
      } catch {
        // Best-effort probe — fall back to per-request 403 handling.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.isAdmin, isOnAdminRoute, onMfaRequired]);

  return (
    <AdminMfaContext.Provider value={{ onMfaRequired, mfaVerifiedAt }}>
      {children}
      {mfaState !== MFA_STATES.NONE && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('admin.mfa.required')}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              backgroundColor: theme.colors.background.paper,
              borderRadius: theme.borderRadius.lg,
              padding: theme.spacing.xl,
              maxWidth: '400px',
              width: '90%',
              boxShadow: theme.shadows.lg,
            }}
          >
            {mfaState === MFA_STATES.SETUP_REQUIRED && (
              <p style={{ color: theme.colors.text.secondary, margin: 0 }}>
                {t('admin.mfa.setupRequired')}
              </p>
            )}

            {mfaState === MFA_STATES.VERIFICATION_REQUIRED && (
              <>
                <p
                  style={{
                    fontWeight: theme.typography.fontWeight.medium,
                    color: theme.colors.text.primary,
                    marginTop: 0,
                    marginBottom: theme.spacing.sm,
                  }}
                >
                  {t('admin.mfa.required')}
                </p>
                <p
                  style={{
                    color: theme.colors.text.secondary,
                    fontSize: theme.typography.fontSize.sm,
                    marginTop: 0,
                    marginBottom: theme.spacing.md,
                  }}
                >
                  {t('admin.mfa.prompt')}
                </p>
                <input
                  ref={mfaInputRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={MFA_TOKEN_LENGTH}
                  value={mfaToken}
                  onChange={ev => setMfaToken(ev.target.value.replace(/\D/g, '').slice(0, MFA_TOKEN_LENGTH))}
                  onKeyDown={ev => {
                    if (ev.key === ENTER_KEY) {
void handleVerify();
}
                  }}
                  placeholder="000000"
                  disabled={mfaLoading}
                  aria-label={t('admin.mfa.tokenLabel')}
                  style={{
                    width: '160px',
                    padding: theme.spacing.sm,
                    borderRadius: theme.borderRadius.md,
                    border: `1px solid ${mfaError ? (theme.colors.feedback?.error ?? '#d32f2f') : (theme.colors.border?.default ?? '#e0e0e0')}`,
                    fontSize: theme.typography.fontSize.xl,
                    letterSpacing: '0.3em',
                    textAlign: 'center',
                    display: 'block',
                    marginBottom: theme.spacing.sm,
                  }}
                />
                {mfaError && (
                  <p
                    role="alert"
                    style={{
                      color: theme.colors.feedback?.error ?? '#d32f2f',
                      fontSize: theme.typography.fontSize.sm,
                      margin: `0 0 ${theme.spacing.sm}`,
                    }}
                  >
                    {mfaError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={mfaLoading || mfaToken.length !== MFA_TOKEN_LENGTH}
                  style={{
                    backgroundColor:
                      mfaLoading || mfaToken.length !== MFA_TOKEN_LENGTH
                        ? theme.colors.text.tertiary
                        : (theme.colors.primary?.main ?? '#1976d2'),
                    color: COLOR_WHITE,
                    border: 'none',
                    borderRadius: theme.borderRadius.md,
                    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                    cursor: mfaLoading || mfaToken.length !== MFA_TOKEN_LENGTH ? 'not-allowed' : 'pointer',
                    fontSize: theme.typography.fontSize.base,
                  }}
                >
                  {mfaLoading ? t('common.loading') : t('admin.mfa.verify')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </AdminMfaContext.Provider>
  );
};
