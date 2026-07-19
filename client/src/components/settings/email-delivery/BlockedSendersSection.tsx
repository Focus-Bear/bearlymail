import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

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

export const BlockedSendersSection: React.FC<BlockedSendersSectionProps> = ({ blockedSenders, onUnblockSender }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false); // Default to collapsed
  const itemCount = blockedSenders.length;

  return (
    <div
      id="blocked-senders"
      style={{
        marginBottom: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.paper,
      }}
    >
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          fontSize: theme.typography.fontSize.lg,
          color: theme.colors.text.primary,
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          cursor: 'pointer',
          backgroundColor: theme.colors.background.paper,
          borderBottom: isExpanded ? `1px solid ${theme.colors.border.light}` : 'none',
          borderRadius: isExpanded ? `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0` : theme.borderRadius.md,
          transition: theme.transitions.fast,
        }}
      >
        <span
          style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: theme.transitions.fast,
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.secondary,
          }}
        >
          ▶
        </span>
        <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>
          {EMOJI_BLOCK} {t('settings.blockedSenders.title')}
        </span>
        <span
          style={{
            backgroundColor: theme.colors.greyscale[300],
            color: theme.colors.text.secondary,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            borderRadius: theme.borderRadius.full,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {itemCount}
        </span>
      </div>

      {isExpanded && (
        <div
          style={{
            padding: theme.spacing.md,
          }}
        >
          <p
            style={{
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.md,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('settings.blockedSenders.description')}
          </p>

          {blockedSenders.length === 0 ? (
            <div
              style={{
                padding: theme.spacing.xl,
                textAlign: 'center',
                color: theme.colors.text.secondary,
                border: `2px dashed ${theme.colors.border.light}`,
                borderRadius: theme.borderRadius.md,
              }}
            >
              {t('settings.blockedSenders.emptyState')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
              {blockedSenders.map(sender => (
                <BlockedSenderItem key={sender.id} sender={sender} onUnblock={onUnblockSender} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
