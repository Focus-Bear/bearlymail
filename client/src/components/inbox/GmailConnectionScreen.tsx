import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ImapConnectModal } from 'components/settings/email-delivery/imap/ImapConnectModal';
import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

/**
 * Shown when the user has no mailbox connected. Gmail connects via OAuth;
 * any other host (Crazy Domains, cPanel, Fastmail...) via IMAP + password.
 */
export const GmailConnectionScreen: React.FC = () => {
  const { t } = useTranslation();
  const [isImapFormOpen, setIsImapFormOpen] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        padding: theme.spacing.xl,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing['2xl'],
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          maxWidth: '500px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.lg,
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
          }}
        >
          {t('gmail.connectTitle')}
        </h1>
        <p
          style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xl,
            fontSize: theme.typography.fontSize.base,
            lineHeight: 1.6,
          }}
        >
          {t('gmail.connectDescription')}
        </p>
        <button
          onClick={() => {
            window.location.href = `${API_URL}/google-accounts/connect`;
          }}
          style={{
            padding: `${theme.spacing.md} ${theme.spacing.xl}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: 'pointer',
            marginBottom: theme.spacing.md,
          }}
        >
          {t('gmail.connectButton')}
        </button>
        <div>
          <button
            onClick={() => setIsImapFormOpen(true)}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              backgroundColor: theme.colors.common.transparent,
              color: theme.colors.primary.main,
              border: `1px solid ${theme.colors.primary.main}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              cursor: 'pointer',
            }}
          >
            {t('gmail.connectOtherProvider')}
          </button>
        </div>
        <p
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.tertiary,
            marginTop: theme.spacing.lg,
          }}
        >
          {t('gmail.connectMultipleHint')}
        </p>
      </div>
      <ImapConnectModal
        isOpen={isImapFormOpen}
        onClose={() => setIsImapFormOpen(false)}
        // The inbox only loads once a mailbox exists, so start it fresh.
        onConnected={() => window.location.reload()}
      />
    </div>
  );
};
