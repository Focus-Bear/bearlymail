import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { StepUpModal } from 'components/auth/StepUpModal';
import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';
import { PROVIDER_APPLE_MAIL, PROVIDER_GMAIL, PROVIDER_GOOGLE, STRING_NONE } from 'constants/strings';

import {
  buildAllAccounts,
  canDisconnectAccounts,
  type EmailAccount,
  type EmailAccountProvider,
  getDisconnectConfirmKey,
  getProviderColor,
  getProviderName,
} from './emailAccounts.helpers';
import { ProviderSelectionModal } from './ProviderSelectionModal';

export type { EmailAccount } from './emailAccounts.helpers';

interface EmailAccountsSectionProps {
  googleAccounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean; isSSO?: boolean }>;
  office365Accounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean }>;
  zohoAccounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean }>;
  appleMailAccounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean }>;
  appleMailAvailable: boolean;
  onFetchData: () => Promise<void>;
}

interface EmailAccountRowProps {
  account: EmailAccount;
  t: (k: string) => string;
  /** Only true when another account is connected; the last account cannot be disconnected. */
  canDisconnect: boolean;
  onSetPrimary: (id: string, provider: EmailAccountProvider) => Promise<void>;
  onDisconnect: (id: string, provider: EmailAccountProvider) => Promise<void>;
}

const EmailAccountRow: React.FC<EmailAccountRowProps> = ({ account, t, canDisconnect, onSetPrimary, onDisconnect }) => (
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
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.xs }}>
        <span
          style={{
            fontSize: theme.typography.fontSize.xs,
            color: COLOR_NAMED_WHITE,
            backgroundColor: getProviderColor(account.provider),
            padding: '2px 8px',
            borderRadius: theme.borderRadius.sm,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {getProviderName(account.provider)}
        </span>
        {account.isPrimary && (
          <span
            style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.primary.main,
              backgroundColor: `${theme.colors.primary.main}20`,
              padding: '2px 6px',
              borderRadius: theme.borderRadius.sm,
            }}
          >
            {t('settings.gmail.primary')}
          </span>
        )}
        {account.isSSO && (
          <span
            style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.accent.info,
              backgroundColor: `${theme.colors.accent.info}20`,
              padding: '2px 6px',
              borderRadius: theme.borderRadius.sm,
            }}
          >
            {t('settings.gmail.ssoLogin')}
          </span>
        )}
      </div>
      <div style={{ fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary }}>
        {account.email}
      </div>
      {account.name && (
        <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>{account.name}</div>
      )}
    </div>
    <div>
      {!account.isPrimary && !account.isSSO && (
        <button
          onClick={() => onSetPrimary(account.id, account.provider)}
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
      {!account.isSSO && canDisconnect && (
        <button
          onClick={() => onDisconnect(account.id, account.provider)}
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
      )}
    </div>
  </div>
);

interface AccountsEmptyStateProps {
  t: (k: string) => string;
  onConnect: () => void;
}

const AccountsEmptyState: React.FC<AccountsEmptyStateProps> = ({ t, onConnect }) => (
  <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
    <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
      {t('settings.emailAccounts.noAccounts')}
    </p>
    <button
      onClick={onConnect}
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
      {t('settings.emailAccounts.connect')}
    </button>
  </div>
);

interface UseEmailAccountHandlersParams {
  onFetchData: () => Promise<void>;
  t: (k: string) => string;
}

/**
 * Drives the step-up-authenticated account disconnect. The DELETE endpoints are
 * guarded by step-up auth, so a bare request 401s and the global interceptor
 * logs the user out instead of disconnecting (issue #257). OAuth-only users get
 * a token from POST /auth/step-up with no password; password users confirm via
 * the returned modal state.
 */
function useStepUpDisconnect({ onFetchData, t }: UseEmailAccountHandlersParams) {
  const [pendingDisconnect, setPendingDisconnect] = useState<{
    id: string;
    provider: EmailAccountProvider;
  } | null>(null);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [stepUpLoading, setStepUpLoading] = useState(false);

  const doDisconnect = async (id: string, provider: EmailAccountProvider, stepUpToken: string) => {
    const endpoint = provider === PROVIDER_GMAIL ? PROVIDER_GOOGLE : provider;
    await axios.delete(`${API_URL}/${endpoint}-accounts/${id}`, {
      headers: { 'X-Step-Up-Token': stepUpToken },
    });
    await onFetchData();
  };

  const requestDisconnect = async (id: string, provider: EmailAccountProvider) => {
    if (!window.confirm(t(getDisconnectConfirmKey(provider)))) {
      return;
    }
    try {
      // OAuth-only users get a token immediately; password users get a 401
      // {requiresPassword:true} and we fall through to the password modal.
      const response = await axios.post(`${API_URL}/auth/step-up`, {});
      await doDisconnect(id, provider, response.data.step_up_token);
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === HTTP_UNAUTHORIZED &&
        (error.response.data as { requiresPassword?: boolean })?.requiresPassword
      ) {
        setStepUpError(null);
        setPendingDisconnect({ id, provider });
        return;
      }
      console.error(`Error disconnecting ${provider} account:`, error); // nosemgrep
    }
  };

  const handleStepUpConfirm = async (password: string) => {
    if (!pendingDisconnect) {
      return;
    }
    setStepUpLoading(true);
    setStepUpError(null);
    try {
      const response = await axios.post(`${API_URL}/auth/step-up`, { password });
      await doDisconnect(pendingDisconnect.id, pendingDisconnect.provider, response.data.step_up_token);
      setPendingDisconnect(null);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === HTTP_UNAUTHORIZED) {
        setStepUpError(t('stepUp.invalidPassword'));
      } else {
        setPendingDisconnect(null);
        console.error(`Error disconnecting ${pendingDisconnect.provider} account:`, error); // nosemgrep
      }
    } finally {
      setStepUpLoading(false);
    }
  };

  const handleStepUpCancel = () => {
    setPendingDisconnect(null);
    setStepUpError(null);
  };

  return {
    requestDisconnect,
    stepUpModalProps: {
      isOpen: !!pendingDisconnect,
      onConfirm: handleStepUpConfirm,
      onCancel: handleStepUpCancel,
      error: stepUpError,
      isLoading: stepUpLoading,
    },
  };
}

