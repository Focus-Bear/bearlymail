import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';
import { devLog } from 'utils/dev-logger';
import { getAxiosErrorMessage } from 'utils/errors';
import { captureEvent } from 'utils/posthog';
import {
  consumeSessionExpired,
  getLastLoginMethod,
  LoginMethod,
  setLastLoginMethod,
} from 'utils/sessionState';

import { LoginFormSection } from 'components/auth/LoginFormSection';
import type { OAuthProvider } from 'components/auth/oauth-permissions';
import { PermissionsExplanation } from 'components/auth/PermissionsExplanation';
import { SessionExpiredBanner } from 'components/auth/SessionExpiredBanner';
import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { PROVIDER_GOOGLE, PROVIDER_MICROSOFT, PROVIDER_ZOHO } from 'constants/strings';
import { DeletedAccountError, OAuthOnlyAccountError, useAuth } from 'contexts/AuthContext';

const PERMISSIONS_SEEN_KEY = 'bearlymail_permissions_explanation_seen';

const OAUTH_START_PATHS: Record<OAuthProvider, string> = {
  [PROVIDER_GOOGLE]: '/auth/google',
  [PROVIDER_MICROSOFT]: '/auth/microsoft',
  [PROVIDER_ZOHO]: '/auth/zoho',
};

const OAUTH_INITIATED_EVENTS: Partial<Record<OAuthProvider, string>> = {
  [PROVIDER_GOOGLE]: ANALYTICS_EVENTS.GOOGLE_LOGIN_INITIATED,
  [PROVIDER_ZOHO]: ANALYTICS_EVENTS.ZOHO_LOGIN_INITIATED,
};

const Login: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isOAuthOnlyError, setIsOAuthOnlyError] = useState(false);
  const [deletedAccountReason, setDeletedAccountReason] = useState<'manual' | 'inactivity' | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider>(PROVIDER_GOOGLE);
  const { login, loginWithAppleMail, user, loading } = useAuth();
  const navigate = useNavigate();
  const [sessionExpired, setSessionExpired] = useState(false);
  const [lastMethod, setLastMethod] = useState<LoginMethod | null>(null);
  const [appleMailLoginAvailable, setAppleMailLoginAvailable] = useState(false);

  useEffect(() => {
    // Read the remembered method and the one-shot "session expired" flag set by
    // an involuntary logout. consumeSessionExpired() clears the flag so a manual
    // refresh of /login doesn't keep showing the banner. (StrictMode may run this
    // twice in dev; the second read returns false and we never unset the state.)
    setLastMethod(getLastLoginMethod());
    if (consumeSessionExpired()) {
      setSessionExpired(true);
    }
  }, []);

  useEffect(() => {
    // The Apple Mail bridge is only reachable when the server runs locally on
    // macOS. Probe availability so we only surface the button when it works.
    let cancelled = false;
    axios
      .get(`${API_URL}/auth/apple-mail-local/available`)
      .then(response => {
        if (!cancelled) {
          setAppleMailLoginAvailable(!!response.data?.available);
        }
      })
      .catch(() => {
        // Ignore errors — treat an unreachable/failed probe as "not available".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // OAuth callbacks now set an HttpOnly cookie and redirect directly to /inbox
    // (OWASP ASVS GAP-4). The legacy #token= URL fragment is no longer used.

    // If user is already authenticated (cookie still valid), redirect to inbox
    if (!loading && user) {
      devLog('User already authenticated, redirecting to inbox');
      navigate('/inbox');
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsOAuthOnlyError(false);
    setDeletedAccountReason(null);

    try {
      await login(email, password);
      navigate('/inbox');
    } catch (err: unknown) {
      if (err instanceof OAuthOnlyAccountError) {
        setIsOAuthOnlyError(true);
        // Set a non-empty error string so the error block renders (handled by isOAuthOnlyError flag)
        setError('OAUTH_ONLY_ACCOUNT');
      } else if (err instanceof DeletedAccountError) {
        setDeletedAccountReason(err.deletionReason);
        setError('ACCOUNT_DELETED');
      } else {
        setError(getAxiosErrorMessage(err, t('auth.authenticationFailed')));
      }
    }
  };

  const handleAppleMailLogin = async () => {
    setError('');
    setIsOAuthOnlyError(false);
    setDeletedAccountReason(null);

    try {
      await loginWithAppleMail();
      navigate('/inbox');
    } catch (err: unknown) {
      setError(getAxiosErrorMessage(err, t('auth.authenticationFailed')));
    }
  };

  const proceedToOAuth = (provider: OAuthProvider) => {
    const initiatedEvent = OAUTH_INITIATED_EVENTS[provider];
    if (initiatedEvent) {
      captureEvent(initiatedEvent);
    }
    localStorage.setItem(PERMISSIONS_SEEN_KEY, 'true');
    setLastLoginMethod(provider);
    window.location.href = `${API_URL}${OAUTH_START_PATHS[provider]}`;
  };

  const requestOAuth = (provider: OAuthProvider) => {
    if (localStorage.getItem(PERMISSIONS_SEEN_KEY)) {
      proceedToOAuth(provider);
      return;
    }
    setPendingProvider(provider);
    setShowPermissionsModal(true);
  };

  const handleGoogleLogin = () => requestOAuth(PROVIDER_GOOGLE);
  const handleMicrosoftLogin = () => requestOAuth(PROVIDER_MICROSOFT);
  const handleZohoLogin = () => requestOAuth(PROVIDER_ZOHO);

  const handlePermissionsContinue = () => {
    setShowPermissionsModal(false);
    proceedToOAuth(pendingProvider);
  };

  const handlePermissionsCancel = () => {
    setShowPermissionsModal(false);
  };

  return (
    <>
      {showPermissionsModal && (
        <PermissionsExplanation provider={pendingProvider} onContinue={handlePermissionsContinue} onCancel={handlePermissionsCancel} />
      )}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          backgroundColor: theme.colors.background.default,
          padding: theme.spacing.md,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            maxWidth: '400px',
          }}
        >
          {sessionExpired && (
            <SessionExpiredBanner
              lastMethod={lastMethod}
              onContinueGoogle={handleGoogleLogin}
              onContinueMicrosoft={handleMicrosoftLogin}
              onContinueZoho={handleZohoLogin}
            />
          )}
          <LoginFormSection
            email={email}
            password={password}
            error={error}
            isOAuthOnlyError={isOAuthOnlyError}
            deletedAccountReason={deletedAccountReason}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmit={handleSubmit}
            onGoogleLogin={handleGoogleLogin}
            onMicrosoftLogin={handleMicrosoftLogin}
            onZohoLogin={handleZohoLogin}
            appleMailLoginAvailable={appleMailLoginAvailable}
            onAppleMailLogin={handleAppleMailLogin}
          />
        </div>
      </div>
    </>
  );
};

export default Login;
