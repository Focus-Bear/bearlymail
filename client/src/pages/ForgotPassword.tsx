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
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await axios.post(`${API_URL}/auth/forgot-password`, { email });
      setSubmitted(true);
    } catch (_err) {
      // We intentionally don't reveal whether the email was found.
      // Treat network/server errors as success to keep the UX consistent.
      setSubmitted(true);
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
            marginBottom: theme.spacing.sm,
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
          }}
        >
          {t('auth.forgotPassword.title')}
        </h1>

        {!submitted ? (
          <>
            <p
              style={{
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.lg,
                fontSize: theme.typography.fontSize.base,
              }}
            >
              {t('auth.forgotPassword.description')}
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
              <div style={{ marginBottom: theme.spacing.lg }}>
                <label style={fieldLabelStyle}>{t('auth.email')}</label>
                <input
                  type="email"
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
                {loading
                  ? t('auth.forgotPassword.sending')
                  : t('auth.forgotPassword.submit')}
              </button>
            </form>
          </>
        ) : (
          <div>
            <p
              style={{
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.lg,
                fontSize: theme.typography.fontSize.base,
              }}
            >
              {t('auth.forgotPassword.checkEmail')}
            </p>
          </div>
        )}

        <Link
          to="/login"
          style={{
            color: theme.colors.primary.main,
            textDecoration: STRING_NONE,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('auth.backToLogin')}
        </Link>
      </div>
    </div>
  );
};

export default ForgotPassword;
