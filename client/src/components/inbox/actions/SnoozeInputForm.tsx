import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

interface SnoozeInputFormProps {
  email: Email;
  snoozeValue: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const SnoozeInputForm: React.FC<SnoozeInputFormProps> = ({
  email,
  snoozeValue,
  onValueChange,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const hasValue = snoozeValue?.trim();

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === KEY_ENTER) {
      event.preventDefault();
      if (hasValue) {
        onConfirm();
      }
    }
    if (event.key === KEY_ESCAPE) {
      onCancel();
    }
  };

  return (
    <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
      <span 
        style={{ 
          fontSize: theme.typography.fontSize.xs, 
          color: theme.colors.text.secondary,
          whiteSpace: 'nowrap',
        }}
        title={t('emailActions.snoozeTooltip')}
      >
        {t('emailActions.snoozeUntil')}
      </span>
      <input
        type="text"
        placeholder={t('emailActions.snoozePlaceholder')}
        autoFocus
        value={snoozeValue}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={handleKeyDown}
        title={t('emailActions.snoozeTooltip')}
        style={{
          padding: theme.spacing.xs,
          borderRadius: theme.borderRadius.sm,
          border: `1px solid ${theme.colors.primary.main}`,
          fontSize: theme.typography.fontSize.sm,
          width: '120px',
          outline: 'none',
        }}
      />
      <button
        onClick={() => {
          if (hasValue) {
            onConfirm();
          }
        }}
        disabled={!hasValue}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          backgroundColor: hasValue ? theme.colors.primary.main : theme.colors.background.subtle,
          color: hasValue ? 'white' : theme.colors.text.tertiary,
          border: STRING_NONE,
          cursor: hasValue ? 'pointer' : 'not-allowed',
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.medium,
          opacity: hasValue ? OPACITY_FULL : OPACITY_DISABLED,
        }}
      >
        {t('common.confirm')}
      </button>
      <button
        onClick={() => {
          captureEvent('email_snooze_cancelled', { email_id: email.id });
          onCancel();
        }}
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



