import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { DeliveryDaysSelector } from 'components/settings/email-delivery/DeliveryDaysSelector';
import { DeliveryTimesManager } from 'components/settings/email-delivery/DeliveryTimesManager';
import { SaveStatus } from 'components/settings/SaveStatus';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { SETTINGS_ANCHORS } from 'constants/settingsAnchors';
import type { BatchSchedule } from 'hooks/settings/useBatchSchedule';
import { useAutosave } from 'hooks/useAutosave';

import { DeliveryPresetPicker } from './DeliveryPresetPicker';
import { activeDeliveryPreset, applyDeliveryPreset, canSaveDeliverySchedule } from './deliverySchedule.helpers';
import { DeliveryScheduleSummary } from './DeliveryScheduleSummary';
import { DeliveryTimezoneSelect } from './DeliveryTimezoneSelect';

interface EmailBatchingSectionProps {
  batchSchedule: BatchSchedule;
  newDeliveryTime: string;
  onBatchScheduleChange: (schedule: BatchSchedule) => void;
  onNewDeliveryTimeChange: (time: string) => void;
  onSaveBatchSchedule: (schedule: BatchSchedule) => Promise<boolean>;
}

/**
 * When non-urgent email arrives (#482): the schedule as one sentence, three
 * presets, and the exact days, times and time zone behind "Change". Every
 * change saves itself; a schedule with no day or no time waits until it has
 * both (see canSaveDeliverySchedule).
 */
export const EmailBatchingSection: React.FC<EmailBatchingSectionProps> = ({
  batchSchedule,
  newDeliveryTime,
  onBatchScheduleChange,
  onNewDeliveryTimeChange,
  onSaveBatchSchedule,
}) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const editorId = useId();
  const autosave = useAutosave<BatchSchedule>(async schedule => {
    if (!(await onSaveBatchSchedule(schedule))) {
      throw new Error('Delivery schedule was not saved');
    }
  });

  const change = (next: BatchSchedule) => {
    onBatchScheduleChange(next);
    if (canSaveDeliverySchedule(next)) {
      autosave.saveNow(next);
    }
  };

  // Setting days or times by hand means the user wants batching on.
  const editDaysOrTimes = (updates: Partial<BatchSchedule>) =>
    change({ ...batchSchedule, ...updates, isEnabled: true });

  const toggleDeliveryDay = (day: number) =>
    editDaysOrTimes({
      deliveryDays: batchSchedule.deliveryDays.includes(day)
        ? batchSchedule.deliveryDays.filter(dayItem => dayItem !== day)
        : [...batchSchedule.deliveryDays, day].sort((itemA, itemB) => itemA - itemB),
    });

  const addDeliveryTime = () => {
    if (!newDeliveryTime || batchSchedule.deliveryTimes.includes(newDeliveryTime)) {
      return;
    }
    editDaysOrTimes({ deliveryTimes: [...batchSchedule.deliveryTimes, newDeliveryTime].sort() });
    onNewDeliveryTimeChange('');
  };

  const removeDeliveryTime = (time: string) =>
    editDaysOrTimes({ deliveryTimes: batchSchedule.deliveryTimes.filter(timeItem => timeItem !== time) });

  return (
    <div
      id={SETTINGS_ANCHORS.EMAIL_BATCHING}
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.lg,
        boxShadow: theme.shadows.md,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: theme.spacing.sm,
          flexWrap: 'wrap',
          marginBottom: theme.spacing.md,
        }}
      >
        <h3
          style={{
            color: theme.colors.text.primary,
            margin: 0,
            fontSize: theme.typography.fontSize.xl,
            scrollMarginTop: `${INPUT_WIDTH_PX}px`,
          }}
        >
          {t('settings.emailBatching.title')}
        </h3>
        <SaveStatus status={autosave.status} onRetry={autosave.retry} />
      </div>

      <DeliveryScheduleSummary
        schedule={batchSchedule}
        isEditing={isEditing}
        editorId={editorId}
        onToggleEditing={() => setIsEditing(previous => !previous)}
      />

      <DeliveryPresetPicker
        activePreset={activeDeliveryPreset(batchSchedule)}
        onPick={presetId => change(applyDeliveryPreset(batchSchedule, presetId))}
      />

      <div id={editorId} hidden={!isEditing} style={{ paddingTop: theme.spacing.sm }}>
        <DeliveryDaysSelector deliveryDays={batchSchedule.deliveryDays} onToggleDay={toggleDeliveryDay} />
        <DeliveryTimesManager
          deliveryTimes={batchSchedule.deliveryTimes}
          newDeliveryTime={newDeliveryTime}
          onNewDeliveryTimeChange={onNewDeliveryTimeChange}
          onAddTime={addDeliveryTime}
          onRemoveTime={removeDeliveryTime}
        />
        <DeliveryTimezoneSelect
          timezone={batchSchedule.timezone}
          onChange={timezone => change({ ...batchSchedule, timezone })}
        />
      </div>
    </div>
  );
};
