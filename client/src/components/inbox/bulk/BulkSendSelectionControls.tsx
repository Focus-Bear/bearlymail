import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { ThreadWithFollowUp } from 'hooks/useFollowUps';

interface BulkSendSelectionControlsProps {
  selectedCount: number;
  allThreads: ThreadWithFollowUp[];
  onDeselectAll: () => void;
  onSelectAll: () => void;
  maxAllowed: number;
}

export const BulkSendSelectionControls: React.FC<BulkSendSelectionControlsProps> = ({
  selectedCount,
  allThreads,
  onDeselectAll,
  onSelectAll,
  maxAllowed,
}) => {
  const { t } = useTranslation();
  const isOverLimit = selectedCount > maxAllowed;
  const allSelected = selectedCount === allThreads.filter(thread => thread.followUp?.draftFollowUp).length;

  return (
    <div>
      <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
        <button
          onClick={allSelected ? onDeselectAll : onSelectAll}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.primary.main,
            border: `1px solid ${theme.colors.primary.main}`,
            borderRadius: theme.borderRadius.sm,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {allSelected ? t('common.deselectAll') : t('common.selectAll')}
        </button>

        <span
          style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}
        >
          {selectedCount} {selectedCount === 1 ? t('inbox.followUp') : t('inbox.followUps')} {t('common.selected')}
        </span>
      </div>

      {isOverLimit && (
        <div
          style={{
            marginTop: theme.spacing.xs,
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.warning.light,
            borderRadius: theme.borderRadius.sm,
            color: theme.colors.warning.main,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('inbox.maxFollowUpsWarning', { max: maxAllowed })}
        </div>
      )}
    </div>
  );
};
