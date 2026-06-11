import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { DeliveryDaysSelector } from 'components/settings/email-delivery/DeliveryDaysSelector';
import { DeliveryTimesManager } from 'components/settings/email-delivery/DeliveryTimesManager';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

const TimezoneSelectorSection: React.FC<{ timezone: string; onChange: (tz: string) => void }> = ({
  timezone,
  onChange,
}) => {
  const { t } = useTranslation();
  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <label
        style={{
          display: 'block',
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('settings.delivery.timezone')}
      </label>
      <select
        value={timezone}
        onChange={event => onChange(event.target.value)}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          fontSize: theme.typography.fontSize.sm,
          backgroundColor: theme.colors.background.paper,
          color: theme.colors.text.primary,
          minWidth: '250px',
        }}
      >
        {TIMEZONE_OPTIONS.map(tz => (
          <option key={tz} value={tz}>
            {tz.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </div>
  );
};

const TIMEZONE_OPTIONS: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Kolkata',
      'Australia/Sydney',
      'Australia/Melbourne',
      'Pacific/Auckland',
    ];
  }
})();

interface BatchSchedule {
  deliveryDays: number[];
  deliveryTimes: string[];
  timezone: string;
  isEnabled: boolean;
  urgentBypassSchedule: boolean;
}

interface EmailBatchingSectionProps {
  batchSchedule: BatchSchedule;
  newDeliveryTime: string;
  onBatchScheduleChange: (schedule: BatchSchedule) => void;
  onNewDeliveryTimeChange: (time: string) => void;
  onSaveBatchSchedule: (schedule: BatchSchedule) => Promise<boolean>;
}

export const EmailBatchingSection: React.FC<EmailBatchingSectionProps> = ({
  batchSchedule,
  newDeliveryTime,
  onBatchScheduleChange,
  onNewDeliveryTimeChange,
  onSaveBatchSchedule,
}) => {
  const { t } = useTranslation();

  const handleUpdateBatchSchedule = async () => {
    const saved = await onSaveBatchSchedule(batchSchedule);
    if (saved) {
      alert(t('settings.batchScheduleUpdated') || 'Delivery schedule updated!');
    } else {
      alert(t('settings.batchScheduleError') || 'Failed to update delivery schedule');
    }
  };

  const toggleDeliveryDay = (day: number) => {
    onBatchScheduleChange({
      ...batchSchedule,
      deliveryDays: batchSchedule.deliveryDays.includes(day)
        ? batchSchedule.deliveryDays.filter(dayItem => dayItem !== day)
        : [...batchSchedule.deliveryDays, day].sort((itemA, itemB) => itemA - itemB),
    });
  };

  const addDeliveryTime = () => {
    if (!newDeliveryTime || batchSchedule.deliveryTimes.includes(newDeliveryTime)) {
      return;
    }
    onBatchScheduleChange({
      ...batchSchedule,
      deliveryTimes: [...batchSchedule.deliveryTimes, newDeliveryTime].sort(),
    });
    onNewDeliveryTimeChange('');
  };

  const removeDeliveryTime = (time: string) => {
    onBatchScheduleChange({
      ...batchSchedule,
      deliveryTimes: batchSchedule.deliveryTimes.filter(timeItem => timeItem !== time),
    });
  };

  return (
    <div
      id="email-batching"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.lg,
        boxShadow: theme.shadows.md,
      }}
    >
      <h3
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.xl,
          scrollMarginTop: `${INPUT_WIDTH_PX}px`,
        }}
      >
        {t('settings.emailBatching.title', { defaultValue: 'Email Delivery Schedule' })}
      </h3>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.lg,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('settings.emailBatching.description')}
      </p>

      <DeliveryDaysSelector deliveryDays={batchSchedule.deliveryDays} onToggleDay={toggleDeliveryDay} />

      <DeliveryTimesManager
        deliveryTimes={batchSchedule.deliveryTimes}
        newDeliveryTime={newDeliveryTime}
        onNewDeliveryTimeChange={onNewDeliveryTimeChange}
        onAddTime={addDeliveryTime}
        onRemoveTime={removeDeliveryTime}
      />

      <TimezoneSelectorSection
        timezone={batchSchedule.timezone}
        onChange={tz => onBatchScheduleChange({ ...batchSchedule, timezone: tz })}
      />

      <button
        onClick={handleUpdateBatchSchedule}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('common.save')}
      </button>
    </div>
  );
};
