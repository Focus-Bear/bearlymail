import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';
import { devLog } from 'utils/dev-logger';
import { captureEvent } from 'utils/posthog';

import { LoginFormSection } from 'components/auth/LoginFormSection';
import { PermissionsExplanation } from 'components/auth/PermissionsExplanation';
import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { useAuth } from 'contexts/AuthContext';

const PERMISSIONS_SEEN_KEY = 'bearlymail_permissions_explanation_seen';

const Login: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check for token in URL (from Google login redirect)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('token', token);
      devLog('Google OAuth token saved to localStorage:', localStorage.getItem('token') ? 'SUCCESS' : 'FAILED');
      // Set the axios header immediately before redirect
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // Use navigate instead of window.location to avoid full page reload issues
      // But we need a full reload to reinitialize the auth context
      window.location.href = '/inbox';
      return;
    }

    // If user is already authenticated, redirect to inbox
    if (!loading && user) {
      devLog('User already authenticated, redirecting to inbox');
      navigate('/inbox');
    }
  }, [user, loading, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      await login(email, password);
      navigate('/inbox');
    } catch (err: any) {
      setError(err.response?.data?.message || t('auth.authenticationFailed'));
    }
  };

  const handleGoogleLogin = () => {
    // Check if user has seen the permissions explanation before
    const hasSeenPermissions = localStorage.getItem(PERMISSIONS_SEEN_KEY);

    if (!hasSeenPermissions) {
      // Show permissions explanation modal
      setShowPermissionsModal(true);
    } else {
      // Proceed directly to Google OAuth
      proceedToGoogleOAuth();
    }
  };

  const proceedToGoogleOAuth = () => {
    captureEvent(ANALYTICS_EVENTS.GOOGLE_LOGIN_INITIATED);
    localStorage.setItem(PERMISSIONS_SEEN_KEY, 'true');
    window.location.href = `${API_URL}/auth/google`;
  };

  const handlePermissionsCancel = () => {
    setShowPermissionsModal(false);
  };

  return (
    <>
      {showPermissionsModal && (
        <PermissionsExplanation onContinue={proceedToGoogleOAuth} onCancel={handlePermissionsCancel} />
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
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={handleSubmit}
          onGoogleLogin={handleGoogleLogin}
        />
      </div>
    </>
  );
};

export default Login;
