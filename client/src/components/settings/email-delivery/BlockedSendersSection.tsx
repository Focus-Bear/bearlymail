import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { BlockedSenderItem } from 'components/settings/email-delivery/BlockedSenderItem';
import { EMOJI_BLOCK } from 'constants/emojis';

interface BlockedSender {
  id: string;
  email: string;
  senderName?: string;
  reason?: string;
  blockedAt: string;
}

interface BlockedSendersSectionProps {
  blockedSenders: BlockedSender[];
  onUnblockSender: (id: string) => Promise<void>;
}

export const BlockedSendersSection: React.FC<BlockedSendersSectionProps> = ({
  blockedSenders,
  onUnblockSender,
}) => {
  const { t } = useTranslation();
  
  return (
    <div id="blocked-senders" style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.xl,
      marginBottom: theme.spacing.lg,
      boxShadow: theme.shadows.md,
    }}>
      <h3 style={{
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.xl,
        scrollMarginTop: `${INPUT_WIDTH_PX}px`,
      }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        {EMOJI_BLOCK} {t('settings.blockedSenders.title')}
      </h3>
      <p style={{
        color: theme.colors.text.secondary,
        marginBottom: theme.spacing.md,
        fontSize: theme.typography.fontSize.sm,
      }}>
        {t('settings.blockedSenders.description')}
      </p>
      
      {blockedSenders.length === 0 ? (
        <div style={{
          padding: theme.spacing.xl,
          textAlign: 'center',
          color: theme.colors.text.secondary,
          border: `2px dashed ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
        }}>
          {t('settings.blockedSenders.emptyState')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
          {blockedSenders.map((sender) => (
            <BlockedSenderItem key={sender.id} sender={sender} onUnblock={onUnblockSender} />
          ))}
        </div>
      )}
    </div>
  );
};


