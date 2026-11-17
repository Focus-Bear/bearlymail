import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OAuthProviderId } from 'types/imap-account.types';

import { ImapConnectModal } from 'components/settings/email-delivery/imap/ImapConnectModal';
import { ProviderSelectionModal } from 'components/settings/email-delivery/ProviderSelectionModal';
import type { ProviderOptionId } from 'components/settings/email-delivery/providerSelectionModal.helpers';
import { startOAuthConnect } from 'components/settings/email-delivery/startOAuthConnect';
import { PROVIDER_APPLE_MAIL, PROVIDER_IMAP } from 'constants/strings';

interface ConnectMailboxButtonProps {
  style: React.CSSProperties;
  /** Called once a password (IMAP) mailbox is connected; OAuth providers leave the page instead. */
  onConnected: () => void;
}

/**
 * "Connect an email account" button for people who have none yet. Opens the same
 * provider picker as Settings → Email accounts: Gmail, Outlook and Zoho go to the
 * provider's sign-in page; any other host connects with IMAP in place.
 */
export const ConnectMailboxButton: React.FC<ConnectMailboxButtonProps> = ({ style, onConnected }) => {
  const { t } = useTranslation();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isImapFormOpen, setIsImapFormOpen] = useState(false);

  const connectWithOAuth = async (provider: OAuthProviderId) => {
    try {
      await startOAuthConnect(provider);
    } catch (error) {
      console.error(`Error connecting ${provider} account:`, error);
      alert(t('connectMailbox.connectError'));
    }
  };

  const handleSelectProvider = (provider: ProviderOptionId) => {
    setIsPickerOpen(false);
    if (provider === PROVIDER_IMAP) {
      setIsImapFormOpen(true);
      return;
    }
    // Apple Mail is only offered on a local Mac install, and this picker doesn't offer it.
    if (provider !== PROVIDER_APPLE_MAIL) {
      void connectWithOAuth(provider);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setIsPickerOpen(true)} style={style} data-testid="connect-mailbox-button">
        {t('connectMailbox.button')}
      </button>
      <ProviderSelectionModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelectProvider={handleSelectProvider}
      />
      <ImapConnectModal
        isOpen={isImapFormOpen}
        onClose={() => setIsImapFormOpen(false)}
        onUseProvider={provider => void connectWithOAuth(provider)}
        onConnected={() => {
          setIsImapFormOpen(false);
          onConnected();
        }}
      />
    </>
  );
};
