import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { AUTO_RESPONDER_DELIVERY_MODES, AutoResponderDeliveryMode } from './types';

interface AutoResponderDeliverySettingsProps {
  deliveryMode: AutoResponderDeliveryMode;
  onChange: (deliveryMode: AutoResponderDeliveryMode) => void;
}

const DELIVERY_OPTIONS: Array<{ mode: AutoResponderDeliveryMode; labelKey: string; descKey: string }> = [
  {
    mode: AUTO_RESPONDER_DELIVERY_MODES.DRAFT,
    labelKey: 'settings.autoResponder.delivery.draftLabel',
    descKey: 'settings.autoResponder.delivery.draftDesc',
  },
  {
    mode: AUTO_RESPONDER_DELIVERY_MODES.AUTO_SEND_KNOWN_SENDERS,
    labelKey: 'settings.autoResponder.delivery.autoLabel',
    descKey: 'settings.autoResponder.delivery.autoDesc',
  },
];

/**
 * Lets the user choose between reviewing every auto-response as a draft and
 * sending automatically to known senders (unknown senders still get a draft).
 */
export const AutoResponderDeliverySettings: React.FC<AutoResponderDeliverySettingsProps> = ({
  deliveryMode,
  onChange,
}) => {
  const { t } = useTranslation();

  return (
    <fieldset
      style={{
        marginTop: theme.spacing.lg,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        border: 'none',
        minWidth: 0,
      }}
    >
      <legend
        style={{
          ...theme.typography.heading.h6,
          color: theme.colors.text.primary,
          float: 'left',
          width: '100%',
          padding: 0,
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('settings.autoResponder.delivery.title')}
      </legend>

      <p
        style={{
          ...theme.typography.body.large,
          color: theme.colors.text.secondary,
          clear: 'both',
          marginTop: 0,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('settings.autoResponder.delivery.description')}
      </p>

      {DELIVERY_OPTIONS.map(option => {
        const selected = deliveryMode === option.mode;
        return (
          <label
            key={option.mode}
            data-testid={`auto-responder-delivery-${option.mode}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: theme.spacing.sm,
              cursor: 'pointer',
              padding: theme.spacing.sm,
              marginBottom: theme.spacing.sm,
              borderRadius: theme.borderRadius.sm,
              backgroundColor: theme.colors.background.paper,
              border: `1px solid ${selected ? theme.colors.primary.main : theme.colors.border.light}`,
            }}
          >
            <input
              type="radio"
              name="auto-responder-delivery-mode"
              value={option.mode}
              checked={selected}
              onChange={() => onChange(option.mode)}
              style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: theme.colors.primary.main }}
            />
            <span>
              <span
                style={{
                  ...theme.typography.body.xLarge,
                  display: 'block',
                  fontWeight: theme.typography.fontWeight.medium,
                  color: theme.colors.text.primary,
                }}
              >
                {t(option.labelKey)}
              </span>
              <span style={{ ...theme.typography.body.medium, display: 'block', color: theme.colors.text.secondary }}>
                {t(option.descKey)}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
};
