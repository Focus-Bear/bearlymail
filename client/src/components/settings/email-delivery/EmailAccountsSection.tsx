import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import axios from 'axios';
import { ProviderSelectionModal } from './ProviderSelectionModal';

import { API_URL } from 'config/api';

interface EmailAccount {
  id: string;
  email: string;
  name?: string;
  isPrimary?: boolean;
  provider: 'gmail' | 'office365' | 'zoho';
  isSSO?: boolean; // Gmail specific
}

interface EmailAccountsSectionProps {
  googleAccounts: Array<{
    id: string;
    email: string;
    name?: string;
    isPrimary?: boolean;
    isSSO?: boolean;
  }>;
  office365Accounts: Array<{
    id: string;
    email: string;
    name?: string;
    isPrimary?: boolean;
  }>;
  zohoAccounts: Array<{
    id: string;
    email: string;
    name?: string;
    isPrimary?: boolean;
  }>;
  onFetchData: () => Promise<void>;
}

export const EmailAccountsSection: React.FC<EmailAccountsSectionProps> = ({
  googleAccounts,
  office365Accounts,
  zohoAccounts,
  onFetchData,
}) => {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Combine all accounts with provider info
  const allAccounts: EmailAccount[] = [
    ...googleAccounts.map((acc) => ({ ...acc, provider: 'gmail' as const })),
    ...office365Accounts.map((acc) => ({ ...acc, provider: 'office365' as const })),
    ...zohoAccounts.map((acc) => ({ ...acc, provider: 'zoho' as const })),
  ];

  const handleConnectProvider = async (provider: 'gmail' | 'office365' | 'zoho') => {
    try {
      const response = await axios.get(`${API_URL}/${provider === 'gmail' ? 'google' : provider}-accounts/connect-url`);
      window.location.href = response.data.url;
    } catch (error) {
      console.error(`Error connecting ${provider} account:`, error);
      alert(`Failed to connect ${provider} account. Please try again.`);
    }
  };

  const handleDisconnect = async (id: string, provider: 'gmail' | 'office365' | 'zoho') => {
    const providerName = provider === 'gmail' ? 'Gmail' : provider === 'office365' ? 'Office 365' : 'Zoho Mail';
    const confirmKey = provider === 'gmail' 
      ? 'settings.gmail.confirmDisconnect'
      : provider === 'office365'
      ? 'settings.office365.confirmDisconnect'
      : 'settings.zoho.confirmDisconnect';
    
    if (window.confirm(t(confirmKey))) {
      try {
        const endpoint = provider === 'gmail' ? 'google' : provider;
        await axios.delete(`${API_URL}/${endpoint}-accounts/${id}`);
        await onFetchData();
      } catch (error) {
        console.error(`Error disconnecting ${provider} account:`, error);
      }
    }
  };

  const handleSetPrimary = async (id: string, provider: 'gmail' | 'office365' | 'zoho') => {
    try {
      const endpoint = provider === 'gmail' ? 'google' : provider;
      await axios.post(`${API_URL}/${endpoint}-accounts/${id}/set-primary`);
      await onFetchData();
    } catch (error) {
      console.error(`Error setting primary ${provider} account:`, error);
    }
  };

  const getProviderColor = (provider: 'gmail' | 'office365' | 'zoho'): string => {
    switch (provider) {
      case 'gmail':
        return '#EA4335';
      case 'office365':
        return '#0078D4';
      case 'zoho':
        return '#C8202F';
      default:
        return theme.colors.primary.main;
    }
  };

  const getProviderName = (provider: 'gmail' | 'office365' | 'zoho'): string => {
    switch (provider) {
      case 'gmail':
        return 'Gmail';
      case 'office365':
        return 'Office 365';
      case 'zoho':
        return 'Zoho Mail';
      default:
        return provider;
    }
  };

  return (
    <>
      <div id="email-accounts" style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.lg,
        marginBottom: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.medium}`,
      }}>
        <h3 style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.lg,
          fontSize: theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.semibold,
        }}>
          {t('settings.emailAccounts.title')}
        </h3>

        {allAccounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
            <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
              {t('settings.emailAccounts.noAccounts')}
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.primary.main,
                color: 'white',
                border: 'none',
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.sm,
                cursor: 'pointer',
              }}
            >
              {t('settings.emailAccounts.connect')}
            </button>
          </div>
        ) : (
          <>
            {allAccounts.map((account) => (
              <div
                key={`${account.provider}-${account.id}`}
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
                        color: 'white',
                        backgroundColor: getProviderColor(account.provider),
                        padding: '2px 8px',
                        borderRadius: theme.borderRadius.sm,
                        fontWeight: theme.typography.fontWeight.medium,
                      }}
                    >
                      {getProviderName(account.provider)}
                    </span>
                    {account.isPrimary && (
                      <span style={{
                        fontSize: theme.typography.fontSize.xs,
                        color: theme.colors.primary.main,
                        backgroundColor: `${theme.colors.primary.main}20`,
                        padding: '2px 6px',
                        borderRadius: theme.borderRadius.sm,
                      }}>
                        {t('settings.gmail.primary')}
                      </span>
                    )}
                    {account.isSSO && (
                      <span style={{
                        fontSize: theme.typography.fontSize.xs,
                        color: theme.colors.accent.info,
                        backgroundColor: `${theme.colors.accent.info}20`,
                        padding: '2px 6px',
                        borderRadius: theme.borderRadius.sm,
                      }}>
                        {t('settings.gmail.ssoLogin')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary }}>
                    {account.email}
                  </div>
                  {account.name && (
                    <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                      {account.name}
                    </div>
                  )}
                </div>
                <div>
                  {!account.isPrimary && !account.isSSO && (
                    <button
                      onClick={() => handleSetPrimary(account.id, account.provider)}
                      style={{
                        marginRight: theme.spacing.sm,
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: 'transparent',
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
                  {!account.isSSO && (
                    <button
                      onClick={() => handleDisconnect(account.id, account.provider)}
                      style={{
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: 'transparent',
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
            ))}
            <button
              onClick={() => setIsModalOpen(true)}
              style={{
                marginTop: theme.spacing.md,
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: 'transparent',
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
      />
    </>
  );
};



