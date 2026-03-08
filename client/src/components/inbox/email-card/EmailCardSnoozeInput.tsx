import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

interface EmailCardSnoozeInputProps {
  snoozeInput: string;
  onSnoozeInputChange: (value: string) => void;
  onSnooze: () => void;
  onHideSnoozeInput: () => void;
}

/**
 * Email card snooze input component
 * Handles snooze input field and actions
 */
export const EmailCardSnoozeInput: React.FC<EmailCardSnoozeInputProps> = ({
  snoozeInput,
  onSnoozeInputChange,
  onSnooze,
  onHideSnoozeInput,
}) => {
  const { t } = useTranslation();

  const getButtonBackgroundColor = (): string => {
    if (snoozeInput.trim()) {
      return theme.colors.primary.main;
    }
    return theme.colors.background.subtle;
  };

  const getButtonColor = (): string => {
    if (snoozeInput.trim()) {
      return 'white';
    }
    return theme.colors.text.tertiary;
  };

  const isButtonDisabled = (): boolean => {
    return !snoozeInput.trim();
  };

  return (
    <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
      <input
        type="text"
        placeholder={t('emailActions.snoozePlaceholder')}
        autoFocus
        value={snoozeInput}
        onChange={event => onSnoozeInputChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === KEY_ENTER) {
            event.preventDefault();
            if (snoozeInput.trim()) {
              onSnooze();
            }
          }
          if (event.key === KEY_ESCAPE) {
            onHideSnoozeInput();
          }
        }}
        style={{
          padding: theme.spacing.xs,
          borderRadius: theme.borderRadius.sm,
          border: `1px solid ${theme.colors.primary.main}`,
          fontSize: theme.typography.fontSize.sm,
          width: '100px',
          outline: 'none',
        }}
      />
      <button
        onClick={() => {
          if (snoozeInput.trim()) {
            onSnooze();
          }
        }}
        disabled={isButtonDisabled()}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          backgroundColor: getButtonBackgroundColor(),
          color: getButtonColor(),
          border: STRING_NONE,
          cursor: isButtonDisabled() ? 'not-allowed' : 'pointer',
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.medium,
          opacity: isButtonDisabled() ? OPACITY_DISABLED : OPACITY_FULL,
        }}
      >
        {t('common.confirm')}
      </button>
      <button
        onClick={onHideSnoozeInput}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: STRING_NONE,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.xs,
        }}
      >
        {t('common.cancel')}
      </button>
    </div>
  );
};
