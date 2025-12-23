import React from 'react';
import { theme } from '../../theme/theme';
import { captureEvent } from '../../utils/posthog';

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
  if (selectedCount === 0) return null;

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      backgroundColor: theme.colors.primary.main,
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
        {selectedCount} email{selectedCount > 1 ? 's' : ''} selected
      </span>
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        {[1, 2, 3].map(count => (
          <button
            key={count}
            onClick={() => onBulkStar(count)}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {'⭐'.repeat(count)}
          </button>
        ))}
        {onBulkMarkAsRead && (
          <button
            onClick={onBulkMarkAsRead}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            Mark as Read
          </button>
        )}
        {onBulkMarkAsUnread && (
          <button
            onClick={onBulkMarkAsUnread}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            Mark as Unread
          </button>
        )}
        <button
          onClick={onBulkArchive}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          Archive
        </button>
        <button
          onClick={() => {
            captureEvent('bulk_selection_cleared', { selected_count: selectedCount });
            onClearSelection();
          }}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
