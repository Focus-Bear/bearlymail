import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { BulkActionButton } from 'components/inbox/bulk/BulkActionButton';
import { BulkSnoozeForm } from 'components/inbox/bulk/BulkSnoozeForm';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';

interface BulkOperationsBarProps {
  selectedCount: number;
  onBulkArchive: () => void;
  onBulkSnooze: (duration: string) => void;
  onClearSelection: () => void;
}

export const BulkOperationsBar: React.FC<BulkOperationsBarProps> = ({
  selectedCount,
  onBulkArchive,
  onBulkSnooze,
  onClearSelection,
}) => {
  const { t } = useTranslation();
  const [isSnoozeFormOpen, setIsSnoozeFormOpen] = useState(false);

  if (selectedCount === 0) {
    return null;
  }

  const closeSnoozeForm = () => setIsSnoozeFormOpen(false);

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: theme.colors.secondary.dark,
        color: COLOR_NAMED_WHITE,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        margin: theme.spacing.md,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        boxShadow: theme.shadows.md,
      }}
    >
      <span style={{ fontWeight: theme.typography.fontWeight.semibold, whiteSpace: 'nowrap' }}>
        {t('inbox.bulk.selected', { count: selectedCount })}
      </span>
      {isSnoozeFormOpen ? (
        <BulkSnoozeForm
          onConfirm={duration => {
            closeSnoozeForm();
            onBulkSnooze(duration);
          }}
          onCancel={() => {
            captureEvent(ANALYTICS_EVENTS.BULK_SNOOZE_CANCELLED, { selected_count: selectedCount });
            closeSnoozeForm();
          }}
        />
      ) : (
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          <BulkActionButton
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.BULK_SNOOZE_CLICKED, { selected_count: selectedCount });
              setIsSnoozeFormOpen(true);
            }}
          >
            {t('inbox.bulk.snooze')}
          </BulkActionButton>
          <BulkActionButton onClick={onBulkArchive}>{t('inbox.bulk.archive')}</BulkActionButton>
          <BulkActionButton
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.BULK_SELECTION_CLEARED, { selected_count: selectedCount });
              onClearSelection();
            }}
          >
            {t('common.cancel')}
          </BulkActionButton>
        </div>
      )}
    </div>
  );
};
