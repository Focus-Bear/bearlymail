import React from 'react';
import { theme } from 'theme/theme';

import { GmailAccountActions } from 'components/settings/email-delivery/GmailAccountActions';
import { GmailAccountInfo } from 'components/settings/email-delivery/GmailAccountInfo';

interface GoogleAccount {
  id: string;
  email: string;
  name?: string;
  isPrimary?: boolean;
  isSSO?: boolean;
}

interface GmailAccountItemProps {
  account: GoogleAccount;
  onFetchData: () => Promise<void>;
}

export const GmailAccountItem: React.FC<GmailAccountItemProps> = ({ account, onFetchData }) => {
  return (
    <div
      key={account.id}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.sm,
      }}
    >
      <GmailAccountInfo account={account} />
      <GmailAccountActions account={account} onFetchData={onFetchData} />
    </div>
  );
};