function useEmailAccountHandlers({ onFetchData, t }: UseEmailAccountHandlersParams) {
  const handleConnectProvider = async (provider: EmailAccountProvider) => {
    if (provider === PROVIDER_APPLE_MAIL) {
      try {
        await axios.post(`${API_URL}/apple-mail-accounts/connect`);
        await onFetchData();
      } catch (error) {
        console.error(`Error connecting ${provider} account:`, error); // nosemgrep
        alert(t('settings.appleMail.connectError'));
      }
      return;
    }
    try {
      const response = await axios.get(
        `${API_URL}/${provider === PROVIDER_GMAIL ? PROVIDER_GOOGLE : provider}-accounts/connect-url`
      );
      window.location.href = response.data.url;
    } catch (error) {
      console.error(`Error connecting ${provider} account:`, error); // nosemgrep
      alert(`Failed to connect ${provider} account. Please try again.`);
    }
  };

  const { requestDisconnect, stepUpModalProps } = useStepUpDisconnect({ onFetchData, t });

  const handleSetPrimary = async (id: string, provider: EmailAccountProvider) => {
    try {
      const endpoint = provider === PROVIDER_GMAIL ? PROVIDER_GOOGLE : provider;
      await axios.post(`${API_URL}/${endpoint}-accounts/${id}/set-primary`);
      await onFetchData();
    } catch (error) {
      console.error(`Error setting primary ${provider} account:`, error); // nosemgrep
    }
  };

  return {
    handleConnectProvider,
    handleDisconnect: requestDisconnect,
    handleSetPrimary,
    stepUpModalProps,
  };
}

export const EmailAccountsSection: React.FC<EmailAccountsSectionProps> = ({
  googleAccounts,
  office365Accounts,
  zohoAccounts,
  appleMailAccounts,
  appleMailAvailable,
  onFetchData,
}) => {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { handleConnectProvider, handleDisconnect, handleSetPrimary, stepUpModalProps } = useEmailAccountHandlers({
    onFetchData,
    t,
  });
  const allAccounts = buildAllAccounts(googleAccounts, office365Accounts, zohoAccounts, appleMailAccounts);
  const canDisconnect = canDisconnectAccounts(allAccounts.length);
  const showLastAccountHint = !canDisconnect && allAccounts.some(account => !account.isSSO);

  return (
    <>
      <div
        id="email-accounts"
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
          {t('settings.emailAccounts.title')}
        </h3>

        {allAccounts.length === 0 ? (
          <AccountsEmptyState t={t} onConnect={() => setIsModalOpen(true)} />
        ) : (
          <>
            {allAccounts.map(account => (
              <EmailAccountRow
                key={`${account.provider}-${account.id}`}
                account={account}
                t={t}
                canDisconnect={canDisconnect}
                onSetPrimary={handleSetPrimary}
                onDisconnect={handleDisconnect}
              />
            ))}
            {showLastAccountHint && (
              <p
                style={{
                  color: theme.colors.text.secondary,
                  fontSize: theme.typography.fontSize.xs,
                  marginTop: theme.spacing.xs,
                  marginBottom: 0,
                }}
              >
                {t('settings.emailAccounts.lastAccountHint')}
              </p>
            )}
            <button
              onClick={() => setIsModalOpen(true)}
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
              + {t('settings.emailAccounts.connectAnother')}
            </button>
          </>
        )}
      </div>

      <ProviderSelectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectProvider={handleConnectProvider}
        appleMailAvailable={appleMailAvailable}
      />

      <StepUpModal {...stepUpModalProps} />
    </>
  );
};
