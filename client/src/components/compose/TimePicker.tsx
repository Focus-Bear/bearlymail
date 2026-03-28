/* eslint-disable max-lines-per-function */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';
import { TimeSuggestion } from 'hooks/useScheduledEmails';

const OPACITY_DISABLED = 0.5;
const WARNING_ICON = '⚠️';

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
  customDate: string;
  customTime: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onSubmit: () => void;
  t: (key: string) => string;
}

const CustomTimeForm: React.FC<CustomTimeFormProps> = ({
  customDate,
  customTime,
  onDateChange,
  onTimeChange,
  onSubmit,
  t,
}) => (
  <div style={{ marginBottom: theme.spacing.md }}>
    <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
      <input
        type="date"
        value={customDate}
        onChange={event => onDateChange(event.target.value)}
        style={{
          flex: 1,
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.background.subtle,
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.sm,
        }}
      />
      <input
        type="time"
        value={customTime}
        onChange={event => onTimeChange(event.target.value)}
        style={{
          flex: 1,
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.background.subtle,
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.sm,
        }}
      />
    </div>
    <button
      onClick={onSubmit}
      disabled={!customDate || !customTime}
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        backgroundColor: theme.colors.primary.main,
        color: COLOR_NAMED_WHITE,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.md,
        cursor: customDate && customTime ? 'pointer' : 'not-allowed',
        opacity: customDate && customTime ? 1 : OPACITY_DISABLED,
        width: '100%',
        fontSize: theme.typography.fontSize.sm,
        fontWeight: theme.typography.fontWeight.medium,
      }}
    >
      {t('compose.setCustomTime')}
    </button>
  </div>
);

export const TimePicker: React.FC<TimePickerProps> = ({
  selectedTime,
  suggestions,
  onTimeSelect,
  onCancel,
  warning,
  suggestedTime,
  onOverride,
  lastSelectedTime,
}) => {
  const { t } = useTranslation();
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (selectedTime) {
      const date = new Date(selectedTime);
      setCustomDate(date.toISOString().split('T')[0]);
      setCustomTime(date.toTimeString().slice(0, 5));
    }
  }, [selectedTime]);

  const handleSuggestionClick = (suggestion: TimeSuggestion) => {
    onTimeSelect(new Date(suggestion.value));
  };
  const handleCustomTimeSubmit = () => {
    if (customDate && customTime) {
      onTimeSelect(new Date(`${customDate}T${customTime}`));
    }
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
          <CustomTimeForm
            customDate={customDate}
            customTime={customTime}
            onDateChange={setCustomDate}
            onTimeChange={setCustomTime}
            onSubmit={handleCustomTimeSubmit}
            t={t}
          />
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
