import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useAuth } from 'contexts/AuthContext';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';
import { devLog } from 'utils/dev-logger';

const Login: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login(email, password);
      navigate('/inbox');
    } catch (err: any) {
      setError(err.response?.data?.message || t('auth.authenticationFailed'));
    }
  };


  const handleGoogleLogin = () => {
    captureEvent('google_login_initiated');
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/auth/google`;
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: theme.colors.background.default,
      padding: theme.spacing.md,
    }}>
      <div style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing['2xl'],
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.lg,
        width: '100%',
        maxWidth: '400px',
      }}>
        <h1 style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.lg,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
        }}        >
          {t('auth.loginTitle')}
        </h1>

        {error && (
          <div style={{
            backgroundColor: `${theme.colors.accent.error}20`,
            color: theme.colors.accent.error,
            padding: theme.spacing.md,
            borderRadius: theme.borderRadius.md,
            marginBottom: theme.spacing.md,
          }}>
            {error}
          </div>
        )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            style={{
              width: '100%',
              padding: theme.spacing.md,
              backgroundColor: theme.colors.background.paper,
              color: theme.colors.text.primary,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
              fontWeight: theme.typography.fontWeight.medium,
              cursor: 'pointer',
              marginBottom: theme.spacing.lg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.sm,
            }}
          >
            <img 
              src="https://www.google.com/favicon.ico" 
              alt="Google" 
              style={{ width: '18px', height: '18px' }} 
            />
            {t('auth.continueWithGoogle')}
          </button>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.md,
            marginBottom: theme.spacing.lg,
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
          }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: theme.colors.border.light }} />
            <span>{t('auth.or')}</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: theme.colors.border.light }} />
          </div>

          <form onSubmit={handleSubmit}>

          <div style={{ marginBottom: theme.spacing.md }}>
            <label style={{
              display: 'block',
              marginBottom: theme.spacing.sm,
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}>
              {t('auth.email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: theme.spacing.md,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.base,
                fontFamily: theme.typography.fontFamily,
              }}
            />
          </div>

          <div style={{ marginBottom: theme.spacing.lg }}>
            <label style={{
              display: 'block',
              marginBottom: theme.spacing.sm,
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}>
              {t('auth.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: theme.spacing.md,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.base,
                fontFamily: theme.typography.fontFamily,
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: theme.spacing.md,
              backgroundColor: theme.colors.primary.main,
              color: 'white',
              border: 'none',
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
              fontWeight: theme.typography.fontWeight.semibold,
              cursor: 'pointer',
              marginBottom: theme.spacing.md,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = theme.colors.primary.dark;
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = theme.colors.primary.main;
            }}
          >
            {t('auth.signIn')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;

