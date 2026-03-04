import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { WaitlistFormContainer } from 'components/landing/WaitlistFormContainer';
import { WaitlistFormField } from 'components/landing/WaitlistFormField';
import { WaitlistFormHeader } from 'components/landing/WaitlistFormHeader';
import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { PROVIDER_GMAIL, PROVIDER_OTHER, PROVIDER_OUTLOOK, PROVIDER_ZOHO, STRING_NONE } from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface WaitlistFormProps {
  /**
   * Callback when form is successfully submitted
   */
  onSuccess: () => void;
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
  const { isMobile } = useResponsiveBreakpoints();

  const emailSystemOptions = [
    { value: '', label: t('landing.waitlist.emailSystemPlaceholder') },
    { value: PROVIDER_GMAIL, label: t('landing.waitlist.emailSystemGmail') },
    { value: PROVIDER_OUTLOOK, label: t('landing.waitlist.emailSystemOutlook') },
    { value: PROVIDER_ZOHO, label: t('landing.waitlist.emailSystemZoho') },
    { value: PROVIDER_OTHER, label: t('landing.waitlist.emailSystemOther') },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await axios.post(`${API_URL}/waitlist`, {
        email,
        firstName,
        reason,
        emailSystem,
        emailSystemOther: emailSystem === PROVIDER_OTHER ? emailSystemOther : undefined,
      });
      captureEvent('wait-list-submitted');
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const buttonStyle: React.CSSProperties = {
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

  return (
    <WaitlistFormContainer>
      <WaitlistFormHeader />

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

      <form onSubmit={handleSubmit} style={{ width: '100%', boxSizing: 'border-box' }}>
        <WaitlistFormField
          label="First Name"
          type="text"
          value={firstName}
          onChange={setFirstName}
          onBlur={() => firstName && captureEvent('wait-list-name-entered')}
          required
        />
        <WaitlistFormField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          onBlur={() => email && captureEvent('wait-list-email-entered')}
          required
        />
                <WaitlistFormField
                  label="Why do you want to use BearlyMail?"
                  type="textarea"
                  value={reason}
                  onChange={setReason}
                  onBlur={() => reason && captureEvent('wait-list-reason-entered')}
                  required
                  rows={2}
                />

                <div style={{ marginBottom: theme.spacing.md }}>
                                    <label
                                      style={{
                                        display: 'block',
                                        marginBottom: isMobile ? theme.spacing.sm : theme.spacing.xs,
                                        color: theme.colors.text.primary,
                                        fontWeight: theme.typography.fontWeight.medium,
                                        fontSize: theme.typography.fontSize.base,
                                      }}
                                    >
                                      {t('landing.waitlist.emailSystemLabel')}
                                    </label>
                                    <select
                                      value={emailSystem}
                                      onChange={(e) => {
                                        setEmailSystem(e.target.value);
                                        if (e.target.value) {
                                          captureEvent('wait-list-email-platform-selected');
                                        }
                                      }}
                                      required
                                      style={{
                                        width: '100%',
                                        padding: isMobile ? theme.spacing.md : theme.spacing.md,
                                        border: `1px solid ${theme.colors.border.medium}`,
                                        borderRadius: theme.borderRadius.md,
                                        fontSize: theme.typography.fontSize.base,
                                        boxSizing: 'border-box',
                                        fontFamily: theme.typography.fontFamily,
                                        backgroundColor: COLOR_NAMED_WHITE,
                                      }}
                                    >
                                      {emailSystemOptions.map((option) => (
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

                <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? 'Submitting...' : 'Join Waitlist'}
        </button>
      </form>
    </WaitlistFormContainer>
  );
};

