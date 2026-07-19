import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { getAxiosErrorMessage } from 'utils/errors';
import { captureEvent } from 'utils/posthog';

import { WaitlistFormContainer } from 'components/landing/WaitlistFormContainer';
import { WaitlistFormField } from 'components/landing/WaitlistFormField';
import { WaitlistFormHeader } from 'components/landing/WaitlistFormHeader';
import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import {
  PROVIDER_GMAIL,
  PROVIDER_OTHER,
  PROVIDER_OUTLOOK,
  PROVIDER_ZOHO,
  STRING_NONE,
  WAITLIST_STATUS_ALREADY_ON_LIST,
} from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

// Static style constants — outside component to avoid recreation on each render
const errorDivStyle: React.CSSProperties = {
  backgroundColor: `${theme.colors.accent.error}20`,
  color: theme.colors.accent.error,
  padding: theme.spacing.md,
  borderRadius: theme.borderRadius.md,
  marginBottom: theme.spacing.md,
};

const noticeDivStyle: React.CSSProperties = {
  backgroundColor: `${theme.colors.accent.success}20`,
  color: theme.colors.accent.success,
  padding: theme.spacing.md,
  borderRadius: theme.borderRadius.md,
  marginBottom: theme.spacing.md,
};

const formStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
};

const emailSystemContainerStyle: React.CSSProperties = {
  marginBottom: theme.spacing.md,
};

function buildEmailSystemOptions(tFunc: (key: string) => string): Array<{ value: string; label: string }> {
  return [
    { value: '', label: tFunc('landing.waitlist.emailSystemPlaceholder') },
    { value: PROVIDER_GMAIL, label: tFunc('landing.waitlist.emailSystemGmail') },
    { value: PROVIDER_OUTLOOK, label: tFunc('landing.waitlist.emailSystemOutlook') },
    { value: PROVIDER_ZOHO, label: tFunc('landing.waitlist.emailSystemZoho') },
    { value: PROVIDER_OTHER, label: tFunc('landing.waitlist.emailSystemOther') },
  ];
}

const selectBaseStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.base,
  boxSizing: 'border-box',
  fontFamily: theme.typography.fontFamily,
  backgroundColor: COLOR_NAMED_WHITE,
};

// Dynamic style helpers — accept state/breakpoint values
function getLabelStyle(isMobile: boolean): React.CSSProperties {
  return {
    display: 'block',
    marginBottom: isMobile ? theme.spacing.sm : theme.spacing.xs,
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeight.medium,
    fontSize: theme.typography.fontSize.base,
  };
}

function getSelectStyle(isMobile: boolean): React.CSSProperties {
  return {
    ...selectBaseStyle,
    padding: isMobile ? theme.spacing.md : theme.spacing.md,
  };
}

function getButtonStyle(isMobile: boolean, submitting: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: isMobile ? theme.spacing.md : theme.spacing.lg,
    backgroundColor: submitting ? theme.colors.border.dark : theme.colors.primary.main,
    color: COLOR_NAMED_WHITE,
    border: STRING_NONE,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    cursor: submitting ? 'wait' : 'pointer',
  };
}

interface WaitlistFormProps {
  /**
   * Callback when form is successfully submitted
   */
  onSuccess: () => void;
}

interface WaitlistSignupPayload {
  email: string;
  firstName: string;
  reason: string;
  emailSystem: string;
  emailSystemOther?: string;
}

/**
 * Posts the signup and routes the outcome to the right callback:
 * already-on-the-list notice, success, or error message.
 */
async function submitWaitlistSignup(
  payload: WaitlistSignupPayload,
  callbacks: { onAlreadyOnList: () => void; onSuccess: () => void; onError: (message: string) => void },
): Promise<void> {
  try {
    const response = await axios.post(`${API_URL}/waitlist`, payload);
    if (response.data?.status === WAITLIST_STATUS_ALREADY_ON_LIST) {
      callbacks.onAlreadyOnList();
      return;
    }
    captureEvent(ANALYTICS_EVENTS.WAIT_LIST_SUBMITTED);
    callbacks.onSuccess();
  } catch (err: unknown) {
    callbacks.onError(getAxiosErrorMessage(err, 'Failed to submit. Please try again.'));
  }
}

/**
 * Waitlist form component
 * Handles user signup for the waitlist
 */
export const WaitlistForm: React.FC<WaitlistFormProps> = ({ onSuccess }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [reason, setReason] = useState('');
  const [emailSystem, setEmailSystem] = useState('');
  const [emailSystemOther, setEmailSystemOther] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { isMobile } = useResponsiveBreakpoints();

  const emailSystemOptions = buildEmailSystemOptions(t);

  const handleEmailSystemChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setEmailSystem(event.target.value);
    if (event.target.value) {
      captureEvent(ANALYTICS_EVENTS.WAIT_LIST_EMAIL_PLATFORM_SELECTED);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);

    await submitWaitlistSignup(
      {
        email,
        firstName,
        reason,
        emailSystem,
        emailSystemOther: emailSystem === PROVIDER_OTHER ? emailSystemOther : undefined,
      },
      {
        onAlreadyOnList: () => setNotice(t('landing.waitlist.alreadyOnList')),
        onSuccess,
        onError: setError,
      },
    );
    setSubmitting(false);
  };

  return (
    <WaitlistFormContainer>
      <WaitlistFormHeader />

      {error && <div style={errorDivStyle}>{error}</div>}
      {notice && <div style={noticeDivStyle}>{notice}</div>}

      <form onSubmit={handleSubmit} style={formStyle}>
        <WaitlistFormField
          label={t('landing.waitlist.firstName', { defaultValue: 'First Name' })}
          type="text"
          value={firstName}
          onChange={setFirstName}
          onBlur={() => firstName && captureEvent(ANALYTICS_EVENTS.WAIT_LIST_NAME_ENTERED)}
          required
        />
        <WaitlistFormField
          label={t('landing.waitlist.email', { defaultValue: 'Email' })}
          type="email"
          value={email}
          onChange={setEmail}
          onBlur={() => email && captureEvent(ANALYTICS_EVENTS.WAIT_LIST_EMAIL_ENTERED)}
          required
        />
        <WaitlistFormField
          label={t('landing.waitlist.reason', { defaultValue: 'Why do you want to use BearlyMail?' })}
          type="textarea"
          value={reason}
          onChange={setReason}
          onBlur={() => reason && captureEvent(ANALYTICS_EVENTS.WAIT_LIST_REASON_ENTERED)}
          required
          rows={2}
        />

        <div style={emailSystemContainerStyle}>
          <label style={getLabelStyle(isMobile)}>{t('landing.waitlist.emailSystemLabel')}</label>
          <select value={emailSystem} onChange={handleEmailSystemChange} required style={getSelectStyle(isMobile)}>
            {emailSystemOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {emailSystem === PROVIDER_OTHER && (
          <WaitlistFormField
            label={t('landing.waitlist.emailSystemOtherLabel')}
            type="text"
            value={emailSystemOther}
            onChange={setEmailSystemOther}
            required
          />
        )}

        <button type="submit" disabled={submitting} style={getButtonStyle(isMobile, submitting)}>
          {submitting
            ? t('landing.waitlist.submitting', { defaultValue: 'Submitting...' })
            : t('landing.waitlist.join', { defaultValue: 'Join Waitlist' })}
        </button>
      </form>
    </WaitlistFormContainer>
  );
};
