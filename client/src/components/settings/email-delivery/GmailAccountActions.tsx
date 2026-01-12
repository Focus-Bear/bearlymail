import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

export const GmailAccountActions: React.FC<GmailAccountActionsProps> = ({
  account,
  onFetchData,
}) => {
  const { t } = useTranslation();
  
  const handleSetPrimary = async () => {
    try {
      const axios = (await import('axios')).default;
      await axios.post(`${API_URL}/google-accounts/${account.id}/set-primary`);
      await onFetchData();
    } catch (error) {
      console.error('Error setting primary account:', error);
    }
  };

  const handleDisconnect = async () => {
    if (window.confirm(t('settings.gmail.confirmDisconnect'))) {
      try {
        const axios = (await import('axios')).default;
        await axios.delete(`${API_URL}/google-accounts/${account.id}`);
        await onFetchData();
      } catch (error) {
        console.error('Error disconnecting account:', error);
      }
    }
  };

  if (account.isSSO) return null;

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm }}>
      {!account.isPrimary && (
        <button
          onClick={handleSetPrimary}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: 'transparent',
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
          backgroundColor: 'transparent',
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
  );
};


