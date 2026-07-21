/* eslint-disable max-lines-per-function */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { humanizeDuration, parseDurationToDate, PreviewKeys } from 'utils/parseDuration';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { KEY_ENTER, STRING_NONE } from 'constants/strings';
import { TimeSuggestion } from 'hooks/useScheduledEmails';

const OPACITY_DISABLED = 0.5;
const WARNING_ICON = '⚠️';

// "Sends …" wording for the live preview of the typed custom time; mirrors the
// snooze input's natural-language preview so both features feel the same.
const SCHEDULE_PREVIEW_KEYS: PreviewKeys = {
  today: 'compose.schedulePreviewToday',
  tomorrow: 'compose.schedulePreviewTomorrow',
  date: 'compose.schedulePreviewDate',
};

interface TimePickerProps {
  selectedTime: Date | null;
  suggestions: TimeSuggestion[];
  onTimeSelect: (time: Date) => void;
  onCancel: () => void;
  warning?: string;
  suggestedTime?: Date;
  onOverride?: (time: Date) => void;
  lastSelectedTime?: Date;
}

interface WarningBannerProps {
  warning: string;
  suggestedTime?: Date;
  onUseSuggestion: () => void;
  onOverride?: () => void;
  t: (key: string) => string;
}

const WarningBanner: React.FC<WarningBannerProps> = ({ warning, suggestedTime, onUseSuggestion, onOverride, t }) => (
  <div
    style={{
      backgroundColor: theme.colors.warning.light,
      border: `1px solid ${theme.colors.warning.main}`,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    }}
  >
    <p style={{ margin: 0, color: theme.colors.text.primary, fontSize: theme.typography.fontSize.sm }}>
      {WARNING_ICON} {warning}
    </p>
    {suggestedTime && (
      <button
        onClick={onUseSuggestion}
        style={{
          marginTop: theme.spacing.sm,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {t('compose.useSuggestion')} ({new Date(suggestedTime).toLocaleString()})
      </button>
    )}
    {onOverride && (
      <button
        onClick={onOverride}
        style={{
          marginTop: theme.spacing.sm,
          marginLeft: suggestedTime ? theme.spacing.sm : 0,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.sm,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
          opacity: 0.8,
        }}
      >
        {t('compose.sendAnywayOverride')}
      </button>
    )}
  </div>
);

interface CustomTimeFormProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (date: Date) => void;
}

/**
 * Natural-language time input for scheduling — mirrors the snooze input: type a
 * human string ("tomorrow 9am", "in 2 hours"), see a live preview of the
 * resolved time, press Enter to submit, and "Set Time" stays disabled until the
 * text parses to a valid future date.
 */
const CustomTimeForm: React.FC<CustomTimeFormProps> = ({ value, onChange, onSubmit }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const parsedDate = useMemo(() => parseDurationToDate(value, new Date(), locale), [value, locale]);
  const isFuture = parsedDate !== null && parsedDate.getTime() > Date.now();
  const canSubmit = parsedDate !== null && isFuture;
  const preview = useMemo(
    () => humanizeDuration(value, locale, new Date(), SCHEDULE_PREVIEW_KEYS),
    [value, locale]
  );
  const humanizedPreview = preview ? t(preview.i18nKey, preview.values) : null;
  const hasText = value.trim().length > 0;

  const submit = () => {
    if (canSubmit && parsedDate) {
      onSubmit(parsedDate);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === KEY_ENTER) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <input
        type="text"
        autoFocus
        placeholder={t('compose.customTimePlaceholder')}
        title={t('compose.customTimeTooltip')}
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: theme.spacing.sm,
          marginBottom: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.background.subtle,
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.sm,
        }}
      />
      {humanizedPreview && (
        <div
          data-testid="schedule-humanized-preview"
          style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
            marginBottom: theme.spacing.sm,
          }}
        >
          {humanizedPreview}
        </div>
      )}
      {hasText && !canSubmit && (
        <div
          data-testid="schedule-invalid-hint"
          style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.sm,
          }}
        >
          {parsedDate && !isFuture ? t('compose.customTimePast') : t('compose.customTimeInvalid')}
        </div>
      )}
      <button
        onClick={submit}
        disabled={!canSubmit}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          opacity: canSubmit ? 1 : OPACITY_DISABLED,
          width: '100%',
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('compose.setCustomTime')}
      </button>
    </div>
  );
};

export const TimePicker: React.FC<TimePickerProps> = ({
  suggestions,
  onTimeSelect,
  onCancel,
  warning,
  suggestedTime,
  onOverride,
  lastSelectedTime,
}) => {
  const { t } = useTranslation();
  const [customTimeInput, setCustomTimeInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handleSuggestionClick = (suggestion: TimeSuggestion) => {
    onTimeSelect(new Date(suggestion.value));
  };
  const handleUseSuggestion = () => {
    if (suggestedTime) {
      onTimeSelect(suggestedTime);
    }
  };
  const handleOverride = () => {
    if (onOverride && lastSelectedTime) {
      onOverride(lastSelectedTime);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: theme.shadows.xl,
        }}
        onClick={event => event.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, color: theme.colors.text.primary, fontSize: theme.typography.fontSize.xl }}>
          {t('compose.scheduleEmail')}
        </h3>
        {warning && (
          <WarningBanner
            warning={warning}
            suggestedTime={suggestedTime}
            onUseSuggestion={handleUseSuggestion}
            onOverride={onOverride && lastSelectedTime ? handleOverride : undefined}
            t={t}
          />
        )}
        <div style={{ marginBottom: theme.spacing.md }}>
          <h4
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              marginBottom: theme.spacing.sm,
            }}
          >
            {t('compose.quickOptions')}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            {suggestions.map(suggestion => (
              <button
                key={suggestion.label}
                onClick={() => handleSuggestionClick(suggestion)}
                style={{
                  padding: theme.spacing.md,
                  backgroundColor: theme.colors.background.subtle,
                  border: `1px solid ${theme.colors.border.light}`,
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: theme.transitions.default,
                }}
                onMouseEnter={event => {
                  event.currentTarget.style.backgroundColor = theme.colors.interactive.hover;
                }}
                onMouseLeave={event => {
                  event.currentTarget.style.backgroundColor = theme.colors.background.subtle;
                }}
              >
                <div style={{ fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary }}>
                  {suggestion.label}
                </div>
                <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
                  {suggestion.description}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: theme.spacing.md }}>
          <button
            onClick={() => setShowCustom(!showCustom)}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: COLOR_TRANSPARENT,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              color: theme.colors.text.secondary,
              width: '100%',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {showCustom ? t('compose.hideCustomTime') : t('compose.customTime')}
          </button>
        </div>
        {showCustom && (
          <CustomTimeForm value={customTimeInput} onChange={setCustomTimeInput} onSubmit={onTimeSelect} />
        )}
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: theme.spacing.sm,
              backgroundColor: theme.colors.background.subtle,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
