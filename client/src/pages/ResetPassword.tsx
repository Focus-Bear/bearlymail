import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { TOAST_DURATION_MS } from 'constants/numbers';
import { ENV_PRODUCTION, STRING_NONE } from 'constants/strings';

const ResetPassword: React.FC = () => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setError(t('auth.invalidResetLink'));
    }
  }, [token, t]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!token) {
      setError(t('auth.invalidResetLink'));
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
      await axios.post(`${API_URL}/auth/reset-password`, { token, password });
      setSuccess(true);
      // Redirect to login after a short delay
      setTimeout(() => {
        navigate('/login');
      }, TOAST_DURATION_MS);
    } catch (err: unknown) {
      if (import.meta.env.MODE !== ENV_PRODUCTION) {
         
        console.error('[ResetPassword] Backend error:', err instanceof Error ? err.message : String(err));
      }
      setError(t('auth.resetPasswordError'));
    } finally {
      setLoading(false);
    }
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
          {t('auth.resetPasswordTitle')}
        </h1>

        {success ? (
          <>
            <div
              style={{
                backgroundColor: `${theme.colors.accent.success ?? theme.colors.primary.main}20`,
                color: theme.colors.accent.success ?? theme.colors.primary.main,
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                marginBottom: theme.spacing.lg,
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('auth.resetPasswordSuccess')}
            </div>
            <Link
              to="/login"
              style={{
                display: 'block',
                textAlign: 'center',
                color: theme.colors.primary.main,
                fontSize: theme.typography.fontSize.sm,
                textDecoration: 'none',
              }}
            >
              {t('auth.backToLogin')}
            </Link>
          </>
        ) : (
          <>
            <p
              style={{
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.md,
                fontSize: theme.typography.fontSize.base,
              }}
            >
              {t('auth.resetPasswordDescription')}
            </p>

            <div
              role="note"
              style={{
                backgroundColor: `${theme.colors.accent.warning ?? theme.colors.primary.main}20`,
                color: theme.colors.text.primary,
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                marginBottom: theme.spacing.lg,
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('auth.resetPassword.tokenExpiry')}
            </div>

            {error && (
              <div
                role="alert"
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
                <label
                  htmlFor="reset-password-new"
                  style={{
                    display: 'block',
                    marginBottom: theme.spacing.sm,
                    color: theme.colors.text.primary,
                    fontSize: theme.typography.fontSize.sm,
                    fontWeight: theme.typography.fontWeight.medium,
                  }}
                >
                  {t('auth.password')}
                </label>
                <input
                  id="reset-password-new"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                  minLength={8}
                  disabled={!token}
                  style={{
                    width: '100%',
                    padding: theme.spacing.md,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.md,
                    fontSize: theme.typography.fontSize.base,
                    fontFamily: theme.typography.fontFamily,
                  }}
                />
                <p
                  style={{
                    fontSize: theme.typography.fontSize.xs,
                    color: theme.colors.text.secondary,
                    marginTop: theme.spacing.xs,
                  }}
                >
                  {t('auth.passwordMinLength')}
                </p>
              </div>

              <div style={{ marginBottom: theme.spacing.lg }}>
                <label
                  htmlFor="reset-password-confirm"
                  style={{
                    display: 'block',
                    marginBottom: theme.spacing.sm,
                    color: theme.colors.text.primary,
                    fontSize: theme.typography.fontSize.sm,
                    fontWeight: theme.typography.fontWeight.medium,
                  }}
                >
                  {t('auth.confirmPassword')}
                </label>
                <input
                  id="reset-password-confirm"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                  disabled={!token}
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
                onMouseOver={event => {
                  if (!loading && token) {
                    event.currentTarget.style.backgroundColor = theme.colors.primary.dark;
                  }
                }}
                onMouseOut={event => {
                  if (!loading && token) {
                    event.currentTarget.style.backgroundColor = theme.colors.primary.main;
                  }
                }}
              >
                {loading ? t('auth.resettingPassword') : t('auth.resetPassword.submit')}
              </button>
            </form>

            <Link
              to="/login"
              style={{
                display: 'block',
                textAlign: 'center',
                color: theme.colors.primary.main,
                fontSize: theme.typography.fontSize.sm,
                textDecoration: 'none',
              }}
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
