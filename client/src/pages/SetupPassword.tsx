import React, { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

const SetupPassword: React.FC = () => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const token = searchParams.get('token');

  useEffect(() => {
    // If user is already logged in, redirect to inbox
    if (user) {
      navigate('/inbox');
    }

    // If no token, redirect to login
    if (!token) {
      setError(t('auth.invalidSetupLink'));
    }
  }, [user, token, navigate, t]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!token) {
      setError(t('auth.invalidSetupLink'));
      return;
    }

    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/setup-password`, {
        token,
        password,
      });

      const { access_token } = response.data;

      // Store token in localStorage
      localStorage.setItem('token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      // Track password setup completion
      captureEvent('password_setup_completed');

      // Redirect to inbox
      navigate('/inbox');
    } catch (err: any) {
      setError(err.response?.data?.message || t('auth.setupPasswordError'));
    } finally {
      setLoading(false);
    }
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
        }}>
          {t('auth.setupAccountTitle')}
        </h1>

        <p style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.lg,
          fontSize: theme.typography.fontSize.base,
        }}>
          {t('auth.setupAccountDescription')}
        </p>

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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: theme.spacing.md }}>
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
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              style={{
                width: '100%',
                padding: theme.spacing.md,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.base,
                fontFamily: theme.typography.fontFamily,
              }}
            />
            <p style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
              marginTop: theme.spacing.xs,
            }}>
              {t('auth.passwordMinLength')}
            </p>
          </div>

          <div style={{ marginBottom: theme.spacing.lg }}>
            <label style={{
              display: 'block',
              marginBottom: theme.spacing.sm,
              color: theme.colors.text.primary,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}>
              {t('auth.confirmPassword')}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
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
            disabled={loading || !token}
            style={{
              width: '100%',
              padding: theme.spacing.md,
              backgroundColor: loading || !token ? theme.colors.border.medium : theme.colors.primary.main,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
              fontWeight: theme.typography.fontWeight.semibold,
              cursor: loading || !token ? 'not-allowed' : 'pointer',
              marginBottom: theme.spacing.md,
            }}
            onMouseOver={(event) => {
              if (!loading && token) {
                event.currentTarget.style.backgroundColor = theme.colors.primary.dark;
              }
            }}
            onMouseOut={(event) => {
              if (!loading && token) {
                event.currentTarget.style.backgroundColor = theme.colors.primary.main;
              }
            }}
          >
            {loading ? t('auth.settingUp') : t('auth.setUpAccount')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetupPassword;

