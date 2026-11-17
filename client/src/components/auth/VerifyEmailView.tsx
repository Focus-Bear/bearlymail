import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import {
  AuthCard,
  authLinkStyle,
  authNoticeStyle,
  authPrimaryButtonStyle,
  authTextStyle,
} from 'components/auth/AuthCard';
import { CheckInboxPanel } from 'components/auth/CheckInboxPanel';

export const VERIFY_EMAIL_STATUS = {
  VERIFYING: 'verifying',
  VERIFIED: 'verified',
  FAILED: 'failed',
} as const;

export type VerifyEmailStatus = (typeof VERIFY_EMAIL_STATUS)[keyof typeof VERIFY_EMAIL_STATUS];

interface VerifyEmailViewProps {
  status: VerifyEmailStatus;
  /** Emails a fresh link to `email`; rejects when the request fails. */
  onResend: (email: string) => Promise<void>;
}

/**
 * What the emailed verification link opens: a spinner while the token is
 * checked, a confirmation with a sign-in link, or — for an expired or used
 * link — a form to request a new one.
 */
export const VerifyEmailView: React.FC<VerifyEmailViewProps> = ({ status, onResend }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [requestedFor, setRequestedFor] = useState<string | null>(null);

  if (requestedFor) {
    return (
      <CheckInboxPanel
        email={requestedFor}
        onResend={() => onResend(requestedFor)}
        onBack={() => setRequestedFor(null)}
      />
    );
  }

  if (status === VERIFY_EMAIL_STATUS.VERIFYING) {
    return (
      <AuthCard title={t('auth.verifyEmail.title')}>
        <p role="status" style={authTextStyle}>
          {t('auth.verifyEmail.verifying')}
        </p>
      </AuthCard>
    );
  }

  if (status === VERIFY_EMAIL_STATUS.VERIFIED) {
    return (
      <AuthCard title={t('auth.verifyEmail.verifiedTitle')}>
        <div role="status" style={authNoticeStyle(false)}>
          {t('auth.verifyEmail.verifiedBody')}
        </div>
        <Link
          to="/login"
          style={{
            ...authPrimaryButtonStyle(false),
            display: 'block',
            textAlign: 'center',
            textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          {t('auth.signIn')}
        </Link>
      </AuthCard>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onResend(email.trim()).catch(() => undefined);
    setRequestedFor(email.trim());
  };

  return (
    <AuthCard title={t('auth.verifyEmail.failedTitle')}>
      <div role="alert" style={authNoticeStyle(true)}>
        {t('auth.verifyEmail.failedBody')}
      </div>
      <form onSubmit={handleSubmit}>
        <label
          htmlFor="verify-email-address"
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
          id="verify-email-address"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={event => setEmail(event.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: theme.spacing.md,
            marginBottom: theme.spacing.md,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.base,
            fontFamily: theme.typography.fontFamily,
          }}
        />
        <button type="submit" style={authPrimaryButtonStyle(false)}>
          {t('auth.verifyEmail.sendNewLink')}
        </button>
      </form>
      <Link to="/login" style={authLinkStyle}>
        {t('auth.backToLogin')}
      </Link>
    </AuthCard>
  );
};
