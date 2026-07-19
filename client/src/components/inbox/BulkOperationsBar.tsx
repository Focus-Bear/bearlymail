import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { BulkActionButton } from 'components/inbox/bulk/BulkActionButton';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';

interface BulkOperationsBarProps {
  selectedCount: number;
  onBulkArchive: () => void;
  onClearSelection: () => void;
}

export const BulkOperationsBar: React.FC<BulkOperationsBarProps> = ({
  selectedCount,
  onBulkArchive,
  onClearSelection,
}) => {
  const { t } = useTranslation();
  if (selectedCount === 0) {
    return null;
  }

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
        boxShadow: theme.shadows.md,
      }}
    >
      <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>
        {t('inbox.bulk.selected', { count: selectedCount })}
      </span>
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
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
    </div>
  );
};
