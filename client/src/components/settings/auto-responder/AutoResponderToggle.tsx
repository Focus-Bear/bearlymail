import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface AutoResponderToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const AutoResponderToggle: React.FC<AutoResponderToggleProps> = ({ enabled, onToggle }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: theme.spacing.md,
        backgroundColor: enabled ? theme.colors.success.light : theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${enabled ? theme.colors.success.main : theme.colors.border.light}`,
      }}
    >
      <div>
        <div
          style={{
            ...theme.typography.body.xLarge,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}
        >
          {enabled ? t('settings.autoResponder.enabled') : t('settings.autoResponder.disabled')}
        </div>
        <div
          style={{
            ...theme.typography.body.large,
            color: theme.colors.text.secondary,
            marginTop: theme.spacing.xs,
          }}
        >
          {enabled ? t('settings.autoResponder.enabledDesc') : t('settings.autoResponder.disabledDesc')}
        </div>
      </div>

      <button
        onClick={() => onToggle(!enabled)}
        style={{
          position: 'relative',
          width: '56px',
          height: '28px',
          backgroundColor: enabled ? theme.colors.success.main : theme.colors.greyscale[400],
          borderRadius: theme.borderRadius.full,
          border: STRING_NONE,
          cursor: 'pointer',
          transition: theme.transitions.default,
          flexShrink: 0,
        }}
        aria-label={enabled ? t('settings.autoResponder.disableA11y') : t('settings.autoResponder.enableA11y')}
      >
        <div
          style={{
            position: 'absolute',
            top: '2px',
            left: enabled ? '30px' : '2px',
            width: '24px',
            height: '24px',
            backgroundColor: COLOR_NAMED_WHITE,
            borderRadius: '50%',
            transition: theme.transitions.default,
            boxShadow: theme.shadows.sm,
          }}
        />
      </button>
    </div>
  );
};
