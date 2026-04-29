import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { StepUpModal } from 'components/auth/StepUpModal';
import { API_URL } from 'config/api';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';

interface GoogleAccount {
  id: string;
  email: string;
  name?: string;
  isPrimary?: boolean;
  isSSO?: boolean;
}

interface GmailAccountActionsProps {
  account: GoogleAccount;
  onFetchData: () => Promise<void>;
}

export const GmailAccountActions: React.FC<GmailAccountActionsProps> = ({ account, onFetchData }) => {
  const { t } = useTranslation();
  const [showStepUpModal, setShowStepUpModal] = useState(false);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [stepUpLoading, setStepUpLoading] = useState(false);

  const handleSetPrimary = async () => {
    try {
      await axios.post(`${API_URL}/google-accounts/${account.id}/set-primary`);
      await onFetchData();
    } catch (error) {
      console.error('Error setting primary account:', error);
    }
  };

  const doDisconnect = async (stepUpToken?: string) => {
    const headers: Record<string, string> = {};
    if (stepUpToken) {
      headers['X-Step-Up-Token'] = stepUpToken;
    }
    await axios.delete(`${API_URL}/google-accounts/${account.id}`, { headers });
    await onFetchData();
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t('settings.gmail.confirmDisconnect'))) {
      return;
    }
    try {
      // Attempt to acquire a step-up token without a password.
      // OAuth-only users succeed immediately; password users receive 401 {requiresPassword:true}.
      const { data } = await axios.post(`${API_URL}/auth/step-up`, {});
      await doDisconnect(data.step_up_token);
    } catch (err) {
      if (
        axios.isAxiosError(err) &&
        err.response?.status === HTTP_UNAUTHORIZED &&
        (err.response.data as { requiresPassword?: boolean })?.requiresPassword
      ) {
        setStepUpError(null);
        setShowStepUpModal(true);
        return;
      }
      console.error('Error disconnecting account:', err);
    }
  };

  const handleStepUpConfirm = async (password: string) => {
    setStepUpLoading(true);
    setStepUpError(null);
    try {
      const { data } = await axios.post(`${API_URL}/auth/step-up`, { password });
      await doDisconnect(data.step_up_token);
      setShowStepUpModal(false);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === HTTP_UNAUTHORIZED) {
        setStepUpError(t('stepUp.invalidPassword'));
      } else {
        setShowStepUpModal(false);
        console.error('Error disconnecting account:', err);
      }
    } finally {
      setStepUpLoading(false);
    }
  };

  const handleStepUpCancel = () => {
    setShowStepUpModal(false);
    setStepUpError(null);
  };

  if (account.isSSO) {
    return null;
  }

  return (
    <>
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        {!account.isPrimary && (
          <button
            onClick={handleSetPrimary}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: theme.colors.primary.main,
              border: `1px solid ${theme.colors.primary.main}`,
              borderRadius: theme.borderRadius.sm,
              fontSize: theme.typography.fontSize.sm,
              cursor: 'pointer',
            }}
          >
            {t('settings.gmail.setPrimary')}
          </button>
        )}
        <button
          onClick={handleDisconnect}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.accent.error,
            border: `1px solid ${theme.colors.accent.error}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.sm,
            cursor: 'pointer',
          }}
        >
          {t('settings.gmail.disconnect')}
        </button>
      </div>

      <StepUpModal
        isOpen={showStepUpModal}
        onConfirm={handleStepUpConfirm}
        onCancel={handleStepUpCancel}
        error={stepUpError}
        isLoading={stepUpLoading}
      />
    </>
  );
};
