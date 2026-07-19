import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { humanizeDuration, PreviewKeys } from 'utils/parseDuration';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { KEY_ENTER, KEY_ESCAPE, STRING_NONE } from 'constants/strings';

// "Reappears …" wording for the live preview; mirrors the same date/time
// resolution the server uses to schedule the snooze.
const SNOOZE_PREVIEW_KEYS: PreviewKeys = {
  today: 'emailActions.snoozePreviewToday',
  tomorrow: 'emailActions.snoozePreviewTomorrow',
  date: 'emailActions.snoozePreviewDate',
};

const labelStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.secondary,
  whiteSpace: 'nowrap',
};

const inputStyle: React.CSSProperties = {
  padding: theme.spacing.xs,
  borderRadius: theme.borderRadius.sm,
  border: `1px solid ${theme.colors.primary.main}`,
  fontSize: theme.typography.fontSize.sm,
  width: '120px',
  outline: 'none',
};

const cancelButtonStyle: React.CSSProperties = {
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  borderRadius: theme.borderRadius.sm,
  backgroundColor: COLOR_TRANSPARENT,
  color: theme.colors.text.secondary,
  border: STRING_NONE,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.xs,
};

const previewStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.tertiary,
};

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
  const { t, i18n } = useTranslation();
  const hasValue = snoozeValue?.trim();
  const preview = useMemo(
    () => humanizeDuration(snoozeValue, i18n.language, undefined, SNOOZE_PREVIEW_KEYS),
    [snoozeValue, i18n.language]
  );
  const humanizedPreview = preview ? t(preview.i18nKey, preview.values) : null;

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
      <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
        <span style={labelStyle} title={t('emailActions.snoozeTooltip')}>
          {t('emailActions.snoozeUntil')}
        </span>
        <input
          type="text"
          placeholder={t('emailActions.snoozePlaceholder')}
          autoFocus
          value={snoozeValue}
          onChange={event => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          title={t('emailActions.snoozeTooltip')}
          style={inputStyle}
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
            backgroundColor: hasValue
              ? theme.colors.primary.main
              : theme.colors.background.subtle,
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
            captureEvent(ANALYTICS_EVENTS.EMAIL_SNOOZE_CANCELLED, { email_id: email.id });
            onCancel();
          }}
          style={cancelButtonStyle}
        >
          {t('common.cancel')}
        </button>
      </div>
      {humanizedPreview && (
        <span data-testid="snooze-humanized-preview" style={previewStyle}>
          {humanizedPreview}
        </span>
      )}
    </div>
  );
};
