import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface LoginFormSectionProps {
  email: string;
  password: string;
  error: string;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onGoogleLogin: () => void;
}

export const LoginFormSection: React.FC<LoginFormSectionProps> = ({
  email, password, error, onEmailChange, onPasswordChange, onSubmit, onGoogleLogin,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ backgroundColor: theme.colors.background.paper, padding: theme.spacing['2xl'], borderRadius: theme.borderRadius.lg, boxShadow: theme.shadows.lg, width: '100%', maxWidth: '400px' }}>
      <h1 style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.lg, fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold }}>
        {t('auth.loginTitle')}
      </h1>

      {error && (
        <div style={{ backgroundColor: `${theme.colors.accent.error}20`, color: theme.colors.accent.error, padding: theme.spacing.md, borderRadius: theme.borderRadius.md, marginBottom: theme.spacing.md }}>
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onGoogleLogin}
        style={{ width: '100%', padding: theme.spacing.md, backgroundColor: theme.colors.background.paper, color: theme.colors.text.primary, border: `1px solid ${theme.colors.border.medium}`, borderRadius: theme.borderRadius.md, fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.medium, cursor: 'pointer', marginBottom: theme.spacing.lg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm }}
      >
        <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: '18px', height: '18px' }} />
        {t('auth.continueWithGoogle')}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.lg, color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: theme.colors.border.light }} />
        <span>{t('auth.or')}</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: theme.colors.border.light }} />
      </div>

      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: theme.spacing.md }}>
          <label style={{ display: 'block', marginBottom: theme.spacing.sm, color: theme.colors.text.primary, fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.medium }}>
            {t('auth.email')}
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            required
            style={{ width: '100%', padding: theme.spacing.md, border: `1px solid ${theme.colors.border.medium}`, borderRadius: theme.borderRadius.md, fontSize: theme.typography.fontSize.base, fontFamily: theme.typography.fontFamily }}
          />
        </div>

        <div style={{ marginBottom: theme.spacing.lg }}>
          <label style={{ display: 'block', marginBottom: theme.spacing.sm, color: theme.colors.text.primary, fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.medium }}>
            {t('auth.password')}
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            required
            style={{ width: '100%', padding: theme.spacing.md, border: `1px solid ${theme.colors.border.medium}`, borderRadius: theme.borderRadius.md, fontSize: theme.typography.fontSize.base, fontFamily: theme.typography.fontFamily }}
          />
        </div>

        <button
          type="submit"
          style={{ width: '100%', padding: theme.spacing.md, backgroundColor: theme.colors.primary.main, color: COLOR_NAMED_WHITE, border: STRING_NONE, borderRadius: theme.borderRadius.md, fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.semibold, cursor: 'pointer', marginBottom: theme.spacing.md }}
          onMouseOver={(event) => { event.currentTarget.style.backgroundColor = theme.colors.primary.dark; }}
          onMouseOut={(event) => { event.currentTarget.style.backgroundColor = theme.colors.primary.main; }}
        >
          {t('auth.signIn')}
        </button>
      </form>
    </div>
  );
};
