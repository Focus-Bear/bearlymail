import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';
import { BulkActionButton } from 'components/inbox/bulk/BulkActionButton';
import { EMOJI_STAR } from 'constants/emojis';

interface BulkOperationsBarProps {
  selectedCount: number;
  onBulkStar: (count: number) => void;
  onBulkArchive: () => void;
  onBulkMarkAsRead?: () => void;
  onBulkMarkAsUnread?: () => void;
  onClearSelection: () => void;
}

export const BulkOperationsBar: React.FC<BulkOperationsBarProps> = ({
  selectedCount,
  onBulkStar,
  onBulkArchive,
  onBulkMarkAsRead,
  onBulkMarkAsUnread,
  onClearSelection,
}) => {
  const { t } = useTranslation();
  if (selectedCount === 0) return null;

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backgroundColor: theme.colors.secondary.dark,
      color: 'white',
      padding: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      margin: theme.spacing.md,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: theme.shadows.md,
    }}>
      <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>
        {t('inbox.bulk.selected', { count: selectedCount })}
      </span>
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        {[1, 2, 3].map(count => (
          <BulkActionButton key={count} onClick={() => onBulkStar(count)}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            {EMOJI_STAR.repeat(count)}
          </BulkActionButton>
        ))}
        {onBulkMarkAsRead && (
          <BulkActionButton onClick={onBulkMarkAsRead}>
            {t('inbox.bulk.markAsRead')}
          </BulkActionButton>
        )}
        {onBulkMarkAsUnread && (
          <BulkActionButton onClick={onBulkMarkAsUnread}>
            {t('inbox.bulk.markAsUnread')}
          </BulkActionButton>
        )}
        <BulkActionButton onClick={onBulkArchive}>
          {t('inbox.bulk.archive')}
        </BulkActionButton>
        <BulkActionButton onClick={() => {
          captureEvent('bulk_selection_cleared', { selected_count: selectedCount });
          onClearSelection();
        }}>
          {t('common.cancel')}
        </BulkActionButton>
      </div>
    </div>
  );
};
