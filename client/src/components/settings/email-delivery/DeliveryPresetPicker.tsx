import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';

import { DELIVERY_PRESET_IDS, DeliveryPresetId } from './deliverySchedule.helpers';

interface DeliveryPresetPickerProps {
  /** The preset the schedule matches, or null for a schedule the user set by hand. */
  activePreset: DeliveryPresetId | null;
  onPick: (presetId: DeliveryPresetId) => void;
}

/** Calm / Balanced / Always on, as one radio group: one choice instead of days and times (#482). */
export const DeliveryPresetPicker: React.FC<DeliveryPresetPickerProps> = ({ activePreset, onPick }) => {
  const { t } = useTranslation();

  return (
    <fieldset style={{ border: 'none', margin: `0 0 ${theme.spacing.md}`, padding: 0, minWidth: 0 }}>
      <legend
        style={{
          padding: 0,
          marginBottom: theme.spacing.sm,
          color: theme.colors.text.primary,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('settings.delivery.presets.label')}
      </legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {DELIVERY_PRESET_IDS.map(presetId => {
          const isActive = presetId === activePreset;
          return (
            <label
              key={presetId}
              style={{
                flex: '1 1 160px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: theme.spacing.sm,
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                border: `1px solid ${isActive ? theme.colors.primary.main : theme.colors.border.medium}`,
                // A second inner line marks the choice without the card changing size.
                boxShadow: isActive ? `inset 0 0 0 1px ${theme.colors.primary.main}` : 'none',
                borderRadius: theme.borderRadius.md,
                backgroundColor: isActive ? theme.colors.primary.subtle : COLOR_TRANSPARENT,
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="delivery-preset"
                value={presetId}
                checked={isActive}
                onChange={() => onPick(presetId)}
                style={{ marginTop: '3px', accentColor: theme.colors.primary.main }}
              />
              <span>
                <span
                  style={{
                    display: 'block',
                    color: theme.colors.text.primary,
                    fontWeight: theme.typography.fontWeight.semibold,
                  }}
                >
                  {t(`settings.delivery.presets.${presetId}.label`)}
                </span>
                <span
                  style={{
                    display: 'block',
                    color: theme.colors.text.secondary,
                    fontSize: theme.typography.fontSize.sm,
                  }}
                >
                  {t(`settings.delivery.presets.${presetId}.hint`)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};
