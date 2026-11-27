import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import type { BatchSchedule } from 'hooks/settings/useBatchSchedule';

import { describeDeliverySchedule } from './deliverySchedule.helpers';

interface DeliveryScheduleSummaryProps {
  schedule: BatchSchedule;
  isEditing: boolean;
  /** Id of the days/times/time zone editor that "Change" opens. */
  editorId: string;
  onToggleEditing: () => void;
}

/** The schedule as one plain sentence, with one "Change" button for the details (#482). */
export const DeliveryScheduleSummary: React.FC<DeliveryScheduleSummaryProps> = ({
  schedule,
  isEditing,
  editorId,
  onToggleEditing,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.lg,
      }}
    >
      <p
        style={{
          flex: '1 1 260px',
          margin: 0,
          color: theme.colors.text.primary,
          lineHeight: theme.typography.lineHeight.normal,
        }}
      >
        {describeDeliverySchedule(schedule, t)}
      </p>
      <button
        type="button"
        aria-expanded={isEditing}
        aria-controls={editorId}
        onClick={onToggleEditing}
        style={{
          flexShrink: 0,
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.primary,
          fontWeight: theme.typography.fontWeight.medium,
          cursor: 'pointer',
        }}
      >
        {isEditing ? t('settings.delivery.done') : t('settings.delivery.change')}
      </button>
    </div>
  );
};
