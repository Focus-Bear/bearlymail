import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AuthCard,
  authLinkStyle,
  authNoticeStyle,
  authPrimaryButtonStyle,
  authTextStyle,
} from 'components/auth/AuthCard';

const RESEND_STATE = {
  IDLE: 'idle',
  SENDING: 'sending',
  SENT: 'sent',
  ERROR: 'error',
} as const;

type ResendState = (typeof RESEND_STATE)[keyof typeof RESEND_STATE];

interface CheckInboxPanelProps {
  /** Address the verification link was sent to. */
  email: string;
  /** Requests a fresh link; rejects when the request fails. */
  onResend: () => Promise<void>;
  /** Returns to the sign-in form. */
  onBack?: () => void;
  /** Render without the full-page background (inside the Login column). */
  inline?: boolean;
}

/**
 * "Check your inbox" screen shown when a password account still needs its
 * email address confirmed: after sign-up and when a sign-in is refused with
 * EMAIL_NOT_VERIFIED. Offers a resend button.
 */
export const CheckInboxPanel: React.FC<CheckInboxPanelProps> = ({ email, onResend, onBack, inline = false }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<ResendState>(RESEND_STATE.IDLE);

  const handleResend = async () => {
    setState(RESEND_STATE.SENDING);
    try {
      await onResend();
      setState(RESEND_STATE.SENT);
    } catch {
      setState(RESEND_STATE.ERROR);
    }
  };

  const sending = state === RESEND_STATE.SENDING;

  return (
    <AuthCard title={t('auth.verifyEmail.checkInboxTitle')} inline={inline}>
      <p style={authTextStyle} data-testid="check-inbox-message">
        {t('auth.verifyEmail.checkInboxBody', { email })}
      </p>
      <p style={authTextStyle}>{t('auth.verifyEmail.checkInboxHint')}</p>
      {state === RESEND_STATE.SENT && (
        <div role="status" style={authNoticeStyle(false)}>
          {t('auth.verifyEmail.resendSent')}
        </div>
      )}
      {state === RESEND_STATE.ERROR && (
        <div role="alert" style={authNoticeStyle(true)}>
          {t('auth.verifyEmail.resendError')}
        </div>
      )}
      <button type="button" onClick={handleResend} disabled={sending} style={authPrimaryButtonStyle(sending)}>
        {sending ? t('auth.verifyEmail.resending') : t('auth.verifyEmail.resend')}
      </button>
      {onBack && (
        <button type="button" onClick={onBack} style={authLinkStyle}>
          {t('auth.backToLogin')}
        </button>
      )}
    </AuthCard>
  );
};
