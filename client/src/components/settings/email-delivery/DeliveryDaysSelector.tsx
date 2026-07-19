import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface DeliveryDaysSelectorProps {
  deliveryDays: number[];
  onToggleDay: (day: number) => void;
}

export const DeliveryDaysSelector: React.FC<DeliveryDaysSelectorProps> = ({ deliveryDays, onToggleDay }) => {
  const { t } = useTranslation();
  const DAY_NAMES = [
    t('settings.delivery.days.sun'),
    t('settings.delivery.days.mon'),
    t('settings.delivery.days.tue'),
    t('settings.delivery.days.wed'),
    t('settings.delivery.days.thu'),
    t('settings.delivery.days.fri'),
    t('settings.delivery.days.sat'),
  ];

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
        {t('settings.delivery.days.label')}
      </label>
      <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        {DAY_NAMES.map((name, index) => (
          <button
            key={name}
            onClick={() => onToggleDay(index)}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: deliveryDays.includes(index)
                ? theme.colors.primary.main
                : theme.colors.background.subtle,
              color: deliveryDays.includes(index) ? 'white' : theme.colors.text.secondary,
              border: `1px solid ${
                deliveryDays.includes(index) ? theme.colors.primary.main : theme.colors.border.medium
              }`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontWeight: theme.typography.fontWeight.medium,
              transition: theme.transitions.fast,
              minWidth: '50px',
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <p
        style={{
          color: theme.colors.text.tertiary,
          fontSize: theme.typography.fontSize.xs,
          marginTop: theme.spacing.xs,
        }}
      >
        {t('settings.delivery.days.description')}
      </p>
    </div>
  );
};
