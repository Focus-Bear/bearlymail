import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import axios from 'axios';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
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

export const ZohoAccountsSection: React.FC<ZohoAccountsSectionProps> = ({
  zohoAccounts,
  onFetchData,
}) => {
  const { t } = useTranslation();
  
  const handleDisconnect = async (id: string) => {
    if (window.confirm(t('settings.zoho.confirmDisconnect'))) {
      try {
        await axios.delete(`${API_URL}/zoho-accounts/${id}`);
        await onFetchData();
      } catch (error) {
        console.error('Error disconnecting Zoho account:', error);
      }
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      await axios.post(`${API_URL}/zoho-accounts/${id}/set-primary`);
      await onFetchData();
    } catch (error) {
      console.error('Error setting primary account:', error);
    }
  };
  
  return (
    <div id="zoho-accounts" style={{
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
        {t('settings.zoho.accounts')}
      </h3>
    
      {zohoAccounts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
          <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
            {t('settings.zoho.noAccounts')}
          </p>
          <button
            onClick={() => {
              window.location.href = `${API_URL}/zoho-accounts/connect`;
            }}
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
          {zohoAccounts.map((account) => (
            <div
              key={account.id}
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
                <div style={{ fontWeight: theme.typography.fontWeight.medium }}>
                  {account.email}
                </div>
                {account.name && (
                  <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                    {account.name}
                  </div>
                )}
                {account.isPrimary && (
                  <span style={{
                    fontSize: theme.typography.fontSize.xs,
                    color: theme.colors.primary.main,
                    marginLeft: theme.spacing.sm,
                  }}>
                    {t('settings.gmail.primary')}
                  </span>
                )}
              </div>
              <div>
                {!account.isPrimary && (
                  <button
                    onClick={() => handleSetPrimary(account.id)}
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
                  onClick={() => handleDisconnect(account.id)}
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
          ))}
          <button
            onClick={() => {
              window.location.href = `${API_URL}/zoho-accounts/connect`;
            }}
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
    </div>
  );
};

