import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { DELETION_REASON_INACTIVITY, STRING_NONE } from 'constants/strings';

interface LoginFormSectionProps {
  email: string;
  password: string;
  error: string;
  /** When true, the error is an OAUTH_ONLY_ACCOUNT error and a specific message is shown. */
  isOAuthOnlyError?: boolean;
  /**
   * When set, the account was deleted for this reason and a specific
   * "data was deleted" message is shown instead of the generic error.
   */
  deletedAccountReason?: 'manual' | 'inactivity' | null;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onGoogleLogin: () => void;
  onMicrosoftLogin: () => void;
  onZohoLogin: () => void;
  /** True when the local Apple Mail bridge is reachable (macOS local server only). */
  appleMailLoginAvailable?: boolean;
  /** Handler for the "Continue with Apple Mail" button. */
  onAppleMailLogin?: () => void;
}

interface OAuthSectionProps {
  onGoogleLogin: () => void;
  onMicrosoftLogin: () => void;
  onZohoLogin: () => void;
  t: (key: string) => string;
}

const oauthButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: theme.spacing.md,
  backgroundColor: theme.colors.background.paper,
  color: theme.colors.text.primary,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.medium,
  cursor: 'pointer',
  marginBottom: theme.spacing.md,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.spacing.sm,
};

const OAuthSection: React.FC<OAuthSectionProps> = ({ onGoogleLogin, onMicrosoftLogin, onZohoLogin, t }) => (
  <>
    <button type="button" onClick={onGoogleLogin} style={oauthButtonStyle}>
      <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: '18px', height: '18px' }} />
      {t('auth.continueWithGoogle')}
    </button>

    <button type="button" onClick={onMicrosoftLogin} style={oauthButtonStyle}>
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 21 21">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
      {t('auth.continueWithMicrosoft')}
    </button>

    <button type="button" onClick={onZohoLogin} style={{ ...oauthButtonStyle, marginBottom: theme.spacing.lg }}>
      <img src="https://www.zoho.com/favicon.ico" alt="Zoho" style={{ width: '18px', height: '18px' }} />
      {t('auth.continueWithZoho')}
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

interface AppleMailSectionProps {
  onAppleMailLogin: () => void;
  t: (key: string) => string;
}

/**
 * Prominent, recommended primary login action shown only when the local Apple
 * Mail bridge is available (macOS local server). Rendered above the OAuth and
 * email/password options and styled as the primary call to action.
 */
const AppleMailSection: React.FC<AppleMailSectionProps> = ({ onAppleMailLogin, t }) => (
  <>
    <button
      type="button"
      onClick={onAppleMailLogin}
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
        marginBottom: theme.spacing.sm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
      }}
      onMouseOver={event => {
        event.currentTarget.style.backgroundColor = theme.colors.primary.dark;
      }}
      onMouseOut={event => {
        event.currentTarget.style.backgroundColor = theme.colors.primary.main;
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 384 512" fill={COLOR_NAMED_WHITE} aria-hidden="true">
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
      </svg>
      {t('auth.continueWithAppleMail')}
    </button>

    <div
      style={{
        textAlign: 'center',
        marginBottom: theme.spacing.lg,
        color: theme.colors.text.secondary,
        fontSize: theme.typography.fontSize.sm,
        fontWeight: theme.typography.fontWeight.medium,
      }}
    >
      {t('auth.recommended')}
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
      <label htmlFor="login-email" style={fieldLabelStyle}>
        {t('auth.email')}
      </label>
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.sm,
        }}
      >
        <label htmlFor="login-password" style={{ ...fieldLabelStyle, marginBottom: 0 }}>
          {t('auth.password')}
        </label>
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
  deletedAccountReason,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onGoogleLogin,
  onMicrosoftLogin,
  onZohoLogin,
  appleMailLoginAvailable,
  onAppleMailLogin,
}) => {
  const { t } = useTranslation();

  const isDeletedAccountError = !!deletedAccountReason;

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

      {error && !isOAuthOnlyError && !isDeletedAccountError && (
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
          <Link to="/forgot-password" style={{ color: theme.colors.primary.main, textDecoration: 'underline' }}>
            {t('auth.oauthOnlyError.forgotPasswordLink')}
          </Link>
          {'.'}
        </div>
      )}

      {isDeletedAccountError && (
        <div
          role="alert"
          aria-live="polite"
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
          <strong>
            {deletedAccountReason === DELETION_REASON_INACTIVITY
              ? t('auth.deletedAccountError.inactivityTitle')
              : t('auth.deletedAccountError.manualTitle')}
          </strong>
          <br />
          {deletedAccountReason === DELETION_REASON_INACTIVITY
            ? t('auth.deletedAccountError.inactivityDescription')
            : t('auth.deletedAccountError.manualDescription')}{' '}
          <Link to="/privacy-policy" style={{ color: theme.colors.primary.main, textDecoration: 'underline' }}>
            {t('auth.deletedAccountError.privacyPolicyLink')}
          </Link>
          {'.'}
        </div>
      )}

      {appleMailLoginAvailable && onAppleMailLogin && (
        <AppleMailSection onAppleMailLogin={onAppleMailLogin} t={t} />
      )}

      <OAuthSection onGoogleLogin={onGoogleLogin} onMicrosoftLogin={onMicrosoftLogin} onZohoLogin={onZohoLogin} t={t} />

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
