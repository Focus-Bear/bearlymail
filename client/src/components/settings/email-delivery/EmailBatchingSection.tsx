import React from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { DeliveryDaysSelector } from 'components/settings/email-delivery/DeliveryDaysSelector';
import { DeliveryTimesManager } from 'components/settings/email-delivery/DeliveryTimesManager';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
}

export const EmailBatchingSection: React.FC<EmailBatchingSectionProps> = ({
  batchSchedule,
  newDeliveryTime,
  onBatchScheduleChange,
  onNewDeliveryTimeChange,
}) => {
  const { t } = useTranslation();

  const handleUpdateBatchSchedule = async () => {
    try {
      await axios.put(`${API_URL}/batch-schedule`, batchSchedule);
      alert(t('settings.batchScheduleUpdated') || 'Delivery schedule updated!');
    } catch (error) {
      console.error('Error updating batch schedule:', error);
      alert(t('settings.batchScheduleError') || 'Failed to update delivery schedule');
    }
  };

  const toggleDeliveryDay = (day: number) => {
    onBatchScheduleChange({
      ...batchSchedule,
      deliveryDays: batchSchedule.deliveryDays.includes(day)
        ? batchSchedule.deliveryDays.filter(dayItem => dayItem !== day)
        : [...batchSchedule.deliveryDays, day].sort((a, b) => a - b),
    });
  };

  const addDeliveryTime = () => {
    if (!newDeliveryTime || batchSchedule.deliveryTimes.includes(newDeliveryTime)) return;
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
    <div id="email-batching" style={{
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
        {t('settings.emailBatching.title') || 'Email Delivery Schedule'}
      </h3>
      <p style={{
        color: theme.colors.text.secondary,
        marginBottom: theme.spacing.lg,
        fontSize: theme.typography.fontSize.sm,
      }}>
        {t('settings.emailBatching.description')}
      </p>

      <DeliveryDaysSelector
        deliveryDays={batchSchedule.deliveryDays}
        onToggleDay={toggleDeliveryDay}
      />

      <DeliveryTimesManager
        deliveryTimes={batchSchedule.deliveryTimes}
        newDeliveryTime={newDeliveryTime}
        onNewDeliveryTimeChange={onNewDeliveryTimeChange}
        onAddTime={addDeliveryTime}
        onRemoveTime={removeDeliveryTime}
      />

      <div style={{ marginBottom: theme.spacing.lg }}>
        <label style={{ 
          color: theme.colors.text.secondary, 
          fontSize: theme.typography.fontSize.sm,
        }}>
          {t('settings.delivery.timezone')}: {batchSchedule.timezone}
        </label>
      </div>

      <button
        onClick={handleUpdateBatchSchedule}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          backgroundColor: theme.colors.primary.main,
          color: 'white',
          border: 'none',
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


