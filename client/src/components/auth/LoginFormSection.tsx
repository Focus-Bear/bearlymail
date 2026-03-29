import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface LoginFormSectionProps {
  email: string;
  password: string;
  error: string;
  /** When true, the error is an OAUTH_ONLY_ACCOUNT error and a specific message is shown. */
  isOAuthOnlyError?: boolean;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onGoogleLogin: () => void;
}

interface OAuthSectionProps {
  onGoogleLogin: () => void;
  t: (key: string) => string;
}

const OAuthSection: React.FC<OAuthSectionProps> = ({ onGoogleLogin, t }) => (
  <>
    <button
      type="button"
      onClick={onGoogleLogin}
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
      <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: '18px', height: '18px' }} />
      {t('auth.continueWithGoogle')}
    </button>

    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.lg,
        color: theme.colors.text.secondary,
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      <div style={{ flex: 1, height: '1px', backgroundColor: theme.colors.border.light }} />
      <span>{t('auth.or')}</span>
      <div style={{ flex: 1, height: '1px', backgroundColor: theme.colors.border.light }} />
    </div>
  </>
);

interface EmailPasswordFormProps {
  email: string;
  password: string;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  t: (key: string) => string;
}

const fieldInputStyle: React.CSSProperties = {
  width: '100%',
  padding: theme.spacing.md,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.base,
  fontFamily: theme.typography.fontFamily,
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: theme.spacing.sm,
  color: theme.colors.text.primary,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
};

const EmailPasswordForm: React.FC<EmailPasswordFormProps> = ({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  t,
}) => (
  <form onSubmit={onSubmit}>
    <div style={{ marginBottom: theme.spacing.md }}>
      <label htmlFor="login-email" style={fieldLabelStyle}>{t('auth.email')}</label>
      <input
        id="login-email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={event => onEmailChange(event.target.value)}
        required
        style={fieldInputStyle}
      />
    </div>

    <div style={{ marginBottom: theme.spacing.lg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm }}>
        <label htmlFor="login-password" style={{ ...fieldLabelStyle, marginBottom: 0 }}>{t('auth.password')}</label>
        <Link
          to="/forgot-password"
          style={{
            color: theme.colors.primary.main,
            fontSize: theme.typography.fontSize.sm,
            textDecoration: 'none',
          }}
        >
          {t('auth.forgotPasswordLink')}
        </Link>
      </div>
      <input
        id="login-password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={event => onPasswordChange(event.target.value)}
        required
        style={fieldInputStyle}
      />
    </div>

    <button
      type="submit"
      style={{
        width: '100%',
        padding: theme.spacing.md,
        backgroundColor: theme.colors.primary.main,
        color: COLOR_NAMED_WHITE,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.md,
        fontSize: theme.typography.fontSize.base,
        fontWeight: theme.typography.fontWeight.semibold,
        cursor: 'pointer',
        marginBottom: theme.spacing.md,
      }}
      onMouseOver={event => {
        event.currentTarget.style.backgroundColor = theme.colors.primary.dark;
      }}
      onMouseOut={event => {
        event.currentTarget.style.backgroundColor = theme.colors.primary.main;
      }}
    >
      {t('auth.signIn')}
    </button>
  </form>
);

export const LoginFormSection: React.FC<LoginFormSectionProps> = ({
  email,
  password,
  error,
  isOAuthOnlyError,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogleLogin,
}) => {
  const { t } = useTranslation();

  return (
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
        {t('auth.loginTitle')}
      </h1>

      {error && !isOAuthOnlyError && (
        <div
          role="alert"
          aria-live="polite"
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

      {isOAuthOnlyError && (
        <div
          style={{
            backgroundColor: `${theme.colors.accent.warning ?? theme.colors.accent.error}20`,
            color: theme.colors.text.primary,
            padding: theme.spacing.md,
            borderRadius: theme.borderRadius.md,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize.sm,
            lineHeight: '1.5',
          }}
        >
          <strong>{t('auth.oauthOnlyError.title')}</strong>
          <br />
          {t('auth.oauthOnlyError.description')}{' '}
          <Link
            to="/forgot-password"
            style={{ color: theme.colors.primary.main, textDecoration: 'underline' }}
          >
            {t('auth.oauthOnlyError.forgotPasswordLink')}
          </Link>
          {'.'}
        </div>
      )}

      <OAuthSection onGoogleLogin={onGoogleLogin} t={t} />

      <EmailPasswordForm
        email={email}
        password={password}
        onEmailChange={onEmailChange}
        onPasswordChange={onPasswordChange}
        onSubmit={onSubmit}
        t={t}
      />
    </div>
  );
};
