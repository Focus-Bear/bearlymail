import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { devLog } from 'utils/dev-logger';
import { getAxiosErrorMessage } from 'utils/errors';
import { captureEvent } from 'utils/posthog';

import { LoginFormSection } from 'components/auth/LoginFormSection';
import { PermissionsExplanation } from 'components/auth/PermissionsExplanation';
import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { PROVIDER_ZOHO } from 'constants/strings';
import { DeletedAccountError, OAuthOnlyAccountError, useAuth } from 'contexts/AuthContext';

const PERMISSIONS_SEEN_KEY = 'bearlymail_permissions_explanation_seen';

const Login: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isOAuthOnlyError, setIsOAuthOnlyError] = useState(false);
  const [deletedAccountReason, setDeletedAccountReason] = useState<'manual' | 'inactivity' | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<'google' | 'zoho'>('google');
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();

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

  const handleGoogleLogin = () => {
    const hasSeenPermissions = localStorage.getItem(PERMISSIONS_SEEN_KEY);
    if (!hasSeenPermissions) {
      setPendingProvider('google');
      setShowPermissionsModal(true);
    } else {
      proceedToGoogleOAuth();
    }
  };

  const handleZohoLogin = () => {
    const hasSeenPermissions = localStorage.getItem(PERMISSIONS_SEEN_KEY);
    if (!hasSeenPermissions) {
      setPendingProvider('zoho');
      setShowPermissionsModal(true);
    } else {
      proceedToZohoOAuth();
    }
  };

  const handleMicrosoftLogin = () => {
    window.location.href = `${API_URL}/auth/microsoft`;
  };

  const proceedToGoogleOAuth = () => {
    captureEvent(ANALYTICS_EVENTS.GOOGLE_LOGIN_INITIATED);
    localStorage.setItem(PERMISSIONS_SEEN_KEY, 'true');
    window.location.href = `${API_URL}/auth/google`;
  };

  const proceedToZohoOAuth = () => {
    captureEvent(ANALYTICS_EVENTS.ZOHO_LOGIN_INITIATED);
    localStorage.setItem(PERMISSIONS_SEEN_KEY, 'true');
    window.location.href = `${API_URL}/auth/zoho`;
  };

  const handlePermissionsContinue = () => {
    setShowPermissionsModal(false);
    if (pendingProvider === PROVIDER_ZOHO) {
      proceedToZohoOAuth();
    } else {
      proceedToGoogleOAuth();
    }
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
        />
      </div>
    </>
  );
};

export default Login;
