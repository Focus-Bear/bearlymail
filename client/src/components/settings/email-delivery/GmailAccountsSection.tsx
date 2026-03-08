import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { GmailAccountItem } from 'components/settings/email-delivery/GmailAccountItem';
import { GmailEmptyState } from 'components/settings/email-delivery/GmailEmptyState';
import { API_URL } from 'config/api';
import { COLOR_TRANSPARENT } from 'constants/colors';

interface GoogleAccount {
  id: string;
  email: string;
  name?: string;
  isPrimary?: boolean;
  isSSO?: boolean;
}

interface GmailAccountsSectionProps {
  googleAccounts: GoogleAccount[];
  onFetchData: () => Promise<void>;
}

export const GmailAccountsSection: React.FC<GmailAccountsSectionProps> = ({ googleAccounts, onFetchData }) => {
  const { t } = useTranslation();

  return (
    <div
      id="google-accounts"
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
        {t('settings.gmail.accounts')}
      </h3>

      {googleAccounts.length === 0 ? (
        <GmailEmptyState />
      ) : (
        <>
          {googleAccounts.map(account => (
            <GmailAccountItem key={account.id} account={account} onFetchData={onFetchData} />
          ))}
          <button
            onClick={() => {
              window.location.href = `${API_URL}/google-accounts/connect`;
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
            + {t('settings.gmail.connectAnother')}
          </button>
        </>
      )}
    </div>
  );
};
