import React, { useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { WaitlistFormContainer } from 'components/landing/WaitlistFormContainer';
import { WaitlistFormHeader } from 'components/landing/WaitlistFormHeader';
import { WaitlistFormField } from 'components/landing/WaitlistFormField';
import { captureEvent } from 'utils/posthog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
    { value: 'gmail', label: t('landing.waitlist.emailSystemGmail') },
    { value: 'outlook', label: t('landing.waitlist.emailSystemOutlook') },
    { value: 'zoho', label: t('landing.waitlist.emailSystemZoho') },
    { value: 'other', label: t('landing.waitlist.emailSystemOther') },
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
        emailSystemOther: emailSystem === 'other' ? emailSystemOther : undefined,
      });
      captureEvent('waitlist_submitted');
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
    color: 'white',
    border: 'none',
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
          required
        />
        <WaitlistFormField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          required
        />
                <WaitlistFormField
                  label="Why do you want to use BearlyMail?"
                  type="textarea"
                  value={reason}
                  onChange={setReason}
                  required
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
                                      onChange={(e) => setEmailSystem(e.target.value)}
                                      required
                                      style={{
                                        width: '100%',
                                        padding: isMobile ? theme.spacing.md : theme.spacing.md,
                                        border: `1px solid ${theme.colors.border.medium}`,
                                        borderRadius: theme.borderRadius.md,
                                        fontSize: theme.typography.fontSize.base,
                                        boxSizing: 'border-box',
                                        fontFamily: theme.typography.fontFamily,
                                        backgroundColor: 'white',
                                      }}
                                    >
                                      {emailSystemOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                </div>

                                {emailSystem === 'other' && (
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

