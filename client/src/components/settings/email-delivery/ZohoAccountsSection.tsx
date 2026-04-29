import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { StepUpModal } from 'components/auth/StepUpModal';
import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface ZohoAccount {
  id: string;
  email: string;
  name?: string;
  isPrimary?: boolean;
}

interface ZohoAccountsSectionProps {
  zohoAccounts: ZohoAccount[];
  onFetchData: () => Promise<void>;
}

interface ZohoAccountRowProps {
  account: ZohoAccount;
  t: (k: string) => string;
  onSetPrimary: (id: string) => void;
  onDisconnect: (id: string) => void;
}

const ZohoAccountRow: React.FC<ZohoAccountRowProps> = ({ account, t, onSetPrimary, onDisconnect }) => (
  <div
    style={{
      padding: theme.spacing.md,
      border: `1px solid ${theme.colors.border.medium}`,
      borderRadius: theme.borderRadius.md,
      marginBottom: theme.spacing.sm,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}
  >
    <div>
      <div style={{ fontWeight: theme.typography.fontWeight.medium }}>{account.email}</div>
      {account.name && (
        <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>{account.name}</div>
      )}
      {account.isPrimary && (
        <span
          style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.primary.main,
            marginLeft: theme.spacing.sm,
          }}
        >
          {t('settings.gmail.primary')}
        </span>
      )}
    </div>
    <div>
      {!account.isPrimary && (
        <button
          onClick={() => onSetPrimary(account.id)}
          style={{
            marginRight: theme.spacing.sm,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.primary.main,
            border: `1px solid ${theme.colors.primary.main}`,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.xs,
            cursor: 'pointer',
          }}
        >
          {t('settings.gmail.setPrimary')}
        </button>
      )}
      <button
        onClick={() => onDisconnect(account.id)}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.accent.error,
          border: `1px solid ${theme.colors.accent.error}`,
          borderRadius: theme.borderRadius.sm,
          fontSize: theme.typography.fontSize.xs,
          cursor: 'pointer',
        }}
      >
        {t('settings.gmail.disconnect')}
      </button>
    </div>
  </div>
);

export const ZohoAccountsSection: React.FC<ZohoAccountsSectionProps> = ({ zohoAccounts, onFetchData }) => {
  const { t } = useTranslation();
  const [stepUpAccountId, setStepUpAccountId] = useState<string | null>(null);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [stepUpLoading, setStepUpLoading] = useState(false);

  const handleSetPrimary = async (id: string) => {
    try {
      await axios.post(`${API_URL}/zoho-accounts/${id}/set-primary`);
      await onFetchData();
    } catch (error) {
      console.error('Error setting primary account:', error);
    }
  };

  const doDisconnect = async (id: string, stepUpToken?: string) => {
    const headers: Record<string, string> = {};
    if (stepUpToken) {
      headers['X-Step-Up-Token'] = stepUpToken;
    }
    await axios.delete(`${API_URL}/zoho-accounts/${id}`, { headers });
    await onFetchData();
  };

  const handleDisconnect = async (id: string) => {
    if (!window.confirm(t('settings.zoho.confirmDisconnect'))) {
      return;
    }
    try {
      // Attempt to acquire a step-up token without a password.
      // OAuth-only users succeed immediately; password users receive 401 {requiresPassword:true}.
      const { data } = await axios.post(`${API_URL}/auth/step-up`, {});
      await doDisconnect(id, data.step_up_token);
    } catch (err) {
      if (
        axios.isAxiosError(err) &&
        err.response?.status === HTTP_UNAUTHORIZED &&
        (err.response.data as { requiresPassword?: boolean })?.requiresPassword
      ) {
        setStepUpError(null);
        setStepUpAccountId(id);
        return;
      }
      console.error('Error disconnecting Zoho account:', err);
    }
  };

  const handleStepUpConfirm = async (password: string) => {
    if (!stepUpAccountId) {
      return;
    }
    setStepUpLoading(true);
    setStepUpError(null);
    try {
      const { data } = await axios.post(`${API_URL}/auth/step-up`, { password });
      await doDisconnect(stepUpAccountId, data.step_up_token);
      setStepUpAccountId(null);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === HTTP_UNAUTHORIZED) {
        setStepUpError(t('stepUp.invalidPassword'));
      } else {
        setStepUpAccountId(null);
        console.error('Error disconnecting Zoho account:', err);
      }
    } finally {
      setStepUpLoading(false);
    }
  };

  const handleStepUpCancel = () => {
    setStepUpAccountId(null);
    setStepUpError(null);
  };

  const connectUrl = `${API_URL}/zoho-accounts/connect`;
  const handleConnectClick = () => {
    window.location.href = connectUrl;
  };

  return (
    <div
      id="zoho-accounts"
      style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.lg,
        marginBottom: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.medium}`,
      }}
    >
      <h3
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.lg,
          fontSize: theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        {t('settings.zoho.accounts')}
      </h3>

      {zohoAccounts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
          <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
            {t('settings.zoho.noAccounts')}
          </p>
          <button
            onClick={handleConnectClick}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: theme.colors.primary.main,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              cursor: 'pointer',
            }}
          >
            {t('settings.zoho.connect')}
          </button>
        </div>
      ) : (
        <>
          {zohoAccounts.map(account => (
            <ZohoAccountRow
              key={account.id}
              account={account}
              t={t}
              onSetPrimary={handleSetPrimary}
              onDisconnect={handleDisconnect}
            />
          ))}
          <button
            onClick={handleConnectClick}
            style={{
              marginTop: theme.spacing.md,
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: theme.colors.primary.main,
              border: `1px solid ${theme.colors.primary.main}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              cursor: 'pointer',
            }}
          >
            + {t('settings.zoho.connectAnother')}
          </button>
        </>
      )}

      <StepUpModal
        isOpen={!!stepUpAccountId}
        onConfirm={handleStepUpConfirm}
        onCancel={handleStepUpCancel}
        error={stepUpError}
        isLoading={stepUpLoading}
      />
    </div>
  );
};
