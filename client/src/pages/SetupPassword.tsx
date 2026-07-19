import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';
import { getAxiosErrorMessage } from 'utils/errors';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

interface SetupPasswordFormProps {
  password: string;
  confirmPassword: string;
  error: string;
  loading: boolean;
  hasToken: boolean;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  t: (key: string) => string;
}

const SetupPasswordForm: React.FC<SetupPasswordFormProps> = ({
  password,
  confirmPassword,
  error,
  loading,
  hasToken,
  onPasswordChange,
  onConfirmChange,
  onSubmit,
  t,
}) => (
  <>
    <h1
      style={{
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.lg,
        fontSize: theme.typography.fontSize['2xl'],
        fontWeight: theme.typography.fontWeight.bold,
      }}
    >
      {t('auth.setupAccountTitle')}
    </h1>
    <p
      style={{
        color: theme.colors.text.secondary,
        marginBottom: theme.spacing.lg,
        fontSize: theme.typography.fontSize.base,
      }}
    >
      {t('auth.setupAccountDescription')}
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
    <form onSubmit={onSubmit}>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label
          htmlFor="setup-password-new"
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
          id="setup-password-new"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={event => onPasswordChange(event.target.value)}
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
          htmlFor="setup-password-confirm"
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
          id="setup-password-confirm"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={event => onConfirmChange(event.target.value)}
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
        disabled={loading || !hasToken}
        style={{
          width: '100%',
          padding: theme.spacing.md,
          backgroundColor: loading || !hasToken ? theme.colors.border.medium : theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.semibold,
          cursor: loading || !hasToken ? 'not-allowed' : 'pointer',
          marginBottom: theme.spacing.md,
        }}
        onMouseOver={event => {
          if (!loading && hasToken) {
            event.currentTarget.style.backgroundColor = theme.colors.primary.dark;
          }
        }}
        onMouseOut={event => {
          if (!loading && hasToken) {
            event.currentTarget.style.backgroundColor = theme.colors.primary.main;
          }
        }}
      >
        {loading ? t('auth.settingUp') : t('auth.setUpAccount')}
      </button>
    </form>
  </>
);

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
    if (user) {
      navigate('/inbox');
    }
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
      await axios.post(`${API_URL}/auth/setup-password`, { token, password });
      // JWT is set as an HttpOnly cookie by the server (OWASP ASVS GAP-4).
      // Use a full-page reload so useAuthInitialization re-runs and picks up the
      // new cookie to populate the user context.
      captureEvent(ANALYTICS_EVENTS.PASSWORD_SETUP_COMPLETED);
      window.location.href = '/inbox';
    } catch (err: unknown) {
      setError(getAxiosErrorMessage(err, t('auth.setupPasswordError')));
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
        <SetupPasswordForm
          password={password}
          confirmPassword={confirmPassword}
          error={error}
          loading={loading}
          hasToken={!!token}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirmPassword}
          onSubmit={handleSubmit}
          t={t}
        />
      </div>
    </div>
  );
};

export default SetupPassword;
