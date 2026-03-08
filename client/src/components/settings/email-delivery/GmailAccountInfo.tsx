import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface GoogleAccount {
  id: string;
  email: string;
  name?: string;
  isPrimary?: boolean;
  isSSO?: boolean;
}

interface GmailAccountInfoProps {
  account: GoogleAccount;
}

export const GmailAccountInfo: React.FC<GmailAccountInfoProps> = ({ account }) => {
  const { t } = useTranslation();

  return (
    <div>
      <div
        style={{
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {account.email}
        {account.isPrimary && (
          <span
            style={{
              marginLeft: theme.spacing.sm,
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
              marginLeft: theme.spacing.sm,
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
      {account.name && (
        <div
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          {account.name}
        </div>
      )}
    </div>
  );
};
