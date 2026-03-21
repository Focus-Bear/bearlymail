import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';
import { devLog } from 'utils/dev-logger';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

const REDIRECT_DELAY_MS = 1500;

const ResetPassword: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/inbox');
    }
  }, [authLoading, user, navigate]);

  if (!token) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', padding: theme.spacing['2xl'] }}>
          <p style={{ color: theme.colors.accent.error, marginBottom: theme.spacing.lg }}>
            {t('auth.resetPassword.invalidLink')}
          </p>
          <Link to="/forgot-password" style={{ color: theme.colors.primary.main }}>
            {t('auth.resetPassword.requestNewLink')}
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

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
      const response = await axios.post(`${API_URL}/auth/reset-password`, {
        token,
        password,
      });

      const { access_token } = response.data;
      if (access_token) {
        // Auto-log in on success
        localStorage.setItem('token', access_token);
        devLog('Reset-password token saved:', localStorage.getItem('token') ? 'SUCCESS' : 'FAILED');
        axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/inbox';
        }, REDIRECT_DELAY_MS);
      } else {
        setSuccess(true);
        navigate('/login');
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.message || t('auth.resetPassword.error'),
      );
    } finally {
      setLoading(false);
    }
  };

  const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: theme.spacing.sm,
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
  };

  const fieldInputStyle: React.CSSProperties = {
    width: '100%',
    padding: theme.spacing.md,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSize.base,
    fontFamily: theme.typography.fontFamily,
  };

  return (
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
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing['2xl'],
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          width: '100%',
          maxWidth: '400px',
        }}
      >
        <h1
          style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.lg,
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
          }}
        >
          {t('auth.resetPassword.title')}
        </h1>

        {success ? (
          <p style={{ color: theme.colors.text.secondary }}>
            {t('auth.resetPassword.success')}
          </p>
        ) : (
          <>
            <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
              {t('auth.resetPassword.description')}
            </p>

            {error && (
              <div
                style={{
                  backgroundColor: `${theme.colors.accent.error}20`,
                  color: theme.colors.accent.error,
                  padding: theme.spacing.md,
                  borderRadius: theme.borderRadius.md,
                  marginBottom: theme.spacing.md,
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: theme.spacing.md }}>
                <label style={fieldLabelStyle}>{t('auth.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                  minLength={8}
                  style={fieldInputStyle}
                />
                <p style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary, marginTop: theme.spacing.xs }}>
                  {t('auth.passwordMinLength')}
                </p>
              </div>

              <div style={{ marginBottom: theme.spacing.lg }}>
                <label style={fieldLabelStyle}>{t('auth.confirmPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                  style={fieldInputStyle}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: theme.spacing.md,
                  backgroundColor: loading ? theme.colors.primary.light : theme.colors.primary.main,
                  color: COLOR_NAMED_WHITE,
                  border: STRING_NONE,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontWeight: theme.typography.fontWeight.semibold,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: theme.spacing.md,
                }}
              >
                {loading ? t('auth.resetPassword.resetting') : t('auth.resetPassword.submit')}
              </button>
            </form>

            <Link
              to="/login"
              style={{ color: theme.colors.primary.main, textDecoration: STRING_NONE, fontSize: theme.typography.fontSize.sm }}
            >
              {t('auth.backToLogin')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
