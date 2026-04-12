import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

const ForgotPassword: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      await axios.post(`${API_URL}/auth/forgot-password`, { email });
    } catch (err) {
      // Intentionally do not reveal whether the email was found or the request failed.
      // Treat network/server errors as success to prevent timing/error-based enumeration.
      if (!import.meta.env.PROD) {
        console.error('[ForgotPassword] Request failed (hidden from user):', err);
      }
    } finally {
      setLoading(false);
      // Always show the "check your email" state, regardless of success or failure.
      // This prevents callers from distinguishing between "email exists" and "network error".
      setSubmitted(true);
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
          {t('auth.forgotPasswordTitle')}
        </h1>

        {submitted ? (
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
              {t('auth.forgotPasswordSuccess')}
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
                marginBottom: theme.spacing.lg,
                fontSize: theme.typography.fontSize.base,
              }}
            >
              {t('auth.forgotPasswordDescription')}
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: theme.spacing.lg }}>
                <label
                  htmlFor="forgot-password-email"
                  style={{
                    display: 'block',
                    marginBottom: theme.spacing.sm,
                    color: theme.colors.text.primary,
                    fontSize: theme.typography.fontSize.sm,
                    fontWeight: theme.typography.fontWeight.medium,
                  }}
                >
                  {t('auth.email')}
                </label>
                <input
                  id="forgot-password-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
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
                disabled={loading}
                style={{
                  width: '100%',
                  padding: theme.spacing.md,
                  backgroundColor: loading ? theme.colors.border.medium : theme.colors.primary.main,
                  color: COLOR_NAMED_WHITE,
                  border: STRING_NONE,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontWeight: theme.typography.fontWeight.semibold,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  marginBottom: theme.spacing.md,
                }}
                onMouseOver={event => {
                  if (!loading) {
                    event.currentTarget.style.backgroundColor = theme.colors.primary.dark;
                  }
                }}
                onMouseOut={event => {
                  if (!loading) {
                    event.currentTarget.style.backgroundColor = theme.colors.primary.main;
                  }
                }}
              >
                {loading ? t('auth.sendingResetLink') : t('auth.sendResetLink')}
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

export default ForgotPassword;
