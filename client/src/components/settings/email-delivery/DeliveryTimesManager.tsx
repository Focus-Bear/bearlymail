import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CLOSE } from 'constants/emojis';

import { formatTime12h } from './deliveryTimesManager.helpers';

interface DeliveryTimesManagerProps {
  deliveryTimes: string[];
  newDeliveryTime: string;
  onNewDeliveryTimeChange: (time: string) => void;
  onAddTime: () => void;
  onRemoveTime: (time: string) => void;
}

export const DeliveryTimesManager: React.FC<DeliveryTimesManagerProps> = ({
  deliveryTimes,
  newDeliveryTime,
  onNewDeliveryTimeChange,
  onAddTime,
  onRemoveTime,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <label
        style={{
          color: theme.colors.text.primary,
          fontWeight: theme.typography.fontWeight.medium,
          display: 'block',
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('settings.delivery.times.label')}
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
        {deliveryTimes.map(time => (
          <div
            key={time}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              backgroundColor: theme.colors.primary.subtle,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.primary.light}`,
            }}
          >
            <span
              style={{
                color: theme.colors.primary.dark,
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {formatTime12h(time)}
            </span>
            <button
              onClick={() => onRemoveTime(time)}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.colors.primary.dark,
                cursor: 'pointer',
                padding: '2px',
                fontSize: theme.typography.fontSize.sm,
                lineHeight: 1,
              }}
              title={t('settings.delivery.times.removeTime')}
            >
              {EMOJI_CLOSE}
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
        <input
          type="time"
          value={newDeliveryTime}
          onChange={event => onNewDeliveryTimeChange(event.target.value)}
          style={{
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
          }}
        />
        <button
          onClick={onAddTime}
          disabled={!newDeliveryTime}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: newDeliveryTime ? theme.colors.secondary.main : theme.colors.background.subtle,
            color: newDeliveryTime ? 'white' : theme.colors.text.disabled,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: newDeliveryTime ? 'pointer' : 'not-allowed',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('settings.delivery.times.addTime')}
        </button>
      </div>
    </div>
  );
};
