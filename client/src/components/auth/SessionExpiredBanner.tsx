import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { LoginMethod } from 'utils/sessionState';

interface SessionExpiredBannerProps {
  /** The method the user last signed in with, or null if unknown. */
  lastMethod: LoginMethod | null;
  onContinueGoogle: () => void;
  onContinueMicrosoft: () => void;
  onContinueZoho: () => void;
}

/**
 * Per-method copy. OAuth methods get a `ctaKey` (a shortcut button); `email`
 * has none because the email/password form already renders below the banner.
 */
const METHOD_COPY: Record<LoginMethod, { lastUsedKey: string; ctaKey?: string }> = {
  google: { lastUsedKey: 'auth.sessionExpired.lastUsedGoogle', ctaKey: 'auth.continueWithGoogle' },
  microsoft: { lastUsedKey: 'auth.sessionExpired.lastUsedMicrosoft', ctaKey: 'auth.continueWithMicrosoft' },
  zoho: { lastUsedKey: 'auth.sessionExpired.lastUsedZoho', ctaKey: 'auth.continueWithZoho' },
  email: { lastUsedKey: 'auth.sessionExpired.lastUsedEmail' },
};

const containerStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.accent.error}`,
  borderRadius: theme.borderRadius.md,
  padding: theme.spacing.lg,
  marginBottom: theme.spacing.lg,
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: theme.spacing.sm,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: theme.typography.fontSize.xl,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.primary,
};

const textStyle: React.CSSProperties = {
  margin: 0,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.secondary,
};

const ctaStyle: React.CSSProperties = {
  marginTop: theme.spacing.xs,
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.common.white,
  border: 'none',
  borderRadius: theme.borderRadius.sm,
  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
  fontWeight: theme.typography.fontWeight.semibold,
  fontSize: theme.typography.fontSize.md,
  cursor: 'pointer',
};

/**
 * Shown at the top of the login screen after an involuntary logout (an expired
 * or invalid session → 401). Explains *why* the user is back at login and, when
 * we know how they last signed in, offers that method as a prominent shortcut.
 * The full set of login options still renders below as a fallback.
 */
export const SessionExpiredBanner: React.FC<SessionExpiredBannerProps> = ({
  lastMethod,
  onContinueGoogle,
  onContinueMicrosoft,
  onContinueZoho,
}) => {
  const { t } = useTranslation();

  const copy = lastMethod ? METHOD_COPY[lastMethod] : undefined;
  const ctaHandlers: Partial<Record<LoginMethod, () => void>> = {
    google: onContinueGoogle,
    microsoft: onContinueMicrosoft,
    zoho: onContinueZoho,
  };
  const onContinue = lastMethod && copy?.ctaKey ? ctaHandlers[lastMethod] : undefined;

  return (
    <div role="status" aria-live="polite" data-testid="session-expired-banner" style={containerStyle}>
      <h2 style={titleStyle}>{t('auth.sessionExpired.title')}</h2>
      <p style={textStyle}>{t('auth.sessionExpired.subtitle')}</p>
      {copy && <p style={textStyle}>{t(copy.lastUsedKey)}</p>}
      {copy?.ctaKey && onContinue && (
        <button type="button" onClick={onContinue} data-testid="session-expired-continue" style={ctaStyle}>
          {t(copy.ctaKey)}
        </button>
      )}
    </div>
  );
};
