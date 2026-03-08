import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_TRANSPARENT } from 'constants/colors';

interface BlockedSender {
  id: string;
  email: string;
  senderName?: string;
  reason?: string;
  blockedAt: string;
}

interface BlockedSenderItemProps {
  sender: BlockedSender;
  onUnblock: (id: string) => Promise<void>;
}

export const BlockedSenderItem: React.FC<BlockedSenderItemProps> = ({ sender, onUnblock }) => {
  const { t } = useTranslation();

  return (
    <div
      key={sender.id}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <div>
        <div
          style={{
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {sender.senderName || sender.email}
        </div>
        {sender.senderName && (
          <div
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {sender.email}
          </div>
        )}
        {sender.reason && (
          <div
            style={{
              color: theme.colors.text.tertiary,
              fontSize: theme.typography.fontSize.xs,
              marginTop: theme.spacing.xs,
            }}
          >
            {t('settings.blockedSenders.reason')}: {sender.reason}
          </div>
        )}
        <div
          style={{
            color: theme.colors.text.tertiary,
            fontSize: theme.typography.fontSize.xs,
            marginTop: theme.spacing.xs,
          }}
        >
          {t('settings.blockedSenders.blocked')} {new Date(sender.blockedAt).toLocaleDateString()}
        </div>
      </div>
      <button
        onClick={() => {
          captureEvent(ANALYTICS_EVENTS.SENDER_UNBLOCKED);
          onUnblock(sender.id);
        }}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.accent.error,
          border: `1px solid ${theme.colors.accent.error}`,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('settings.blockedSenders.unblock')}
      </button>
    </div>
  );
};
